/**
 * scripts/lib/bunny-storage.ts
 *
 * The Bunny storage-zone client the CDN migration scripts share. Extracted per
 * the #296 review after the same seven functions were copied verbatim into a
 * fourth script (migrate-legacy-photos.ts, migrate-renamed-species-photos.ts,
 * migrate-merged-species-photos.ts, …); the copies stay as they are — they are
 * finished one-offs — and new scripts use this instead.
 *
 * Everything here is additive: there is no delete anywhere in this module, by
 * design (ADR 0008 — the zone is shared with the photo originals; no migration
 * may ever grow a syncing delete).
 *
 * The hard-won behaviors carried over from the copies:
 * - `fetch` has no default timeout, so every request gets one — a stalled
 *   connection otherwise hangs a whole migration behind one pooled worker.
 * - Existence checks are directory walks, never per-object HEADs: the storage
 *   API answers **401** to a HEAD (not 404, not 200), so `HEAD -> res.ok`
 *   silently reports every target absent and a migration re-copies its whole
 *   plan each run.
 * - Walks return sizes, not just keys, so an aborted PUT (short object under
 *   the right name) is re-copied rather than skipped forever.
 */

export interface BunnyStorageConfig {
  /** Storage API host, e.g. la.storage.bunnycdn.com */
  host: string;
  /** Storage zone name, e.g. pnwmoths */
  zone: string;
  /** Storage-zone password (bunny.net → zone → FTP & API Access → Password). */
  password: string;
  /** Per-request ceiling in ms; default 60s. */
  requestTimeoutMs?: number;
  /** Log line prefix, e.g. "[migrate-cleopatra-photos]". */
  tag?: string;
}

export interface SurveyOptions {
  /** Directory listings in flight. Default 1 — `walk`'s original serial behavior. */
  concurrency?: number;
  /**
   * Called with each subdirectory key (trailing slash) before descending.
   * Returning false records it in `pruned` and leaves its contents unlisted.
   */
  descend?: (dirKey: string) => boolean;
}

export interface Survey {
  /** Every object reached, with its stored size. */
  files: Map<string, number>;
  /** Directories `descend` refused, with a trailing slash, in discovery order. */
  pruned: string[];
}

export interface BunnyStorage {
  /** Storage-zone URL for a key. Each path segment is encoded; the separators are not. */
  storageUrl(key: string): string;
  /** Redact the zone password from anything on its way to a log. */
  redact(msg: string): string;
  /** Every object under a prefix with its size, recursing into subdirectories. */
  walk(prefix: string): Promise<Map<string, number>>;
  /** `walk` with bounded concurrency and the option to stop at a subdirectory. */
  survey(prefix: string, options?: SurveyOptions): Promise<Survey>;
  /** Additive GET→PUT copy of one object, preserving the stored Content-Type. */
  copyObject(fromKey: string, toKey: string): Promise<void>;
  /** Five-attempt exponential backoff (2/4/8/16/32s), matching the upload scripts. */
  withRetry<T>(fn: () => Promise<T>, label: string): Promise<T>;
}

interface BunnyEntry {
  ObjectName: string;
  IsDirectory: boolean;
  Length: number;
}

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

/**
 * Rewrite the first path segment equal to `from` into `to`, leaving every other
 * segment — including filenames that merely contain the slug text — untouched.
 * This is the "only the folder changes" rule from the #266 renames: filenames
 * are historical specimen labels and rewriting them invents provenance.
 */
export function retargetSlugSegment(key: string, from: string, to: string): string {
  const segments = key.split('/');
  const i = segments.indexOf(from);
  if (i === -1) return key;
  segments[i] = to;
  return segments.join('/');
}

/** Run tasks with a fixed number in flight, preserving nothing but the count. */
export async function pooled<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i]!);
    }
  });
  await Promise.all(workers);
}

export function createBunnyStorage(config: BunnyStorageConfig): BunnyStorage {
  const { host, zone, password, requestTimeoutMs = 60_000, tag = '[bunny-storage]' } = config;

  const fetchWithTimeout = async (url: string, init: RequestInit = {}): Promise<Response> =>
    await fetch(url, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) });

  const storageUrl = (key: string): string => {
    const encoded = key.split('/').map(encodeURIComponent).join('/');
    return `https://${host}/${zone}/${encoded}`;
  };

  const redact = (msg: string): string =>
    password ? msg.split(password).join('[REDACTED]') : msg;

  const withRetry = async <T>(fn: () => Promise<T>, label: string): Promise<T> => {
    const delays = [2000, 4000, 8000, 16000, 32000];
    for (let attempt = 0; attempt < delays.length; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const safe = redact((err as Error).message ?? String(err));
        if (attempt === delays.length - 1) {
          throw new Error(`${label} failed after ${delays.length} attempts: ${safe}`);
        }
        console.log(`${tag} transient error on ${label} (${attempt + 1}/${delays.length}) — retrying in ${delays[attempt]! / 1000}s: ${safe}`);
        await sleep(delays[attempt]!);
      }
    }
    throw new Error(`${label}: unreachable`);
  };

  const listDir = async (dir: string): Promise<BunnyEntry[]> => {
    const res = await fetchWithTimeout(storageUrl(dir), { headers: { AccessKey: password } });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`list ${dir}: ${res.status} ${res.statusText}`);
    return (await res.json()) as BunnyEntry[];
  };

  /**
   * Breadth-first listing with a bounded number of requests in flight.
   *
   * Iterative rather than recursive because the two knobs the inventory needs —
   * concurrency and pruning — are properties of the *frontier*, not of any one
   * directory: a recursive walk can only parallelize within a single listing,
   * which is exactly the wrong axis here (a species-tiles pyramid is thousands
   * of directories holding a handful of files each).
   *
   * Order is not stable across runs once concurrency > 1. Callers that need a
   * stable artifact must sort; `files` being a Map is not a promise of order.
   */
  const survey = async (prefix: string, options: SurveyOptions = {}): Promise<Survey> => {
    const { concurrency = 1, descend } = options;
    const files = new Map<string, number>();
    const pruned: string[] = [];
    let frontier: string[] = [prefix];

    while (frontier.length > 0) {
      const level = frontier;
      frontier = [];
      await pooled(level, concurrency, async (dir) => {
        for (const entry of await withRetry(() => listDir(dir), `list ${dir}`)) {
          if (entry.IsDirectory) {
            const child = `${dir}${entry.ObjectName}/`;
            if (descend && !descend(child)) pruned.push(child);
            else frontier.push(child);
          } else {
            files.set(`${dir}${entry.ObjectName}`, entry.Length);
          }
        }
      });
    }
    return { files, pruned };
  };

  const walk = async (prefix: string): Promise<Map<string, number>> =>
    (await survey(prefix)).files;

  const copyObject = async (fromKey: string, toKey: string): Promise<void> => {
    const get = await fetchWithTimeout(storageUrl(fromKey), { headers: { AccessKey: password } });
    if (!get.ok) throw new Error(`download ${fromKey}: ${get.status} ${get.statusText}`);
    const body = new Uint8Array(await get.arrayBuffer());

    const put = await fetchWithTimeout(storageUrl(toKey), {
      method: 'PUT',
      headers: {
        AccessKey: password,
        // The storage API stores what it is given; Bunny serves the stored type.
        'Content-Type': get.headers.get('content-type') ?? 'application/octet-stream',
      },
      body,
    });
    if (!put.ok) throw new Error(`upload ${toKey}: ${put.status} ${put.statusText}`);
  };

  return { storageUrl, redact, walk, survey, copyObject, withRetry };
}

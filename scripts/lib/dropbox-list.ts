/**
 * scripts/lib/dropbox-list.ts
 *
 * Phase 26 (v2.2 high-res photos): paginated Dropbox shared-link listing helper.
 *
 * Ports .planning/spikes/001-dropbox-photo-audit/list-dropbox.mjs into a library:
 *  - `shareUrl` and `token` are parameters (not module-level constants), so the
 *    library is reusable by Phase 26's `scripts/ingest-photos.js`, Phase 28's
 *    `scripts/download-and-tile.js`, and Phase 29's `scripts/upload-tiles.js`.
 *  - `listSharedFolder` is an async generator that yields entries one at a time,
 *    rather than accumulating them into an array; the consumer can write manifest
 *    rows incrementally for crash-resilience without holding 5,000 entries in RAM.
 *
 * API surface used (the only Dropbox endpoints this library touches; D-07):
 *   POST /2/files/list_folder          with `shared_link` parameter (non-recursive only)
 *   POST /2/files/list_folder/continue with cursor, for pagination
 *
 * No retry policy here — Plan 03's `scripts/ingest-photos.js` wraps `dbxCall`
 * invocations in its own `withRetry` helper (D-15 backoff schedule). Keeps the
 * library pure / single-responsibility.
 *
 * No Dropbox SDK dependency — direct `fetch` is the project pattern (Node v24
 * has fetch natively; see 26-PATTERNS.md "What to avoid").
 */

// D-01 consumed-field interface for a file/folder entry
export interface DropboxEntry {
  '.tag': string;
  name: string;
  path_display?: string;
  size?: number;
  server_modified?: string;
  content_hash?: string;
}

// D-01 consumed-field interface for list_folder / list_folder/continue response
interface DropboxListPage {
  entries: DropboxEntry[];
  has_more: boolean;
  cursor: string;
}

// D-03 guard: validates only consumed fields; extra fields ignored
function isDropboxListPage(data: unknown): data is DropboxListPage {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return Array.isArray(d['entries']) && typeof d['has_more'] === 'boolean';
}

/**
 * Make a single Dropbox API call. Throws an Error with shape
 * `${endpoint} → ${status}: ${text}` on non-2xx responses; returns parsed
 * JSON on success. Note: Dropbox does not echo the request Authorization
 * header into error response bodies, so the token never leaks via this
 * error path (T-26.02-01 mitigation).
 *
 * Return type is `Promise<unknown>` — callers narrow via the guard (D-01/D-03).
 */
export async function dbxCall(endpoint: string, body: unknown, token: string): Promise<unknown> {
  const res = await fetch(`https://api.dropboxapi.com${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${endpoint} → ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Async generator that lists a Dropbox shared-link folder, yielding one
 * entry per iteration. Iterates pages internally via /2/files/list_folder
 * + /2/files/list_folder/continue. Non-recursive (the `shared_link` mode
 * of the Dropbox API explicitly forbids recursive listing).
 *
 * Per-page progress is written to process.stderr so callers that pipe
 * stdout to a file do not get progress noise.
 *
 * Each dbxCall result is narrowed with isDropboxListPage guard (D-01/D-03).
 * The while(true)+break shape satisfies noImplicitReturns (RESEARCH).
 */
export async function* listSharedFolder(
  params: { shareUrl: string; token: string },
): AsyncGenerator<DropboxEntry, void, undefined> {
  const { shareUrl, token } = params;
  let firstPage = true;
  let cursor = '';
  let pages = 0;

  while (true) {
    pages++;
    const raw = firstPage
      ? await dbxCall('/2/files/list_folder', {
          path: '',
          shared_link: { url: shareUrl },
          recursive: false,           // REQUIRED — shared_link mode is non-recursive only
          limit: 2000,
          include_media_info: false,
          include_deleted: false,
          include_has_explicit_shared_members: false,
          include_mounted_folders: false,
          include_non_downloadable_files: true,
        }, token)
      : await dbxCall('/2/files/list_folder/continue', { cursor }, token);

    if (!isDropboxListPage(raw)) {
      throw new Error(`[dropbox-list] unexpected response shape from Dropbox API`);
    }

    for (const e of raw.entries) yield e;
    process.stderr.write(`[dropbox-list] page ${pages}: +${raw.entries.length} entries\n`);

    if (!raw.has_more) break;
    cursor = raw.cursor;
    firstPage = false;
  }
}

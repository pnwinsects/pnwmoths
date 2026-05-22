/**
 * scripts/ingest-photos.js
 *
 * Phase 26 (v2.2 high-res photos): list the Dropbox shared-link folder
 * via /2/files/list_folder, parse each filename into binomial + specimen + view,
 * classify against data/species.csv, and write data/species-photos-manifest.csv.
 *
 * Metadata-only — no file bytes are downloaded.
 *
 * Usage:
 *   DROPBOX_TOKEN=sl.... node scripts/ingest-photos.js
 *   DRY_RUN=1 DROPBOX_TOKEN=sl.... node scripts/ingest-photos.js   # prints first 5 entries, no manifest write
 *   RESORT_ONLY=1 node scripts/ingest-photos.js                    # re-sort existing manifest; no Dropbox calls
 *
 * Resume after interruption: re-run the same command. The manifest itself is the
 * recovery state — rows whose content_hash is already in the manifest are skipped
 * (D-15 / OPS-03 resumability via D-04 content_hash row identity).
 *
 * DROPBOX_TOKEN: Dropbox app access token with files.metadata.read scope.
 * Generate at https://www.dropbox.com/developers/apps. Never commit, log, or hardcode.
 */

import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

import { extractBinomial, parseSpecimenAndView, toSpeciesSlug } from './lib/parse-photo-filename.js';
import { dbxCall } from './lib/dropbox-list.js';
import { readManifest, writeManifest, sortForInvestigation } from './lib/manifest.js';

// ---------------------------------------------------------------------------
// Module-level env constants (project convention; D-10 env-vars-at-invocation;
// mirrors scripts/upload-plates.js:28-35, scripts/migrate-images.js:34-44).
// ---------------------------------------------------------------------------

const MANIFEST_PATH = resolve('data/species-photos-manifest.csv');
const SPECIES_CSV = resolve('data/species.csv');
const SYNONYMS_CSV = resolve('data/species-synonyms.csv');

const DROPBOX_TOKEN = process.env.DROPBOX_TOKEN ?? '';
const DROPBOX_SHARE_URL = process.env.DROPBOX_SHARE_URL
  ?? 'https://www.dropbox.com/scl/fo/uf3sg1efxau1fug4f6ibe/AARZETfHfpzlvILrd6KLWlc?rlkey=7m1pm3z0rnasb9i01a5ht0ppf&st=emehj9n2&dl=0';
const DRY_RUN = process.env.DRY_RUN === '1';
const RESORT_ONLY = process.env.RESORT_ONLY === '1';

// Image extension allow-list, ported from spike parse-classify.mjs:23. Used to
// short-circuit non-image entries (in practice 0% in the spike audit, but D-15
// requires that no file path crash the run).
const IMAGE_EXTS = new Set([
  'jpg', 'jpeg', 'tif', 'tiff', 'png', 'heic', 'heif',
  'cr2', 'nef', 'arw', 'dng', 'raw',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Redact DROPBOX_TOKEN from an error message. Mirrors scripts/upload-plates.js:112
 * verbatim — this is the project-wide secret-redaction idiom (CONTEXT.md
 * "Specifics", 26-PATTERNS.md "Shared Patterns §2", T-26.03-01).
 *
 * Guard against the empty-token edge case: `new RegExp('', 'g')` matches every
 * position in the string and would corrupt error text into a chain of
 * "[REDACTED]" markers. When the token is empty (DRY_RUN path, etc.), the
 * original message is returned unchanged.
 */
function redact(msg) {
  return DROPBOX_TOKEN
    ? msg.replace(new RegExp(DROPBOX_TOKEN, 'g'), '[REDACTED]')
    : msg;
}

/**
 * D-15 retry-with-backoff. Five attempts at 2s/4s/8s/16s/32s (total 62s) before
 * giving up. Adapted from scripts/upload-plates.js:104-119 — same shape, with
 * the redaction step lifted out into `redact()` and applied to every error so
 * the token never leaks via logs or thrown messages.
 *
 * The final throw surfaces a redacted Error so the caller (main()) can record
 * status=failed and move on without crashing the run (OPS-02).
 */
async function withRetry(fn, label) {
  const delays = [2000, 4000, 8000, 16000, 32000];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const safeMsg = redact(err.message ?? String(err));
      if (attempt === delays.length - 1) {
        throw new Error(`${label} failed after ${delays.length} attempts: ${safeMsg}`);
      }
      console.log(
        `[ingest-photos] transient error on ${label} (attempt ${attempt + 1}/${delays.length}) — retrying in ${delays[attempt] / 1000}s: ${safeMsg}`
      );
      await sleep(delays[attempt]);
    }
  }
  // Unreachable — the loop either returns from `fn()` or throws on the final attempt.
}

/**
 * D-15 per-stage log line: ISO timestamp, content_hash prefix (12 chars,
 * padded), action (16-char field), outcome, optional extra context.
 * Written to stdout so tmux tail-following sees it interleaved with retry
 * messages.
 */
function logStage(content_hash, action, outcome, extra = '') {
  const hashPrefix = (content_hash ?? '').slice(0, 12).padEnd(12);
  const actionField = String(action).padEnd(16);
  console.log(
    `${new Date().toISOString()} ${hashPrefix} ${actionField} ${outcome}${extra ? '  ' + extra : ''}`
  );
}

/**
 * Load `data/species.csv` and build the three lookup structures used by
 * classify():
 *   byBinomial: Map<"genus species" (lowercased), record>
 *   bySlug:     Map<"genus-species" (lowercased), record>
 *   genera:     Set<lowercased genus>
 *
 * Ported from spike parse-classify.mjs:84-101 with the hand-rolled CSV parser
 * replaced by csv-parse/sync (same library Phase 13 uses).
 */
async function loadSpecies(csvPath) {
  const raw = await readFile(csvPath);
  const records = parse(raw, { columns: true, skip_empty_lines: true });
  const byBinomial = new Map();
  const bySlug = new Map();
  const genera = new Set();
  for (const r of records) {
    const genus = (r.genus || '').trim();
    const species = (r.species || '').trim();
    if (!genus || !species) continue;
    const binomial = `${genus} ${species}`.toLowerCase();
    const slug = `${genus}-${species}`.toLowerCase();
    byBinomial.set(binomial, r);
    bySlug.set(slug, r);
    genera.add(genus.toLowerCase());
  }
  return { byBinomial, bySlug, genera };
}

/**
 * Load `data/species-synonyms.csv` and build the synonym lookup used by
 * classify()'s pre-pass (Phase 27, D-04, D-09). First-run safe: returns an
 * empty Map when the file does not exist — matching the readManifest pattern
 * in scripts/lib/manifest.js:73-77 (existsSync guard, empty-collection default).
 *
 * Each row is resolved at load time so the pre-pass is a single Map.get() per
 * row at classification time. Rows whose `to_species_slug` is not present in
 * species.bySlug are dropped and a `synonym-warn` line is logged once (D-04) —
 * NOT once per manifest row.
 *
 * @param {string} csvPath  Absolute path to species-synonyms.csv.
 * @param {{ bySlug: Map }} species  Species fixture from loadSpecies().
 * @returns {Promise<Map<string, { binomial_resolved: string, species_slug: string }>>}
 *   Map keyed by from_binomial (lowercased, space-separated) to resolved target info.
 */
export async function loadSynonyms(csvPath, species) {
  if (!existsSync(csvPath)) return new Map();
  const raw = await readFile(csvPath);
  // bom: true — Notepad/Excel on Windows prepend a UTF-8 BOM, which without
  // stripping becomes part of the first column header and silently drops every row.
  const records = parse(raw, { columns: true, skip_empty_lines: true, bom: true });
  const synonyms = new Map();
  for (const r of records) {
    const from = (r.from_binomial || '').trim().toLowerCase();
    const to = (r.to_species_slug || '').trim().toLowerCase();
    if (!from || !to) continue;
    const target = species.bySlug.get(to);
    if (!target) {
      // D-04: emit one warn line at load time; drop the orphan row from the map.
      logStage('', 'synonym-warn', 'target-not-in-species-csv', `${from} → ${to}`);
      continue;
    }
    // Reconstruct the resolved binomial from species.csv so it matches the
    // lowercase "genus species" form Phase 26 emits for clean-match rows.
    const resolvedBinomial = `${(target.genus || '').toLowerCase()} ${(target.species || '').toLowerCase()}`.trim();
    synonyms.set(from, { binomial_resolved: resolvedBinomial, species_slug: to });
  }
  return synonyms;
}

/**
 * Return the lowercased file extension (without the dot) from a filename,
 * or '' if there is no dot. Ported from spike parse-classify.mjs:129-132.
 */
function fileExt(name) {
  const m = (name || '').match(/\.([^.]+)$/);
  return m ? m[1].toLowerCase() : '';
}

/**
 * Match cascade. Order (locked by the spike-findings skill reference
 * §"Match cascade", with the D-14 FIX #3 provisional short-circuit prepended,
 * and the Phase 27 synonym pre-pass inserted before both):
 *
 *  −1. resolved-via-synonym — synonyms.has(binomialFromParser)  (Phase 27, D-04,
 *                      D-06; runs BEFORE provisional/unparseable so any non-empty
 *                      binomial can be re-routed by a curator synonyms.csv entry)
 *   0. provisional   — bucketHintFromParser === 'provisional'  (FIX #3, MUST NOT
 *                      be auto-promoted; CONTEXT.md success criterion #4)
 *   1. clean-match   — binomial in byBinomial
 *   2. slug-match    — slug in bySlug   (kept for safety; spike audit hit 0%)
 *   3. genus-only    — first token in genera
 *   4. likely-synonym— neither genus nor species in current data
 *   5. unparseable   — binomial null AND bucketHint null
 *
 * Non-image extensions are short-circuited upstream by main() and never reach
 * classify() — Phase 26's D-05 status set has no 'non-image' bucket; non-images
 * are routed to 'unparseable' with last_error='non-image extension'.
 *
 * Returns: { match_bucket, binomial_resolved, species_slug }
 */
export function classify({ binomialFromParser, bucketHintFromParser }, species, synonyms) {
  // −1. Synonym pre-pass (Phase 27, D-04, D-06). Applies BEFORE the provisional
  //     and unparseable short-circuits so a curator can re-route any row with
  //     a non-empty binomial_raw — including provisional and unparseable rows.
  //     The lookup key is binomialFromParser (already-normalized lowercase
  //     'genus species' from the parser, or the row's binomial_raw on the
  //     RESORT_ONLY path). D-06 widens the routable buckets: provisional and
  //     unparseable rows with a non-empty binomial are eligible for synonym
  //     promotion.
  if (synonyms && binomialFromParser && synonyms.has(binomialFromParser)) {
    const { binomial_resolved, species_slug } = synonyms.get(binomialFromParser);
    return { match_bucket: 'resolved-via-synonym', binomial_resolved, species_slug };
  }

  // 0. Provisional short-circuit — FIX #3. The parser's bucketHint must not be
  //    overridden even if a binomial-like substring would otherwise match.
  if (bucketHintFromParser === 'provisional') {
    return { match_bucket: 'provisional', binomial_resolved: '', species_slug: '' };
  }

  // 5. Unparseable — neither a clean binomial nor a provisional marker.
  if (!binomialFromParser) {
    return { match_bucket: 'unparseable', binomial_resolved: '', species_slug: '' };
  }

  // 1. Clean match against byBinomial.
  if (species.byBinomial.has(binomialFromParser)) {
    const slug = toSpeciesSlug(binomialFromParser);
    return {
      match_bucket: 'clean-match',
      binomial_resolved: binomialFromParser,
      species_slug: slug,
    };
  }

  // 2. Slug match (safety net; spike audit hit 0% but kept for parity).
  const slug = toSpeciesSlug(binomialFromParser);
  if (species.bySlug.has(slug)) {
    return {
      match_bucket: 'slug-match',
      binomial_resolved: binomialFromParser,
      species_slug: slug,
    };
  }

  // 3. Genus-only.
  const genus = binomialFromParser.split(' ')[0];
  if (species.genera.has(genus)) {
    return { match_bucket: 'genus-only', binomial_resolved: '', species_slug: '' };
  }

  // 4. Likely-synonym — neither genus nor species in current data.
  return { match_bucket: 'likely-synonym', binomial_resolved: '', species_slug: '' };
}

// ---------------------------------------------------------------------------
// Dropbox listing (retry-wrapped inline, so withRetry guards each page).
//
// We do NOT use scripts/lib/dropbox-list.js's async generator directly here:
// withRetry needs to wrap each network call, which is cleaner when the
// pagination loop lives at the CLI level (26-PATTERNS.md "Retry wrapping
// happens at the call site"). The library still owns the request shape via
// dbxCall().
// ---------------------------------------------------------------------------

const LIST_FOLDER_BODY = {
  path: '',
  shared_link: { url: DROPBOX_SHARE_URL },
  recursive: false, // REQUIRED — shared_link mode is non-recursive only.
  limit: 2000,
  include_media_info: false,
  include_deleted: false,
  include_has_explicit_shared_members: false,
  include_mounted_folders: false,
  include_non_downloadable_files: true,
};

async function* listSharedFolderWithRetry(shareUrl, token) {
  let firstPage = true;
  let cursor = null;
  let pages = 0;

  while (true) {
    pages++;
    const data = firstPage
      ? await withRetry(
          () => dbxCall('/2/files/list_folder', { ...LIST_FOLDER_BODY, shared_link: { url: shareUrl } }, token),
          `list_folder page ${pages}`
        )
      : await withRetry(
          () => dbxCall('/2/files/list_folder/continue', { cursor }, token),
          `list_folder/continue page ${pages}`
        );

    process.stderr.write(`[ingest-photos] page ${pages}: +${data.entries.length} entries\n`);
    for (const e of data.entries) yield e;

    if (!data.has_more) break;
    cursor = data.cursor;
    firstPage = false;
  }
}

// ---------------------------------------------------------------------------
// main()
// ---------------------------------------------------------------------------

async function main() {
  // --- RESORT_ONLY: re-classify against current synonyms.csv + re-sort; no Dropbox calls. ---
  // D-05: photos:investigate is the curator's daily-use command — edit synonyms.csv,
  // run this, manifest reclassified + re-sorted. No source TIFFs are downloaded.
  if (RESORT_ONLY) {
    const species = await loadSpecies(SPECIES_CSV);
    const synonyms = await loadSynonyms(SYNONYMS_CSV, species);
    const existing = await readManifest(MANIFEST_PATH);

    // Re-classify each row using its existing binomial_raw (not the parser).
    // D-06: any non-empty binomial_raw is routable through synonyms.csv.
    let promoted = 0;
    for (const row of existing) {
      const binomial = (row.binomial_raw || '').toLowerCase();
      if (binomial && synonyms.has(binomial)) {
        const { binomial_resolved, species_slug } = synonyms.get(binomial);
        // Idempotency guard: only count and log an actual change.
        if (row.match_bucket !== 'resolved-via-synonym' || row.species_slug !== species_slug) {
          row.match_bucket = 'resolved-via-synonym';
          row.binomial_resolved = binomial_resolved;
          row.species_slug = species_slug;
          promoted++;
          logStage(row.content_hash, 'reclassify', 'resolved-via-synonym', `${binomial} → ${species_slug}`);
        }
      }
    }

    // L-03: sortForInvestigation is unchanged — resolved-via-synonym rows trail
    // with clean-match rows in the "not-needs-investigation" partition.
    const sorted = sortForInvestigation(existing);
    await writeManifest(MANIFEST_PATH, sorted);
    console.log(`[ingest-photos] re-sorted manifest; ${sorted.length} rows; ${promoted} promoted to resolved-via-synonym`);
    return;
  }

  // --- Missing-secret guard (skipped in DRY_RUN). ---
  if (!DRY_RUN && !DROPBOX_TOKEN) {
    console.error(
      '[ingest-photos] DROPBOX_TOKEN is required. Generate a Dropbox app token with files.metadata.read scope at https://www.dropbox.com/developers/apps'
    );
    process.exit(1);
  }

  // --- DRY_RUN: print first 5 Dropbox entries; do not write the manifest. ---
  if (DRY_RUN) {
    console.log('[ingest-photos] DRY_RUN=1 — listing first page and printing first 5 entries, not writing manifest');
    if (!DROPBOX_TOKEN) {
      console.log('[ingest-photos] (no DROPBOX_TOKEN set — skipping Dropbox call; script structure validated)');
      return;
    }
    let printed = 0;
    try {
      for await (const e of listSharedFolderWithRetry(DROPBOX_SHARE_URL, DROPBOX_TOKEN)) {
        if (printed >= 5) break;
        console.log(`  -> ${e.path_display ?? e.name}  (${e.size ?? '-'} bytes, hash=${e.content_hash ?? '-'})`);
        printed++;
      }
      console.log('  ...');
    } catch (err) {
      console.error(`[ingest-photos] DRY_RUN failed: ${redact(err.message ?? String(err))}`);
      process.exit(1);
    }
    return;
  }

  // --- Full run ---
  const species = await loadSpecies(SPECIES_CSV);
  console.log(`[ingest-photos] loaded ${species.byBinomial.size} species records from ${SPECIES_CSV}`);
  const synonyms = await loadSynonyms(SYNONYMS_CSV, species);
  console.log(`[ingest-photos] loaded ${synonyms.size} synonyms from ${SYNONYMS_CSV}`);

  const existing = await readManifest(MANIFEST_PATH);
  const seen = new Set(existing.map((r) => r.content_hash));
  console.log(`[ingest-photos] existing manifest has ${existing.length} rows (${seen.size} unique content_hashes)`);

  const rows = [...existing]; // preserve existing rows verbatim (Phase 27 edits them)

  const stats = {
    discovered: 0,
    skipped: 0,
    failed: 0,
    folders: 0,
    buckets: {},
  };

  let fatal = null;
  try {
    for await (const entry of listSharedFolderWithRetry(DROPBOX_SHARE_URL, DROPBOX_TOKEN)) {
      // Folder entries — log + skip. D-11: *custom/ stays untouched. Non-recursive
      // listing already excludes its contents; the folder entry itself shows up
      // and we just don't recurse into it.
      if (entry['.tag'] === 'folder') {
        stats.folders++;
        logStage('', 'folder-skip', entry.name ?? '');
        continue;
      }
      if (entry['.tag'] !== 'file') continue;

      // Resumability: skip files whose content_hash is already in the manifest.
      if (seen.has(entry.content_hash)) {
        stats.skipped++;
        logStage(entry.content_hash, 'skip', 'already-in-manifest');
        continue;
      }

      try {
        // Non-image extension → unparseable bucket with last_error explaining why
        // (per plan; Phase 26's D-05 status set has no 'non-image' bucket).
        const ext = fileExt(entry.name);
        if (!IMAGE_EXTS.has(ext)) {
          const row = {
            content_hash: entry.content_hash,
            dropbox_path: entry.path_display ?? '',
            size_bytes: String(entry.size ?? ''),
            server_modified: entry.server_modified ?? '',
            filename_raw: entry.name ?? '',
            binomial_raw: '',
            specimen_id: '',
            view: '',
            binomial_resolved: '',
            species_slug: '',
            match_bucket: 'unparseable',
            status: 'discovered',
            last_error: 'non-image extension',
          };
          rows.push(row);
          seen.add(entry.content_hash);
          stats.discovered++;
          stats.buckets.unparseable = (stats.buckets.unparseable ?? 0) + 1;
          logStage(entry.content_hash, 'classify', 'unparseable', `non-image (${ext})`);
          continue;
        }

        // Parse filename → binomial + bucket hint, specimen + view.
        const parsed = extractBinomial(entry.name);
        const parsedSV = parseSpecimenAndView(entry.name);

        // Classify against species.csv (with Phase 27 synonym pre-pass + FIX #3 provisional short-circuit).
        const { match_bucket, binomial_resolved, species_slug } = classify(
          {
            binomialFromParser: parsed.binomial,
            bucketHintFromParser: parsed.bucketHint,
          },
          species,
          synonyms,
        );

        const row = {
          content_hash: entry.content_hash,
          dropbox_path: entry.path_display ?? '',
          size_bytes: String(entry.size ?? ''),
          server_modified: entry.server_modified ?? '',
          filename_raw: entry.name ?? '',
          binomial_raw: parsed.binomial ?? '',
          specimen_id: parsedSV.specimen,
          view: parsedSV.view,
          binomial_resolved,
          species_slug,
          match_bucket,
          status: 'discovered',
          last_error: '',
        };
        rows.push(row);
        seen.add(entry.content_hash);
        stats.discovered++;
        stats.buckets[match_bucket] = (stats.buckets[match_bucket] ?? 0) + 1;
        logStage(entry.content_hash, 'classify', match_bucket, row.binomial_raw);
      } catch (perFileErr) {
        // NEVER crash on a single file (OPS-02). Mark status=failed + last_error.
        const safeMsg = redact(perFileErr.message ?? String(perFileErr));
        const row = {
          content_hash: entry.content_hash ?? '',
          dropbox_path: entry.path_display ?? '',
          size_bytes: String(entry.size ?? ''),
          server_modified: entry.server_modified ?? '',
          filename_raw: entry.name ?? '',
          binomial_raw: '',
          specimen_id: '',
          view: '',
          binomial_resolved: '',
          species_slug: '',
          match_bucket: 'unparseable',
          status: 'failed',
          last_error: safeMsg,
        };
        rows.push(row);
        if (entry.content_hash) seen.add(entry.content_hash);
        stats.failed++;
        logStage(entry.content_hash, 'classify', 'failed', safeMsg);
      }
    }
  } catch (pageErr) {
    // withRetry-exhausted pagination error. Preserve work-so-far for resumption
    // (OPS-03): write the manifest with whatever rows accumulated, then exit 1.
    fatal = pageErr;
    console.error(`[ingest-photos] fatal pagination error: ${redact(pageErr.message ?? String(pageErr))}`);
  }

  // Always sort + write before exiting (success OR fatal page error).
  const sorted = sortForInvestigation(rows);
  await writeManifest(MANIFEST_PATH, sorted);

  // Final summary (OPS-01 tail-friendly).
  console.log('');
  console.log(`[ingest-photos] summary:`);
  console.log(`  discovered (new rows): ${stats.discovered}`);
  console.log(`  skipped (already in manifest): ${stats.skipped}`);
  console.log(`  failed (per-file errors): ${stats.failed}`);
  console.log(`  folders encountered (skipped): ${stats.folders}`);
  console.log(`  total rows in manifest: ${sorted.length}`);
  console.log(`  per-bucket distribution:`);
  for (const [bucket, count] of Object.entries(stats.buckets)) {
    console.log(`    ${bucket.padEnd(16)} ${count}`);
  }
  console.log(`[ingest-photos] wrote ${MANIFEST_PATH}`);

  if (fatal) process.exit(1);
}

// ---------------------------------------------------------------------------
// Self-invocation guard — exact form from scripts/upload-plates.js:128-133.
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(redact(err.message ?? String(err)));
    process.exit(1);
  });
}

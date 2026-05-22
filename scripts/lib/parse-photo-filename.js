/**
 * scripts/lib/parse-photo-filename.js
 *
 * Phase 26 (v2.2 high-res photos): pure-function filename parser for the
 * Dropbox ingest manifest. No I/O — exports three helpers consumed by
 * scripts/ingest-photos.js (Plan 03 of Phase 26).
 *
 * Ported from .planning/spikes/001-dropbox-photo-audit/parse-classify.mjs
 * with the three D-14 fixes called out in 26-PATTERNS.md applied:
 *
 *   FIX #1 — epithet length lowered from >=3 to >=2 (admits 'ni', 'ou')
 *   FIX #2 — second-token regex allows hyphenated epithets ('v-alba', 'c-nigrum')
 *   FIX #3 — pre-pass scan routes 'sp' / 'n sp' / 'nr <…>' to a provisional
 *            bucket so the parser never coerces undescribed/provisional IDs
 *            into a clean binomial
 *
 * Deviation from the spike's "collapse all separators to spaces" trick: that
 * step destroys the hyphen inside species epithets like 'v-alba' / 'c-nigrum',
 * which then can never match FIX #2's regex. Instead we strip the trailing
 * `-<specimen>-<view>` tail first (parseSpecimenAndView's regex run in reverse)
 * to isolate the binomial portion, then walk the remaining string token-aware:
 *   - if it contains a space, split on the first space (Genus then epithet,
 *     epithet may still contain a single hyphen);
 *   - else split on the first hyphen (Genus-species hyphen-joined case).
 *
 * In-repo precedent: scripts/migrate-images.js (parseMotFilename / parseViewSpecimen),
 * loosened here so institutional specimen IDs (OSAC_*, WWUC*) are admitted.
 */

// Tail regex shared with parseSpecimenAndView. `-([A-Z0-9_]+)-([DV])` matches
// either a single capital letter or an institutional accession in the specimen
// slot, and exactly D | V in the view slot, immediately before the extension.
const TAIL_RE = /-([A-Z0-9_]+)-([DV])\.[^.]+$/;
const TAIL_STRIP_RE = /-[A-Z0-9_]+-[DV]$/;

// Provisional triggers — any single-token match returns provisional immediately.
// The consecutive ['n', 'sp'] pair is handled separately because 'n' alone is
// just a token; only when followed by 'sp' is it a provisional new-species marker.
const PROVISIONAL_SINGLE_TOKENS = new Set(['sp', 'nr']);

// Per-token shape tests used in the clean-binomial walk.
const GENUS_RE = /^[A-Z][a-z]+$/;
// FIX #2 — epithet may be a single lowercase run, or two lowercase runs joined
// by a single hyphen ('v-alba', 'c-nigrum').
const EPITHET_RE = /^[a-z]+(-[a-z]+)?$/;

/**
 * Extract a binomial from a filename, or route to the provisional bucket.
 *
 * @param {string} filename
 * @returns {{ binomial: string | null, bucketHint: 'provisional' | null }}
 */
export function extractBinomial(filename) {
  if (typeof filename !== 'string' || !filename) {
    return { binomial: null, bucketHint: null };
  }

  // 1. Strip extension.
  const stem = filename.replace(/\.[^.]+$/, '');

  // 2. Strip the trailing `-<specimen>-<view>` if present. This isolates the
  //    binomial portion while preserving any hyphen inside the species epithet.
  const binomialPart = stem.replace(TAIL_STRIP_RE, '');

  // 3. Tokenize on whitespace + hyphen for the provisional scan only. The scan
  //    must inspect the full token stream (FIX #3) so 'Monostoecha n sp' is
  //    caught even though 'n sp' spans two tokens.
  //    For provisional detection alone we DO want to split on hyphens — the
  //    triggers 'sp' / 'nr' / ['n','sp'] never appear inside a hyphenated
  //    epithet, so the cost of over-tokenizing is zero.
  const provisionalTokens = binomialPart.split(/[\s\-_.]+/).filter(Boolean);
  for (let i = 0; i < provisionalTokens.length; i++) {
    const lower = provisionalTokens[i].toLowerCase();
    if (PROVISIONAL_SINGLE_TOKENS.has(lower)) {
      return { binomial: null, bucketHint: 'provisional' };
    }
    // Consecutive ['n', 'sp'] pair (case-insensitive on the 'n').
    if (
      lower === 'n' &&
      i + 1 < provisionalTokens.length &&
      provisionalTokens[i + 1].toLowerCase() === 'sp'
    ) {
      return { binomial: null, bucketHint: 'provisional' };
    }
  }

  // 4. Clean-binomial walk. Try the space-separated form first (most common,
  //    and the only shape that preserves hyphens inside an epithet); fall back
  //    to hyphen-joined for the Genus-species case.
  const cleaned = binomialPart.replace(/\s+/g, ' ').trim();

  // 4a. Space-separated: 'Genus species' or 'Genus c-nigrum'. First token is
  //     the Genus, remainder is the rest; we walk adjacent pairs so that
  //     'Genus species extra-stuff' still matches the first two tokens.
  if (cleaned.includes(' ')) {
    const tokens = cleaned.split(' ');
    for (let i = 0; i < tokens.length - 1; i++) {
      const a = tokens[i];
      const b = tokens[i + 1];
      // FIX #1: b.length >= 2 (was >= 3 in spike) — admits 'ni', 'ou'.
      // FIX #2: EPITHET_RE allows a single hyphenated epithet.
      if (GENUS_RE.test(a) && EPITHET_RE.test(b) && b.length >= 2) {
        return {
          binomial: `${a.toLowerCase()} ${b.toLowerCase()}`,
          bucketHint: null,
        };
      }
    }
    return { binomial: null, bucketHint: null };
  }

  // 4b. No spaces — hyphen-joined Genus-species (e.g. 'Paraseptis-adnixa').
  //     Split on the first hyphen; both sides must satisfy the same shape
  //     tests. A second hyphen inside the epithet is allowed by EPITHET_RE.
  const firstHyphen = cleaned.indexOf('-');
  if (firstHyphen > 0) {
    const a = cleaned.slice(0, firstHyphen);
    const b = cleaned.slice(firstHyphen + 1);
    if (GENUS_RE.test(a) && EPITHET_RE.test(b) && b.length >= 2) {
      return {
        binomial: `${a.toLowerCase()} ${b.toLowerCase()}`,
        bucketHint: null,
      };
    }
  }

  return { binomial: null, bucketHint: null };
}

/**
 * Extract the specimen ID and view code (D/V) from a filename's tail.
 *
 * The specimen slot can be either a single capital letter (A, B, C, ...) or
 * an institutional accession ID (OSAC_0001081322, WWUC000000083). The view
 * is always exactly D (dorsal) or V (ventral), case-sensitive, immediately
 * before the extension.
 *
 * @param {string} filename
 * @returns {{ specimen: string, view: 'D' | 'V' | '' }}
 */
export function parseSpecimenAndView(filename) {
  if (typeof filename !== 'string' || !filename) {
    return { specimen: '', view: '' };
  }
  // Loosened from scripts/migrate-images.js:91-98 — admits underscores and
  // digits in the specimen token, and pins view to D|V only (per D-05 schema).
  const match = filename.match(TAIL_RE);
  if (!match) return { specimen: '', view: '' };
  return { specimen: match[1], view: match[2] };
}

/**
 * Convert a normalized binomial ('genus species', any case) to the slug shape
 * used in data/species.csv (lowercase, hyphen-joined). Defensive on empty/null.
 *
 * Mirrors the slug rule in scripts/migrate-species.js (lower(genus || '-' || species))
 * and in the spike's parse-classify.mjs:95.
 *
 * @param {string} binomial
 * @returns {string}
 */
export function toSpeciesSlug(binomial) {
  if (typeof binomial !== 'string' || !binomial) return '';
  return binomial.toLowerCase().trim().replace(/\s+/g, '-');
}

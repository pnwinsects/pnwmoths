// src/_lib/reared-records.ts
// Which occurrence records are of reared or immature moths. Shared by the species
// page's flight chart (src/components/parquet-cache.ts) and the key build
// (scripts/lib/key-derived-scores.ts), so the two never disagree about a month.

/**
 * Keyword list flagging a record as reared/immature (larvae, pupae, eggs, etc.).
 * Derived from the legacy Django site's `species/models.py` REARED_TERMS, which
 * excluded reared specimens from phenology graphs by nulling their month at
 * data-entry time. Replicated here so post-2011 stragglers with populated months
 * (and any future ones) are excluded durably from the phenology bars (ISSUE-59),
 * and from the months the identification key derives from the records (#397).
 *
 * The legacy list also carried the foodplant terms `Rubus`, `Taraxacum`, and
 * `broadleaf`. Those are deliberately omitted: notes record the plants adults
 * were visiting as well as larval foodplants, so a nectaring adult would be
 * dropped from the flight-season data it belongs in (per curator, ISSUE-59).
 */
export const REARED_TERMS = [
  'reared', 'larva', 'em.', 'pupa', 'immature',
  'ovum', 'emerged', 'emgd', 'em in', 'em ex', 'eggs',
];

/**
 * Whether a record is a reared/immature specimen, per the legacy keyword scan.
 *
 * Performs a case-insensitive substring match of any REARED_TERM against the
 * `notes` field ONLY — never any other column, since short tokens like "em."
 * would false-match locality/collector text. Records with null or empty-string
 * notes are not reared.
 *
 * @param record - occurrence record to test
 * @returns true if any REARED_TERM appears in the record's notes
 */
export function isRearedRecord(record: { notes?: string | null }): boolean {
  if (!record.notes) return false;
  const lowered = record.notes.toLowerCase();
  return REARED_TERMS.some(term => lowered.includes(term.toLowerCase()));
}

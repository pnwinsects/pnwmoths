// format-epithet — display formatting for specific epithets.
//
// A handful of species carry their specific epithet in straight double quotes on the
// reference site (e.g. Clostera "apicalis", Idia "concisa", Pheosia "californica") to
// flag a provisional or misapplied name. Those quotes are display-only: the clean
// epithet still drives the slug and every foreign key. The `epithet_quoted` column in
// data/species.csv (sourced from the reference MySQL DB) marks which epithets are quoted.
// See https://github.com/pnwinsects/pnwmoths/issues/85.

/**
 * Wrap an epithet in straight double quotes when the species is flagged as quoted.
 *
 * @param epithet - the clean specific epithet (e.g. "apicalis")
 * @param quoted  - true when data/species.csv marks epithet_quoted for this species
 * @returns the display epithet, e.g. `"apicalis"` when quoted, otherwise `apicalis`
 */
export function formatEpithet(epithet: string, quoted: boolean): string {
  return quoted ? `"${epithet}"` : epithet;
}

/**
 * Coerce the raw `epithet_quoted` CSV cell to a boolean. The column holds `'1'` for
 * quoted species and is empty (→ null under nullstr='') otherwise.
 */
export function isEpithetQuoted(cell: string | null | undefined): boolean {
  return cell === '1';
}

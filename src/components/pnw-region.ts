/**
 * The site's target-range boundary: the Pacific Northwest region this site covers.
 *
 * Coordinates are `[lat, lng]` pairs forming a single ring (source: pnwinsects-app).
 * Used both to shade everything *outside* the region on species occurrence maps and
 * to highlight the region on the home-page range map — keep it as the single source
 * of truth so the two never drift.
 */
export const PNW_REGION_RING: [number, number][] = [
  [60, -140],
  [60, -120],
  [53.8, -120],
  [45, -109],
  [39, -109],
  [39, -125],
];

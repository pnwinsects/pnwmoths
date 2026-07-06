// scripts/lib/district-assignment.ts
// Shared, DB-free coordinate guard/gate module (Phase 46: Coordinate ->
// District Assignment). Every (latitude, longitude) pair pulled from
// data/records.csv is untrusted until classifyCoordinate() below returns
// 'ok' — no DuckDB query may touch a coordinate before this module has
// cleared it. Ordering is mandatory (DIST-04, SC#1): the axis-order guard
// runs FIRST, then the bounds sanity gate — a swapped-axis coordinate must
// never reach the bounds gate or any downstream point-in-polygon query
// (D-07: skip + report, never mutate). See
// .planning/phases/46-coordinate-district-assignment/46-CONTEXT.md for the
// full decision record (D-04 fallback tolerance, D-07 skip/report
// invariant).
//
// No I/O, no DuckDB import — pure exported functions only, so Plan 46-02's
// fill script and Phase 47's QC report can both reuse this module without
// opening a database connection.

import { PNW_BOUNDS } from '../build-boundaries.ts';

/**
 * A narrow plausibility box used ONLY inside the axis-order guard below
 * (DIST-04's literal requirement text) — NOT the accept/reject boundary for
 * assignment. The real accept/reject boundary is PNW_BOUNDS, imported above
 * from build-boundaries.ts (the box tied to the real committed boundary
 * geometry, fixed in Phase 45 to lonMax: -103 to cover full-Montana).
 */
export const AXIS_ORDER_PLAUSIBLE_LAT = { min: 41, max: 61 };
export const AXIS_ORDER_PLAUSIBLE_LON = { min: -140, max: -109 };

/** WGS84 meridian-arc constant: 1 degree of latitude is ~111.32 km. Fixed,
 * direction-agnostic, and conservative per D-04 (using the latitude
 * constant rather than the shorter longitude-degree-length at these
 * latitudes biases the fallback tolerance slightly smaller/stricter). */
export const KM_PER_DEGREE_LAT = 111.32;

/** D-04: nearest-boundary fallback tolerance is ~2 km. Beyond this, a point
 * outside every polygon stays unassigned rather than risk a false match. */
export const FALLBACK_KM = 2;

/** The ~2 km fallback tolerance expressed as a degree threshold, for reuse
 * against DuckDB's planar ST_Distance (same [lon, lat] convention as
 * ST_Point/ST_Contains) by Plan 46-02's fill script and Phase 47's QC
 * report, with no DuckDB connection required to compute it. */
export const FALLBACK_DEGREE_THRESHOLD = FALLBACK_KM / KM_PER_DEGREE_LAT;

export type CoordinateOutcome = 'axis-order-suspect' | 'out-of-bounds' | 'ok';

/**
 * True iff (latitude, longitude) looks like a swapped lat/lon pair: the
 * `latitude` column value is implausible as a latitude BUT plausible as a
 * longitude, AND the `longitude` column value is plausible as a latitude.
 * Verified against the known-swapped rows in data/records-bad-coords.csv
 * (e.g. Asotin Co., WA: latitude=-117.047, longitude=46.339 — a real record
 * with its columns swapped).
 */
export function isAxisOrderSuspect(latitude: number, longitude: number): boolean {
  const latPlausibleAsLat =
    latitude >= AXIS_ORDER_PLAUSIBLE_LAT.min && latitude <= AXIS_ORDER_PLAUSIBLE_LAT.max;
  const lonPlausibleAsLat =
    longitude >= AXIS_ORDER_PLAUSIBLE_LAT.min && longitude <= AXIS_ORDER_PLAUSIBLE_LAT.max;
  const latPlausibleAsLon =
    latitude >= AXIS_ORDER_PLAUSIBLE_LON.min && latitude <= AXIS_ORDER_PLAUSIBLE_LON.max;
  return !latPlausibleAsLat && lonPlausibleAsLat && latPlausibleAsLon;
}

/**
 * True iff (latitude, longitude) falls inside PNW_BOUNDS — the bounds gate
 * tied to the real committed boundary geometry (lonMax: -103, covering
 * full-Montana), NOT DIST-04's literal -109 plausibility box used only by
 * the axis-order guard above.
 */
export function isWithinAssignmentBounds(latitude: number, longitude: number): boolean {
  return (
    latitude >= PNW_BOUNDS.latMin &&
    latitude <= PNW_BOUNDS.latMax &&
    longitude >= PNW_BOUNDS.lonMin &&
    longitude <= PNW_BOUNDS.lonMax
  );
}

/**
 * Classifies a raw (latitude, longitude) pair before any point-in-polygon
 * assignment is attempted. Ordering is mandatory (DIST-04, SC#1): the
 * axis-order guard runs FIRST — a swapped pair must be caught here and never
 * reach the bounds gate — THEN the bounds sanity gate, else 'ok'.
 */
export function classifyCoordinate(latitude: number, longitude: number): CoordinateOutcome {
  if (isAxisOrderSuspect(latitude, longitude)) return 'axis-order-suspect';
  if (!isWithinAssignmentBounds(latitude, longitude)) return 'out-of-bounds';
  return 'ok';
}

/**
 * Strictly parse a coordinate cell into a finite number, or NaN when it isn't
 * a clean numeric value. Unlike `parseFloat` — which accepts trailing junk
 * ("47.6xyz" -> 47.6) and could let a corrupted cell reach the DuckDB SQL —
 * this trims and requires the ENTIRE cell to be finite, returning NaN for
 * blank/garbage/±Infinity input. Callers treat NaN as "no usable coordinate".
 */
export function parseCoordinate(value: unknown): number {
  const s = String(value ?? '').trim();
  if (s === '') return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

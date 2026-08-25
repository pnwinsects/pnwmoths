/**
 * scripts/lib/photo-determinations.ts
 *
 * The curator's answer to "what species is this photograph of?", for the cases
 * where the filename says one thing and the determination says another.
 *
 * WHY THIS FILE EXISTS
 *
 * The high-res pipeline has exactly one clue about a Dropbox TIFF's identity:
 * its filename. `parse-photo-filename.ts` extracts a binomial from it and
 * `ingest-photos.ts` files the photo under the matching slug — a `clean-match`.
 * That is the only thing it *can* do at ingest, and for ~3,800 photos it is
 * right.
 *
 * It is wrong exactly when a specimen was photographed under one name and
 * redetermined under another. The filename records what the moth was *called
 * when it was photographed*; the catalogue records what it *is*. A rename or a
 * redetermination moves the second without moving the first, and the filename
 * then names a different species than the photograph depicts —
 *   `Amphipoea keiferi-A-D.tif` is a photograph of *Resapamea innota*
 * — while still scoring a confident `clean-match` to `amphipoea-keiferi`.
 *
 * This is the failure CLAUDE.md names ("Never derive join slugs from image
 * filenames"), and it had teeth: because `src/species/species.njk` renders tiles
 * *instead of* the catalogued photographs when a species has any, eleven species
 * accounts published high-resolution photographs of a different species than the
 * page was about, with `data/images.csv` correct the whole time (#330, #336).
 *
 * A determination here overrides the filename match. It is keyed by *photo stem*
 * — the filename without its extension — because one stem names the same
 * photograph in both places it appears: `Amphipoea keiferi-A-D.jpg` in
 * `data/images.csv` and `Amphipoea keiferi-A-D.tif` in the photo manifest. Stems
 * are unique across `data/images.csv` (4,034 rows, 4,034 distinct stems), so a
 * stem identifies one photograph and one determination governs both records of
 * it.
 *
 * FILENAMES ARE NEVER REWRITTEN. Renaming the file to match the determination
 * would destroy the provenance the filename carries and orphan every derivative
 * keyed to it. Same principle as migrate-renamed-species-photos.ts: only the
 * folder changes. The determination is the statement; the filename is the
 * historical label.
 *
 * `scripts/check-photo-determinations.ts` is the gate that keeps
 * `data/images.csv`, this file, and the manifest from drifting apart again.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { stripSpecimenTail, parseSpecimenAndView } from './parse-photo-filename.ts';
import { normalizeSlug } from '../../src/_lib/unpublished-species.ts';

export const DETERMINATIONS_PATH: string = resolve('data/photo-determinations.csv');

/**
 * One curator ruling about one photograph.
 *
 * `specimen` is part of the ruling, not a derived value: moving a photograph to
 * another species can collide with a letter that species already uses, and
 * C-026 settles those by giving the incoming photograph the next free letter
 * rather than renumbering the incumbent. Recording the letter here keeps that
 * decision next to the determination that forced it.
 */
export interface PhotoDetermination {
  /** Filename without extension — the same photograph in images.csv and the manifest. */
  readonly photo_stem: string;
  /** The species the photograph actually depicts. */
  readonly species_slug: string;
  /** Specimen letter at the destination species. */
  readonly specimen: string;
  /** Issue or PR where the curator said it. */
  readonly source: string;
  /** The curator's words, and why this letter. */
  readonly note: string;
}

/** What a filename asserts: the species it names, and which specimen and view. */
export interface FilenameIdentity {
  /** The slug the filename claims — NOT necessarily where the catalogue files it. */
  readonly slug: string;
  readonly specimen: string;
  readonly view: 'D' | 'V';
}

/**
 * Read a photograph's filename the way the ingest pipeline reads it, or null
 * when it carries no specimen tail at all.
 *
 * ONE PARSER, THREE CONSUMERS. `ingest-photos.ts` decides which species a TIFF
 * is filed under from its filename; `check-photo-determinations.ts` compares
 * that reading against the catalogue; `migrate-determined-photo-tiles.ts`
 * reconstructs the tile path that reading produced. If those three disagree
 * about what a filename says, the gate cannot see the case it exists to catch —
 * which is exactly what a privately-rolled regex requiring a hyphen before the
 * specimen did: it was blind to the seven space-separated names
 * (`Euxoa absona A-D`, `Euxoa lucida …`, `Syngrapha surena A-D`) that ingest
 * admits on purpose and has already tiled.
 *
 * The slug half is `normalizeSlug` over the tail-stripped name rather than
 * `extractBinomial`, because that helper splits on the first space and reads
 * `Mniotype aff tenera-B-V` as "mniotype aff" — dropping the epithet of a real
 * species. Both halves must be right: the specimen tail decides the tile path,
 * the binomial decides the species.
 *
 * Returns null without a parseable specimen AND view, so non-photo objects
 * (`Veins_jpg.jpg`) do not yield a confident-looking slug.
 */
export function identityFromFilename(filename: string): FilenameIdentity | null {
  if (typeof filename !== 'string' || !filename) return null;
  // Accepts a filename OR a bare stem. `parseSpecimenAndView` anchors on a file
  // extension, but the determinations file is keyed by stem — so callers reach
  // this with `Amphipoea keiferi-A-D` and would get nothing back. Re-attaching a
  // synthetic extension is what lets one reader serve both, rather than each
  // consumer deciding for itself what a name looks like, which is the drift this
  // helper exists to end.
  const stem = toPhotoStem(filename);
  const { specimen, view } = parseSpecimenAndView(`${stem}.x`);
  if (!specimen || (view !== 'D' && view !== 'V')) return null;
  const slug = normalizeSlug(stripSpecimenTail(stem));
  if (!slug) return null;
  return { slug, specimen, view };
}

/** Strip a file extension, leaving the stem that identifies the photograph. */
export function toPhotoStem(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

/**
 * Every determination, keyed by photo stem.
 *
 * Absent file is not an error — it means no determination has ever been needed.
 * A repeated stem is, and so is an empty one: two rulings about one photograph
 * cannot both be applied and picking one silently is how the wrong one wins,
 * while a ruling with no photograph attached can never be applied at all and
 * would not even reach check A, which needs a stem to report.
 */
export function readPhotoDeterminations(
  path: string = DETERMINATIONS_PATH,
): Map<string, PhotoDetermination> {
  if (!existsSync(path)) return new Map();
  const rows = parse(readFileSync(path), {
    columns: true,
    skip_empty_lines: true,
  }) as PhotoDetermination[];

  const byStem = new Map<string, PhotoDetermination>();
  for (const row of rows) {
    const stem = (row.photo_stem ?? '').trim();
    if (!stem) {
      // A row with no key is a ruling that can never be applied: it re-files
      // nothing, and check A cannot report it because there is no stem to
      // report. Silently dropping it is how a curator's answer goes missing.
      throw new Error(
        `[photo-determinations] a row in ${path} has an empty photo_stem ` +
          `(species_slug=${row.species_slug ?? ''}, source=${row.source ?? ''}). ` +
          `A determination with no photograph to attach to cannot be applied.`,
      );
    }
    if (byStem.has(stem)) {
      throw new Error(
        `[photo-determinations] "${stem}" appears twice in ${path}. ` +
          `One photograph, one determination — supersede the old row rather than adding a second.`,
      );
    }
    byStem.set(stem, {
      photo_stem: stem,
      species_slug: (row.species_slug ?? '').trim(),
      specimen: (row.specimen ?? '').trim(),
      source: (row.source ?? '').trim(),
      note: (row.note ?? '').trim(),
    });
  }
  return byStem;
}

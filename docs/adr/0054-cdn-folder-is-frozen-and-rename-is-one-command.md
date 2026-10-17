# 0054. A photograph's CDN folder is frozen when it is published, and a species rename is one command

**Status:** Accepted · Refines [0038](0038-photo-identity-is-data-not-filename.md) · Issue [#417](https://github.com/pnwinsects/pnwmoths/issues/417)

## Context

A species slug does three jobs at once. It is the public address of the account page, it is the key that joins about 15 data files, and it is the name of the folder that holds the species' photographs on the CDN. The slug is derived from the scientific name, and scientific names are what the curator keeps changing.

The cost shows in [#416](https://github.com/pnwinsects/pnwmoths/pull/416), which renamed six species to MPG's spelling. Five of the six changed by one letter, for example *Malacosoma californicum* to *californica*. The pull request touched 26 data files, re-keyed 158 rows of `data/image-derivatives.csv`, and needed a 172-line script that copied 4,023 objects to new CDN folders. A maintainer had to run that script with the Bunny password before the deploy, and until it ran the photographs on five public pages returned 404. We carry 26 redirects, 76 synonym rows and about 120 commits about renames or genus fixes. `docs/lessons-learned.md` has a lesson from most of them.

[ADR 0038](0038-photo-identity-is-data-not-filename.md) already decided that a photograph's filename is a permanent opaque identifier. The folder it sits in had no such protection.

## Decision

1. **The CDN folder is frozen when an object is first published, and it is data.**
   - `data/images.csv` gets a `cdn_folder` column. It names the folder holding the photograph's original and, under `derived/`, its derivatives.
   - `data/species-photos-manifest.csv` gets a `cdn_folder` column. It names the folder under `species-tiles/` that holds a specimen's tile pyramid and under `derived/species-tiles/` its thumbnails. It is set when the tiles are uploaded. `tiles_path` in `data/species-photos.json` is built from it.
   - Plates are not affected: their folders are named for the plate, not the species.
   - A species rename changes `species_slug`. It never changes `cdn_folder`, so no CDN object moves, no derivative row is re-keyed, and no password is needed.
2. **One module builds a photograph's path.** `src/_lib/photo-path.ts` is the only place that joins a folder and a filename. Templates, the build scripts and the browser components call it, and a source scan in the build fails if any other file builds `<slug>/<filename>` by hand. The one-off `migrate-*` scripts, which hard-code both names of a pair, are listed as exceptions.
3. **Data that reaches the browser carries the folder only when it differs from the slug.** `nav_folder` on a key-matrix species and `thumb_url` on a browse image are written only for a species that has been renamed. Until the first rename after this change, the built site is byte-identical to the one before it, which is how the change was checked.
4. **The slug stays the key between data files and the public address.** Contributors edit these CSVs by hand without a build, and a readable key is part of that. `species.csv` already has a numeric `id`, so a later switch to ids stays possible. This ADR does not do it.
5. **One command does a rename.** `npm run species:rename -- old-slug new-slug` re-keys the slug in every file listed in `RELATIONS` in [`check-referential-integrity.ts`](../../scripts/check-referential-integrity.ts) and in the other places a slug is embedded (records, the key's synonym table, `species-photos.json`, the manifest, the checklist order, the species page's Markdown file). It adds the redirect and the synonym row, and it fails if any file still holds the old slug afterwards. `DRY_RUN=1` lists what it would change, and a second run changes nothing.

## Consequences

- A rename edits data files and moves nothing on the CDN. The copy scripts of #266, #303, #369 and the like are no longer needed for a rename. They stay in the repository as the record of what was done.
- `cdn_folder` becomes a rule every photograph path must follow. A mistake there fails quietly (a wrong folder) rather than loudly (a 404 from a missing copy). Three guards cover this: the source scan from item 2, the derivatives check, which compares every row of `data/image-derivatives.csv` with the path built from `cdn_folder`, and a test that runs a renamed species through every surface that shows a photograph.
- Existing rows are filled in once. `cdn_folder` takes the folder each object sits in today, which is the current slug for every species renamed so far, because those renames copied the objects to the new folder. The old folders are still on the CDN, listed as leftovers in `data/cdn-retired-images.csv`.
- A folder name that differs from the species slug is not an error. `emit-cdn-inventory.ts` accounts for objects by folder and filename, not by whether the folder is a current slug.
- Merging two species, or moving a photograph from one species to another, still copies objects, because the photograph's folder is the one it was first published into and the new species' other photographs may sit elsewhere. Only a rename is made free.

## Alternatives considered

- **Switch every join to the numeric id.** It removes the problem completely, but every CSV becomes unreadable to the people who edit them, and every file changes at once.
- **Keep re-keying by hand, with a checklist.** This is what `docs/lessons-learned.md` already is, and each rename found a new file that had been missed.
- **Make the deploy copy the photographs.** [ADR 0001](0001-static-no-server.md) keeps pipeline operations on a maintainer's machine, and the copy is the step that needs the password.
- **One folder per species instead of per photograph.** Simpler, but a merge or a re-determination (ADR 0038) leaves some of a species' photographs in another species' folder, so one value per species cannot say where they are.

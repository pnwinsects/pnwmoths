# Legacy species photos — backup→bunny migration

## Resolution (2026-06-27)

The ~73 species showing the gray placeholder on /identify/ and species browse cards
were NOT photo-less and NOT a filename typo. Their flat `.jpg` thumbnails exist in the
original WWU site backup (`pnwmoths_https.tar.xz` → `django/pnwmoths/static/media/moths/`)
but were never copied to the bunny CDN by the original migration. data/images.csv
catalogued them all along.

**All 181 catalog rows (179 files, 73 species) recovered from the backup — verified.**

### Fix (this change)
- `data/images.csv`: 181 rows normalized underscore→space to the CDN convention
  (e.g. `Xestia_atrata-A-D.jpg` → `Xestia atrata-A-D.jpg`).
- `scripts/migrate-legacy-photos.ts` (`npm run migrate:legacy-photos`): uploads each
  backup file to `{slug}/{space-name}` on the bunny pnwmoths zone, idempotent.
  Run once with the key (no server — runs locally):

      # 1. extract the source files from the backup
      tar --fast-read -xJf ~/dev/pnwinsects-app/pnwmoths_https.tar.xz \
        -T /tmp/mig_members.txt -C /tmp/legacy-moths
      # 2. dry run (read-only)
      DRY_RUN=1 LEGACY_PHOTOS_SRC=/tmp/legacy-moths/.../media/moths npm run migrate:legacy-photos
      # 3. real upload
      BUNNY_API_KEY=... LEGACY_PHOTOS_SRC=/tmp/legacy-moths/.../media/moths npm run migrate:legacy-photos

Once uploaded, all 73 species (incl. Smerinthus cerisyi, Apantesis bolanderi) show photos.

### Irregular names to review (optional)
A handful of old-site names had underscores where the convention uses a hyphen, so
`_`→` ` yields a space before the view code (e.g. `Apantesis bolanderi D.jpg`,
`Euxoa absona A-D.jpg`, `Hecatera dysodea B D.jpeg`). Functional, but hand-fix to
`-D`/`-A-D` if strict consistency is wanted.

### Note: backup vs new pipeline
The backup `media/moths/` is the authoritative source for flat species thumbnails; it
lacked the original plate TIFFs (those came later via the Dropbox→tile pipeline), but is
otherwise more complete/up-to-date for the flat images.

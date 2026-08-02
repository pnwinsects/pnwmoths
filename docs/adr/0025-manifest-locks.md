# 0025. Pipeline manifests are guarded by a pid lock; nothing else in the repo is

**Status:** Accepted

## Context

Two pipelines keep their run state in a CSV that every stage rewrites in full: the photo
pipeline's `data/species-photos-manifest.csv` (`ingest-photos.ts`, `tile-photos.ts`,
`upload-tiles.ts`) and the derivatives pipeline's `var/derivatives-manifest.csv`
(`generate-derivatives.ts`, `upload-derivatives.ts`). Each stage loads every row into memory,
mutates a few, and writes the whole file back — periodically, as a checkpoint, and again on exit.

Two of them running at once do not corrupt anything. The last writer produces a perfectly valid
CSV that is simply missing the other's status changes.

That is not hypothetical. During the [#224](https://github.com/pnwinsects/pnwmoths/issues/224)
pilot, `upload-derivatives.ts` put 20 files on the CDN and the still-running
`generate-derivatives.ts` then wrote its stale in-memory manifest, resetting all 20 rows from
`uploaded` back to `generated`. **Every direct check said success**: the uploader reported
`20 uploaded, 0 failed`, the objects were on the CDN, and all 20 fetched byte-identical. The only
visible symptom was an arithmetic oddity — a status line whose buckets summed to the row total with
no `uploaded` bucket in it. A lock went in with
[#233](https://github.com/pnwinsects/pnwmoths/issues/233), scoped to that pipeline.

The photo pipeline had the same shape and no lock, and is more exposed rather than less. Tiling is
a resumable multi-hour run over ~1 TB ([0013](0013-highres-osd-dzi.md)), which makes *"tiling is 60%
done, let me start uploading the ones that are finished"* the natural maintainer instinct — and the
exact move that triggers this. The blast radius is worse than 20 rows: statuses reset from
`uploaded` or `tiled` to an earlier stage mean re-tiling or re-uploading work already done, in a run
measured in hours ([#234](https://github.com/pnwinsects/pnwmoths/issues/234)).

## Decision

`scripts/lib/manifest-lock.ts` holds the mechanism, neutral to either pipeline: a pid file, a second
claimant that refuses to start with a message naming the holder, and takeover of a lock whose holder
is dead. Each pipeline binds it to its own manifest — `holdManifestLock()` in `scripts/lib/manifest.ts`
for the photo pipeline, `DERIVATIVES_MANIFEST_WRITERS` for the derivatives scripts.

Four properties are load-bearing:

1. **The claim is atomic** — the pid is written to a staging file and `link`ed into place, never
   `existsSync` followed by a write. A check-then-write claim is itself a read-modify-write race,
   which would make the lock an instance of the bug it exists to prevent. `link` rather than an
   `O_EXCL` create because an exclusive create still leaves the file zero-length between create and
   write, and a claimant reading it in that window would see no pid, call the lock garbage, and
   delete the winner's.
2. **The lock is taken before `readManifest`, not before the first write.** The damage is done by a
   *stale read*: a run that has already loaded the rows cannot be made safe by locking later. A
   source-level test in `scripts/lib/manifest-lock.test.ts` pins the ordering, because the two
   arrangements look equally sensible in a diff.
3. **A stale lock is taken over, never waited on.** These are interruptible multi-hour runs on one
   workstation, and a lock file left by a `kill -9` must not be the thing that stops the next
   attempt. Same for an empty or hand-mangled lock file.
4. **`DRY_RUN` does not lock.** It writes nothing, and peeking at the manifest during a long run is
   exactly when a maintainer wants a dry run. `THUMBNAIL_ONLY` *does* lock despite writing no
   statuses — it reads a file another stage may be rewriting under it.

The scope rule is not "lock every shared file". It is **long-running scripts sharing whole-file
read-modify-write state that a human would plausibly overlap** — the photo pipeline and the
derivatives pipeline, and nothing else in this repo. Two deliberate exclusions:

- **The `build:site` chain** is strictly sequential via `&&`. A lock there buys nothing and adds a
  new way for builds to fail.
- **`data/records.csv`**, despite four writers (`backfill-legacy-county`, `dedup-records`,
  `fill-district-from-coords`, `recover-clipped-bc-records`). They are one-shot maintainer
  migrations rather than pipeline stages, they take minutes not hours, and nobody has a reason to
  overlap them.

## Consequences

- A maintainer who starts the "wrong" second stage gets an immediate, named refusal instead of an
  invisible rollback discovered days later — or never.
- `holdManifestLock()` and its wiring are guarded at the source level: a fourth writer of the photo
  manifest that forgets to lock, or locks after reading, fails the test suite. The lock's own unit
  tests would not catch either, since the #234 bug was never a broken lock — it was three scripts
  that did not take one.
- The refusal is per-machine, by design. Nothing here defends against two people running the
  pipeline on two laptops; the manifest is a committed file and git is what mediates that.
- A run killed with `SIGKILL` leaves a lock file behind. The next run takes it over silently, which
  is right for a workstation pipeline and would be wrong for a shared host.

## Alternatives considered

- **Lock every script that writes a shared file.** Rejected: it would put a lock on the sequential
  build chain and on one-shot migrations, where it can only add failure modes. The rule above is
  narrower on purpose, and stated so the next writer can tell which side they are on.
- **Per-row or append-only journaling instead of whole-file rewrite.** This removes the hazard at
  the root rather than guarding it, but it changes the manifest from something a curator opens in a
  spreadsheet and sorts ([0002](0002-flat-files-over-cms.md)) into an append log. The manifest *is*
  the investigation queue; that property is worth more than the concurrency it costs.
- **Merge on write** — re-read the file and reconcile before each checkpoint. Rejected: it makes
  every writer's correctness depend on a conflict-resolution rule for statuses that can legitimately
  move in both directions (`failed` → retried), to support an overlap nobody actually needs.
- **`O_EXCL` lock with no takeover.** Rejected on the interrupted-run case: the first `kill -9`
  during a 1 TB tiling run would leave a lock only manual `rm` could clear, and the runbook step
  telling maintainers to delete a lock file is a step that teaches them to delete it while it is
  live.
- **Racing real processes as the test for atomicity.** Rejected on measurement: eight processes
  released off a shared wall-clock deadline still serialized cleanly against a deliberately
  check-then-write claim, so the test would have passed the bug. Exclusivity is asserted directly
  on the claim instead, and a two-process test covers the end-to-end refusal.
- **Advisory warning instead of refusal** ("another run may be in progress"). Rejected: the whole
  failure mode is that every visible signal already said success. A warning is one more signal to
  miss.

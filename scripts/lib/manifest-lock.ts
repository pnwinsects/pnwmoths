/**
 * scripts/lib/manifest-lock.ts
 *
 * Mutual exclusion for a pipeline manifest that its writers rewrite in full.
 *
 * The pattern this guards is whole-file read-modify-write: a script loads every
 * row into memory, mutates a few, and rewrites the file. Two such scripts
 * running at once do not corrupt the CSV — the last writer produces a perfectly
 * valid file that silently omits the other's status changes.
 *
 * That is exactly what happened during the #224 pilot: upload-derivatives.ts put
 * 20 files on the CDN, and the still-running generate-derivatives.ts then wrote
 * its stale in-memory manifest, resetting all 20 rows from `uploaded` back to
 * `generated`. Every direct check said success — the uploader reported
 * `20 uploaded, 0 failed`, the objects were on the CDN and fetched byte-identical.
 * The only symptom was a status line whose buckets summed to the row total with
 * no `uploaded` bucket in it.
 *
 * The rule worth applying is not "lock every shared file" — it is *long-running
 * scripts sharing whole-file read-modify-write state that a human would
 * plausibly overlap*. That is the photo pipeline and the derivatives pipeline
 * and nothing else in the repo ([ADR 0025](../../docs/adr/0025-manifest-locks.md)).
 *
 * A stale lock (holder died) is taken over rather than blocking forever: these
 * are multi-hour interruptible runs on one workstation, and a lock file left by
 * a `kill -9` must not be the thing that stops the next attempt.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync, linkSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Take the lock, or throw naming the process that holds it.
 *
 * Re-entrant for the same pid so a retry inside one run cannot deadlock.
 *
 * The claim is atomic, never a check followed by a write. "Does a live holder
 * exist? No — then write my pid" is itself a read-modify-write race: two runs
 * started close enough together both see no holder, both write, and both proceed
 * believing they hold it. That is the same lost-update shape the lock exists to
 * prevent, so the kernel decides the winner, not this code.
 *
 * @param lockPath  pid file guarding the manifest
 * @param pid       claimant; injectable so tests can stand in for a second run
 * @param writers   the scripts that share this manifest, for the error message
 *                  (e.g. `'ingest-photos.ts, tile-photos.ts and upload-tiles.ts'`)
 */
export function acquireManifestLock(
  lockPath: string,
  pid: number = process.pid,
  writers = 'the scripts that share it',
): void {
  mkdirSync(dirname(lockPath), { recursive: true });

  // Bounded: each iteration either wins, refuses, or clears exactly one dead
  // holder. Looping unbounded on a lock that keeps reappearing would hang a run
  // with no output, which is worse than refusing.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (claimLock(lockPath, pid)) return;

    const holder = readHolder(lockPath);
    if (holder === pid) return; // already ours — a retry inside one run
    if (holder && isProcessAlive(holder)) {
      throw new Error(
        `Manifest is locked by pid ${holder} (${lockPath}). `
        + `${writers} must not run at the same time — each rewrites the manifest in full, `
        + 'so the last writer would silently discard the other\'s status changes. '
        + `Wait for pid ${holder} to finish, or kill it if it is stuck.`,
      );
    }

    // Dead holder, empty file, or released between our claim and our read.
    // Clear it and race for it again — if another stale-lock breaker beats us to
    // the create, the next iteration finds *it* alive and refuses, so breaking a
    // stale lock cannot produce two winners either.
    try {
      unlinkSync(lockPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  throw new Error(
    `Could not take the manifest lock at ${lockPath}: it is being claimed and released `
    + 'repeatedly. Check what else is running before starting this again.',
  );
}

/**
 * Publish the pid file atomically. False means someone else got there first.
 *
 * Write-then-link rather than `writeFileSync(..., { flag: 'wx' })`: an exclusive
 * create still leaves the file zero-length between the create and the write, and
 * a claimant that read it in that window would see no pid, conclude the lock was
 * garbage, and delete the winner's lock. `link` is atomic and publishes a file
 * that already contains the pid, so the lock is never observable as empty.
 *
 * Exported only so a test can assert the exclusivity directly: the window this
 * closes is microseconds wide, so racing real processes at it does not reliably
 * reproduce a check-then-write bug (measured — eight processes released off a
 * shared deadline still serialized cleanly).
 */
export function claimLock(lockPath: string, pid: number): boolean {
  const staging = `${lockPath}.${pid}.tmp`;
  writeFileSync(staging, String(pid));
  try {
    linkSync(staging, lockPath);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw err;
  } finally {
    try {
      unlinkSync(staging);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}

/** The pid in the lock file, or 0 if it is gone, empty, or not a number. */
function readHolder(lockPath: string): number {
  try {
    return Number(readFileSync(lockPath, 'utf8').trim()) || 0;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw err;
  }
}

/** Drop the lock. Idempotent — safe to call when it was never taken. */
export function releaseManifestLock(lockPath: string): void {
  if (existsSync(lockPath)) unlinkSync(lockPath);
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means it exists but belongs to another user — still alive.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

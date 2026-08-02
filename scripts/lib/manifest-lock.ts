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

import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Take the lock, or throw naming the process that holds it.
 *
 * Re-entrant for the same pid so a retry inside one run cannot deadlock.
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
  if (existsSync(lockPath)) {
    const holder = Number(readFileSync(lockPath, 'utf8').trim());
    if (holder && holder !== pid && isProcessAlive(holder)) {
      throw new Error(
        `Manifest is locked by pid ${holder} (${lockPath}). `
        + `${writers} must not run at the same time — each rewrites the manifest in full, `
        + 'so the last writer would silently discard the other\'s status changes. '
        + `Wait for pid ${holder} to finish, or kill it if it is stuck.`,
      );
    }
  }
  mkdirSync(dirname(lockPath), { recursive: true });
  writeFileSync(lockPath, String(pid));
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

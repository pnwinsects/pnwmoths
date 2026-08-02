import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { acquireManifestLock, releaseManifestLock, isProcessAlive } from './manifest-lock.ts';

const lockPath = join(tmpdir(), `pnwmoths-manifest-lock-${process.pid}.lock`);

describe('manifest lock', () => {
  it('refuses to run while a live process holds the lock', () => {
    acquireManifestLock(lockPath, process.pid);
    // A different pid that is definitely alive: our own parent-safe stand-in.
    assert.throws(
      () => acquireManifestLock(lockPath, process.pid + 1),
      /locked by pid/,
      'a second holder must be rejected, not silently allowed to clobber',
    );
    releaseManifestLock(lockPath);
  });

  it('names the holder and the scripts that contend for the manifest', () => {
    acquireManifestLock(lockPath, process.pid);
    assert.throws(
      () => acquireManifestLock(lockPath, process.pid + 1, 'a.ts and b.ts'),
      (err: Error) => {
        // The message is the whole user interface of this lock: a maintainer who
        // hits it mid-run has to learn which process to wait for and why.
        assert.match(err.message, new RegExp(`pid ${process.pid}\\b`));
        assert.match(err.message, /a\.ts and b\.ts/);
        assert.match(err.message, /discard/);
        return true;
      },
    );
    releaseManifestLock(lockPath);
  });

  it('records the holder pid so the message can name it', () => {
    acquireManifestLock(lockPath, 4242);
    assert.equal(readFileSync(lockPath, 'utf8').trim(), '4242');
    releaseManifestLock(lockPath);
  });

  it('takes over a stale lock rather than blocking forever', () => {
    writeFileSync(lockPath, '999999999'); // a pid that cannot exist
    assert.doesNotThrow(() => acquireManifestLock(lockPath, process.pid));
    releaseManifestLock(lockPath);
  });

  it('takes over a garbage lock file rather than wedging the pipeline', () => {
    // A truncated write or a hand-edited file must not become unrecoverable
    // state — Number('') is 0, which is falsy, so no holder is claimed.
    writeFileSync(lockPath, '');
    assert.doesNotThrow(() => acquireManifestLock(lockPath, process.pid));
    releaseManifestLock(lockPath);
  });

  it('creates the lock directory when it does not exist yet', () => {
    // var/ is gitignored, so the very first run on a fresh clone finds no dir.
    const nestedDir = join(tmpdir(), `pnwmoths-lock-dir-${process.pid}`);
    const nested = join(nestedDir, 'deep', 'manifest.lock');
    rmSync(nestedDir, { recursive: true, force: true });
    assert.doesNotThrow(() => acquireManifestLock(nested, process.pid));
    rmSync(nestedDir, { recursive: true, force: true });
  });

  it('is re-entrant for the same pid, so a retry does not deadlock', () => {
    acquireManifestLock(lockPath, process.pid);
    assert.doesNotThrow(() => acquireManifestLock(lockPath, process.pid));
    releaseManifestLock(lockPath);
  });

  it('release is idempotent', () => {
    releaseManifestLock(lockPath);
    assert.doesNotThrow(() => releaseManifestLock(lockPath));
  });

  it('reports a live process as alive and an impossible pid as dead', () => {
    assert.equal(isProcessAlive(process.pid), true);
    assert.equal(isProcessAlive(999999999), false);
  });
});

// ---------------------------------------------------------------------------
// Source-level invariant guard (same spirit as scripts/entry-point-guards.test.ts).
//
// The bug in #234 was not a broken lock — it was three scripts that never took
// one. A fourth writer added later would reintroduce it silently, and no unit
// test of the lock itself would notice, so the wiring is what gets pinned here.
// ---------------------------------------------------------------------------

const SCRIPTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function scriptSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return scriptSources(full);
    if (!entry.isFile() || !entry.name.endsWith('.ts')) return [];
    if (entry.name.endsWith('.test.ts')) return [];
    return [full];
  });
}

describe('manifest writers hold the lock', () => {
  const writers = scriptSources(SCRIPTS_DIR).filter((file) => {
    const src = readFileSync(file, 'utf8');
    // Importing writeManifest from lib/manifest.ts is what makes a script a
    // whole-file rewriter of data/species-photos-manifest.csv. Read-only
    // consumers (generate-species-photos.ts) import only readManifest and are
    // correctly not required to lock.
    return /import\s*{[^}]*\bwriteManifest\b[^}]*}\s*from\s*'\.\/lib\/manifest\.ts'/s.test(src);
  });

  it('finds the photo-pipeline writers', () => {
    assert.deepEqual(
      writers.map((f) => f.slice(SCRIPTS_DIR.length + 1)).sort(),
      ['ingest-photos.ts', 'tile-photos.ts', 'upload-tiles.ts'],
    );
  });

  it('every writer calls holdManifestLock', () => {
    const offenders = writers.filter((f) => !/holdManifestLock\(/.test(readFileSync(f, 'utf8')));
    assert.deepEqual(
      offenders,
      [],
      'A script that rewrites data/species-photos-manifest.csv must call '
      + 'holdManifestLock() before readManifest, or a concurrent run silently '
      + 'discards its status changes (#234).',
    );
  });

  it('takes the lock before reading, since a stale read is the bug', () => {
    for (const file of writers) {
      const src = readFileSync(file, 'utf8');
      // Compare first occurrences: locking after the rows are in memory is the
      // failure mode itself, not a lesser version of it.
      assert.ok(
        src.indexOf('holdManifestLock(') < src.indexOf('await readManifest('),
        `${file} reads the manifest before taking the lock`,
      );
    }
  });
});

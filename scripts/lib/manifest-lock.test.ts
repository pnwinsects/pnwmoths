import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { acquireManifestLock, releaseManifestLock, isProcessAlive, claimLock } from './manifest-lock.ts';

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

  it('does not overwrite a live holder when it refuses', () => {
    // The loser must leave the file alone. If refusing also rewrote the pid, the
    // holder's own release would delete a lock it no longer owns.
    acquireManifestLock(lockPath, process.pid);
    assert.throws(() => acquireManifestLock(lockPath, process.pid + 1));
    assert.equal(readFileSync(lockPath, 'utf8').trim(), String(process.pid));
    releaseManifestLock(lockPath);
  });

  it('reports a live process as alive and an impossible pid as dead', () => {
    assert.equal(isProcessAlive(process.pid), true);
    assert.equal(isProcessAlive(999999999), false);
  });

  it('claims exclusively — a second claimant loses instead of overwriting', () => {
    // The property that makes the lock a lock. "Is anyone holding it? No — then
    // write my pid" is itself a read-modify-write race: two runs started close
    // enough together both pass the check and both proceed. Asserted directly
    // rather than by racing processes, because the window is microseconds wide —
    // eight processes released off a shared wall-clock deadline still serialize
    // cleanly, so a race test would pass against a check-then-write lock too.
    const p = join(tmpdir(), `pnwmoths-claim-${process.pid}.lock`);
    rmSync(p, { force: true });
    assert.equal(claimLock(p, 111), true);
    assert.equal(claimLock(p, 222), false, 'the second claimant must lose the create, not win it');
    assert.equal(readFileSync(p, 'utf8'), '111', 'the loser must not overwrite the holder');
    rmSync(p, { force: true });
  });

  it('never publishes a lock file that is missing its pid', () => {
    // An exclusive create (`wx`) leaves the file zero-length between create and
    // write. A claimant reading it in that window would see no pid, call the lock
    // garbage, and delete the winner's lock — so the pid is written first and the
    // finished file is linked into place.
    const p = join(tmpdir(), `pnwmoths-claim-atomic-${process.pid}.lock`);
    rmSync(p, { force: true });
    claimLock(p, 4242);
    assert.equal(readFileSync(p, 'utf8').trim(), '4242');
    rmSync(p, { force: true });
  });

  it('holds across real processes, not just within one', async () => {
    // Everything above is in-process. This is the only check that the lock a
    // maintainer actually hits — a separate `node scripts/…` invocation — refuses.
    const racePath = join(tmpdir(), `pnwmoths-lock-race-${process.pid}.lock`);
    rmSync(racePath, { force: true });
    const modulePath = fileURLToPath(new URL('./manifest-lock.ts', import.meta.url));

    const run = (holdMs: number): Promise<number | null> => new Promise((done) => {
      const child = spawn(process.execPath, ['-e', `
        const { acquireManifestLock } = await import(${JSON.stringify(modulePath)});
        try {
          acquireManifestLock(${JSON.stringify(racePath)});
          await new Promise((r) => setTimeout(r, ${holdMs}));
          process.exit(0);
        } catch { process.exit(3); }
      `], { stdio: 'ignore' });
      child.on('exit', done);
    });

    const holder = run(1200);
    await new Promise((r) => setTimeout(r, 300)); // let the holder take it first
    assert.equal(await run(0), 3, 'a second process must refuse while the first holds the lock');
    assert.equal(await holder, 0);
    rmSync(racePath, { force: true });
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

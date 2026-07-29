import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Source-level invariant guard (same spirit as check-ts-only.sh and eleventy.config.test.ts).
//
// A self-invocation guard written as `import.meta.url === \`file://${process.argv[1]}\``
// is ALWAYS false on Windows: process.argv[1] is a backslash path (C:\a\b.ts) while
// import.meta.url is a normalized file URL (file:///C:/a/b.ts). The script then loads,
// defines everything, calls nothing, and exits 0 — a silent no-op with a success code.
// The correct form is `pathToFileURL(process.argv[1]).href`.

const SCRIPTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)));

const NAIVE_GUARD = /import\.meta\.url\s*===\s*`file:\/\/\$\{process\.argv\[1\]\}`/;
const CORRECT_GUARD = /import\.meta\.url\s*===\s*pathToFileURL\(process\.argv\[1\]\)\.href/;
const ANY_GUARD = /import\.meta\.url\s*===/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      if (!entry.isFile() || !entry.name.endsWith('.ts')) return [];
      if (entry.name.endsWith('.test.ts')) return [];
      return [full];
    });
}

describe('entry-point guards', () => {
  const files = sourceFiles(SCRIPTS_DIR);

  it('finds script sources to check', () => {
    assert.ok(files.length > 20, `expected many scripts, found ${files.length}`);
  });

  it('no script uses the naive `file://${process.argv[1]}` comparison', () => {
    const offenders = files.filter((f) => NAIVE_GUARD.test(readFileSync(f, 'utf8')));
    assert.deepEqual(
      offenders,
      [],
      'These scripts silently no-op on Windows. Use ' +
        '`if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)` instead.',
    );
  });

  it('every import.meta.url entry-point comparison uses pathToFileURL', () => {
    const offenders = files.filter((f) => {
      const src = readFileSync(f, 'utf8');
      return ANY_GUARD.test(src) && !CORRECT_GUARD.test(src);
    });
    assert.deepEqual(offenders, []);
  });

  it('the correct guard actually matches on this platform', () => {
    const argv1 = fileURLToPath(import.meta.url);
    assert.equal(import.meta.url, pathToFileURL(argv1).href);
  });

  it('the naive form is broken on Windows-style paths', { skip: process.platform !== 'win32' }, () => {
    const argv1 = fileURLToPath(import.meta.url);
    assert.notEqual(import.meta.url, `file://${argv1}`);
  });
});

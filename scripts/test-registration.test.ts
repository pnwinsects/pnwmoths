import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Source-level invariant guard (same spirit as entry-point-guards.test.ts).
//
// `npm test` names its test files explicitly rather than globbing the tree, so a
// new `*.test.ts` runs only if someone remembers to add it. Forgetting is
// SILENT: the suite stays green, the count goes up by zero, and the file looks
// like coverage it is not providing. Four files had drifted out this way —
// upload-derivatives, audit-optimizer-usage, backfill-tribe and (initially)
// report-link-rot — 39 passing tests that nothing ever ran.
//
// The explicit list is deliberate (ordering matters for the data-pipeline tests,
// and some files are slow), so the fix is not a glob — it is this check.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Every `*.test.ts` under the directories `npm test` draws from. */
function testFilesOnDisk(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.test.ts')) found.push(relative(ROOT, full));
    }
  };
  walk(join(ROOT, 'scripts'));
  walk(join(ROOT, 'src'));
  // Root-level tests too (eleventy.config.test.ts), but not recursively — that
  // would descend into node_modules and _site.
  for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.test.ts')) found.push(entry.name);
  }
  return found.sort();
}

/**
 * The test-file arguments of the `npm test` command.
 *
 * Both quoting styles appear and both work, for different reasons: a bare
 * `src/components/*.test.ts` is expanded by the shell before node sees it, while
 * a quoted `'scripts/lib/*.test.ts'` reaches node as a literal and is expanded
 * by node's own glob support. Either way one segment of `*` matches within a
 * single directory, so both are treated the same here.
 */
function registeredPatterns(): string[] {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as
    { scripts: Record<string, string> };
  const command = pkg.scripts['test'] ?? '';
  return [...command.matchAll(/'([^']+\.test\.ts)'|(\S+\.test\.ts)/g)]
    .map((m) => m[1] ?? m[2] ?? '')
    .filter(Boolean);
}

function matches(pattern: string, file: string): boolean {
  if (!pattern.includes('*')) return pattern === file;
  const rx = new RegExp(`^${pattern.split('*').map((p) =>
    p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`);
  return rx.test(file);
}

describe('test registration', () => {
  const onDisk = testFilesOnDisk();
  const patterns = registeredPatterns();

  it('finds test files and registered patterns', () => {
    assert.ok(onDisk.length > 50, `expected many test files, found ${onDisk.length}`);
    assert.ok(patterns.length > 20, `expected many registered patterns, found ${patterns.length}`);
  });

  it('every test file on disk is run by `npm test`', () => {
    const unrun = onDisk.filter((f) => !patterns.some((p) => matches(p, f)));
    assert.deepEqual(
      unrun,
      [],
      'These test files exist but `npm test` never runs them, so they are green by ' +
        'default and prove nothing. Add each to the "test" script in package.json.',
    );
  });

  it('every registered pattern matches at least one file on disk', () => {
    const stale = patterns.filter((p) => !onDisk.some((f) => matches(p, f)));
    assert.deepEqual(
      stale,
      [],
      'These entries in the "test" script match no file — renamed or deleted. ' +
        'A bare (unquoted) pattern that matches nothing is passed through literally ' +
        'and fails the run; a quoted one silently contributes zero tests.',
    );
  });

  it('matches within one directory segment only, like both glob expanders', () => {
    assert.equal(matches('src/components/*.test.ts', 'src/components/a.test.ts'), true);
    assert.equal(matches('src/components/*.test.ts', 'src/components/deep/a.test.ts'), false);
    assert.equal(matches('scripts/a.test.ts', 'scripts/a.test.ts'), true);
    assert.equal(matches('scripts/a.test.ts', 'scripts/b.test.ts'), false);
  });
});

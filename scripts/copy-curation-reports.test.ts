import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { copyCurationReports, missingSources } from './copy-curation-reports.ts';
import { copyPlan, curationReports } from '../src/_data/curationReports.ts';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

describe('copyPlan', () => {
  it('covers every manifest file that is not already emitted into _site', () => {
    const fromRepo = curationReports
      .flatMap((r) => r.files)
      .filter((f) => f.source !== null);
    assert.equal(copyPlan().length, fromRepo.length);
  });

  it('derives each destination from the href, so link and copy target agree', () => {
    for (const { dest } of copyPlan()) {
      assert.ok(dest.startsWith('curation/'), `${dest} should land under _site/curation/`);
      assert.ok(!dest.startsWith('/'), `${dest} must be _site-relative`);
    }
  });

  // The manifest is hand-edited; a typo here is a 404 the blocking link check would
  // only surface at the very end of a full build.
  it('names only files that exist in this repo', () => {
    const absent = copyPlan()
      .map((item) => item.source)
      .filter((source) => !existsSync(join(ROOT, source)));
    assert.deepEqual(absent, [], 'src/_data/curationReports.ts names files that are not on disk');
  });
});

describe('curationReports manifest', () => {
  it('has unique ids', () => {
    const ids = curationReports.map((r) => r.id);
    assert.deepEqual([...new Set(ids)].sort(), [...ids].sort());
  });

  it('has unique hrefs across every report', () => {
    const hrefs = curationReports.flatMap((r) => r.files).map((f) => f.href);
    assert.deepEqual([...new Set(hrefs)].sort(), [...hrefs].sort());
  });

  it('gives every report at least one file and a question', () => {
    for (const report of curationReports) {
      assert.ok(report.files.length > 0, `${report.id} has no files`);
      assert.ok(report.question.endsWith('?'), `${report.id}'s question is not a question`);
      assert.ok(report.body.length > 0, `${report.id} has no body`);
      assert.ok(report.regenerated.length > 0, `${report.id} does not say when it is regenerated`);
    }
  });

  it('uses only the two known audiences', () => {
    for (const report of curationReports) {
      assert.ok(
        report.audience === 'curation' || report.audience === 'engineering',
        `${report.id} has audience "${report.audience}"`,
      );
    }
  });

  it('lists curator-facing reports before engineering ones', () => {
    const audiences = curationReports.map((r) => r.audience);
    const firstEngineering = audiences.indexOf('engineering');
    assert.ok(firstEngineering > 0, 'expected at least one report in each section');
    assert.ok(
      !audiences.slice(firstEngineering).includes('curation'),
      'a curation report appears after an engineering one; the page renders manifest order',
    );
  });

  it('gives every reference either an absolute URL or a repo-relative path that exists', () => {
    for (const report of curationReports) {
      for (const ref of report.see) {
        if (ref.url.startsWith('http')) continue;
        assert.ok(
          existsSync(join(ROOT, ref.url)),
          `${report.id} references ${ref.url}, which is not in the repo`,
        );
      }
    }
  });
});

describe('copyCurationReports', () => {
  it('copies each source to its destination, creating directories', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'curation-copy-'));
    const srcDir = join(dir, 'src');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, 'a.csv'), 'x,y\n1,2\n');

    const count = await copyCurationReports(
      [{ source: join(srcDir, 'a.csv'), dest: 'curation/a.csv' }],
      join(dir, 'site'),
    );

    assert.equal(count, 1);
    assert.equal(readFileSync(join(dir, 'site/curation/a.csv'), 'utf8'), 'x,y\n1,2\n');
  });

  it('throws naming every missing source rather than shipping a page of 404s', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'curation-copy-'));
    await assert.rejects(
      () =>
        copyCurationReports(
          [
            { source: 'data/gone.csv', dest: 'curation/gone.csv' },
            { source: 'data/also-gone.csv', dest: 'curation/also-gone.csv' },
          ],
          dir,
          () => false,
        ),
      (error: Error) => {
        assert.match(error.message, /data\/gone\.csv/);
        assert.match(error.message, /data\/also-gone\.csv/);
        return true;
      },
    );
  });

  it('writes nothing at all when any source is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'curation-copy-'));
    const srcDir = join(dir, 'src');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, 'present.csv'), 'ok\n');

    await assert.rejects(() =>
      copyCurationReports(
        [
          { source: join(srcDir, 'present.csv'), dest: 'curation/present.csv' },
          { source: 'data/gone.csv', dest: 'curation/gone.csv' },
        ],
        join(dir, 'site'),
        (path) => existsSync(path),
      ),
    );

    assert.equal(existsSync(join(dir, 'site/curation/present.csv')), false);
  });
});

describe('missingSources', () => {
  it('returns the sources the predicate rejects, in manifest order', () => {
    const plan = [
      { source: 'a', dest: 'curation/a' },
      { source: 'b', dest: 'curation/b' },
      { source: 'c', dest: 'curation/c' },
    ];
    assert.deepEqual(missingSources(plan, (p) => p !== 'b'), ['b']);
    assert.deepEqual(missingSources(plan, () => true), []);
  });
});

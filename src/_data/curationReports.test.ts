// src/_data/curationReports.test.ts
// groupByAudience() exists because Nunjucks' selectattr silently does not filter
// (see the function's own comment). These are the guards for the grouping itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { curationReports, groupByAudience, copyPlan } from './curationReports.ts';

test('groupByAudience partitions the manifest with nothing lost or duplicated', () => {
  const groups = groupByAudience();
  assert.equal(groups.curation.length + groups.engineering.length, curationReports.length);
  assert.deepEqual(
    [...groups.curation, ...groups.engineering].map((r) => r.id).sort(),
    curationReports.map((r) => r.id).sort(),
  );
});

test('groupByAudience puts each report in exactly the section its audience names', () => {
  const groups = groupByAudience();
  assert.ok(groups.curation.every((r) => r.audience === 'curation'));
  assert.ok(groups.engineering.every((r) => r.audience === 'engineering'));
});

test('groupByAudience preserves manifest order within each group', () => {
  const groups = groupByAudience();
  const order = curationReports.map((r) => r.id);
  for (const group of [groups.curation, groups.engineering]) {
    const positions = group.map((r) => order.indexOf(r.id));
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  }
});

test('groupByAudience is pure — it groups whatever it is given', () => {
  const groups = groupByAudience([
    { id: 'x', title: 't', audience: 'engineering', question: 'q?', body: 'b', regenerated: 'r', files: [], see: [] },
  ]);
  assert.deepEqual(groups.curation, []);
  assert.equal(groups.engineering.length, 1);
});

test('both sections are non-empty, so neither heading introduces nothing', () => {
  const groups = groupByAudience();
  assert.ok(groups.curation.length > 0);
  assert.ok(groups.engineering.length > 0);
});

test('every copied report is one the page will actually render', () => {
  const rendered = new Set(groupByAudience().all.flatMap((r) => r.files).map((f) => f.href));
  for (const { dest } of copyPlan()) {
    assert.ok(rendered.has(`/${dest}`), `${dest} is copied but no report links it`);
  }
});

// /curation/ links repo files on GitHub's `main`, and lychee skips those URLs:
// checked over the network they would fail every PR that adds an ADR and cites
// it, and pass a link to a file the PR deletes (see lychee.toml). This checks
// them against the checked-out tree instead — what `main` becomes on merge.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('every repo file the manifest cites exists in this tree', () => {
  const repoPaths = curationReports.flatMap((r) => r.see.map((s) => s.url)).filter((u) => !/^https?:/.test(u));
  assert.ok(repoPaths.length > 5, 'expected the manifest to cite repo files');
  const missing = repoPaths.filter((p) => !existsSync(resolve(ROOT, p)));
  assert.deepEqual(missing, []);
});

test('every repo file the /curation/ template links on main exists in this tree', () => {
  const njk = readFileSync(resolve(ROOT, 'src/curation/index.njk'), 'utf8');
  const repoPaths = [...njk.matchAll(/\{\{\s*repoUrl\s*\}\}\/blob\/main\/([^"#?]+)/g)].map((m) => m[1] ?? '');
  assert.ok(repoPaths.length > 0, 'expected the template to link repo files');
  const missing = repoPaths.filter((p) => !existsSync(resolve(ROOT, p)));
  assert.deepEqual(missing, []);
});

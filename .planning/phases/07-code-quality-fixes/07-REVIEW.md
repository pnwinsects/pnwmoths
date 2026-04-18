---
phase: 07-code-quality-fixes
reviewed: 2026-04-18T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - scripts/build-data.test.js
  - scripts/check-page-weight.test.js
  - package.json
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-04-18
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Three test files were reviewed: regression tests for the build-data pipeline (`scripts/build-data.test.js`), regression tests for the page-weight checker (`scripts/check-page-weight.test.js`), and `package.json`. The tests are generally well-structured and the assertions correctly match the source behavior. Three warnings and two info items were found, all in the test files. No issues were found in `package.json`.

The most actionable issues are: (1) three async DuckDB tests do not close the connection on assertion failure, which can delay process exit; (2) the `check-page-weight.test.js` file writes setup code outside the `try` block, leaving the temp directory uncleaned if the initial write fails; and (3) the integration test for "good CSV" has no `try/finally` guard and no cleanup — though it writes to the real `data/parquet/` directory rather than a temp dir, so this is more a design note than a bug.

---

## Warnings

### WR-01: DuckDB connection not closed on assertion failure (three async tests)

**File:** `scripts/build-data.test.js:99-102`, `123-125`, `147-149`
**Issue:** The three async DuckDB tests (VALD-03, VALD-04, VALD-05) call `conn.closeSync()` only as the final statement. If any `assert.strictEqual` fails, an exception is thrown and `conn.closeSync()` is never reached. This leaves the DuckDB connection handle open for the remainder of the test run. Node.js's `node:test` runner can hang waiting for async resources to settle when handles are leaked, delaying the process exit and obscuring test failure output.

**Fix:** Wrap the body of each async DuckDB test in a `try/finally` block:

```js
test('build-data.js: state validation query catches invalid state values', async () => {
  const { DuckDBInstance } = await import('@duckdb/node-api');
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

  try {
    await conn.run(`
      CREATE TABLE records AS
      SELECT 'specimen' AS record_type, 47.0 AS latitude, -122.0 AS longitude, 'WA' AS state
      UNION ALL
      SELECT 'specimen', 47.0, -122.0, 'TX'
    `);

    const result = await conn.runAndReadAll(`
      SELECT DISTINCT state FROM records
      WHERE state NOT IN ('WA', 'OR', 'ID', 'BC', 'AB', 'MT')
        AND state IS NOT NULL AND state != ''
    `);
    const rows = result.getRowObjectsJS();

    assert.strictEqual(rows.length, 1, 'Should catch exactly 1 invalid state');
    assert.strictEqual(rows[0].state, 'TX', 'Invalid state should be TX');
  } finally {
    conn.closeSync();
  }
});
```

Apply the same pattern to the VALD-04 (line 107) and VALD-05 (line 130) tests.

---

### WR-02: check-page-weight.test.js setup code outside `try` block leaves temp dir uncleaned on write failure

**File:** `scripts/check-page-weight.test.js:13-15`, `36-38`
**Issue:** In both tests that create a fake site directory, `mkdirSync` and `writeFileSync` are called before the `try` block. If `writeFileSync` throws (disk full, permissions, etc.), the `finally { rmSync(...) }` cleanup never runs and `_site_test_weight` is left behind. The next test run then starts with a non-empty directory, which could cause the "no warning" test to emit a spurious warning from the leftover file.

```js
// Current pattern — mkdirSync/writeFileSync are outside try:
mkdirSync(FAKE_SITE, { recursive: true });
writeFileSync(join(FAKE_SITE, 'big.html'), bigHtml);
try {
  ...
} finally {
  rmSync(FAKE_SITE, ...);
}
```

**Fix:** Move all setup inside the `try` block so `finally` always runs:

```js
mkdirSync(FAKE_SITE, { recursive: true });
try {
  writeFileSync(join(FAKE_SITE, 'big.html'), bigHtml);
  const result = spawnSync(...);
  ...
} finally {
  rmSync(FAKE_SITE, { recursive: true, force: true });
}
```

---

### WR-03: Integration "good CSV" test has no cleanup guard and writes to the real `data/parquet/` tree

**File:** `scripts/build-data.test.js:154-167`
**Issue:** The test runs the full `build-data.js` pipeline against the real project data, which writes output to `data/parquet/`. There is no `try/finally` and no cleanup. If the script fails mid-run (e.g., DuckDB crashes after creating some directories), the test exits with an exception and partial parquet files are left on disk. More importantly, if a future refactor changes the output path, the test will silently pass if the old path still exists from a previous run (stale artifact false positive). This is also the only test that modifies the real project data directory rather than a temp dir.

**Fix:** At a minimum, assert on a specific Parquet file that is only present after a successful build. If the test is intended to be idempotent, consider cleaning the target directory before running:

```js
test('integration: build-data.js with good CSV produces Parquet files', () => {
  // Optionally remove stale output to prevent false positives
  rmSync(resolve(ROOT, 'data/parquet'), { recursive: true, force: true });
  execSync('node scripts/build-data.js', { cwd: ROOT, stdio: 'pipe' });
  assert.ok(existsSync(resolve(ROOT, 'data/parquet/acronicta-americana/records.parquet')));
  assert.ok(existsSync(resolve(ROOT, 'data/parquet/hyles-lineata/records.parquet')));
});
```

---

## Info

### IN-01: `spawnSync` spawn error not checked in page-weight tests 1 and 2

**File:** `scripts/check-page-weight.test.js:22-30`, `40-51`
**Issue:** Tests 1 and 2 (`spawnSync` calls) do not check `result.error` for spawn failure. Test 3 checks it (line 64), but tests 1 and 2 do not. If `node` is not found in `PATH` (unlikely but possible in CI), `result.error` is set and `result.status` is `null`, causing misleading assertion failures. The inconsistency with test 3 also makes the intent unclear.

**Fix:** Add a guard in the `try` block before asserting on output:

```js
assert.ok(!result.error, `spawn failed: ${result.error}`);
const output = result.stdout + result.stderr;
```

---

### IN-02: `package.json` `build` script missing `build:check-weight` in listed order match

**File:** `package.json:14`
**Issue:** The `build` script chains: `build:data && build:eleventy && build:copy-parquet && build:copy-images && build:pagefind && build:validate-links && build:check-weight`. The `build:check-weight` step runs after link validation, which is correct (page weight is a post-build check). No issue with correctness. However, `build:copy-images` is listed after `build:pagefind` in the script list (line 15 in package.json) but is referenced before `build:pagefind` in the `build` chain — this is a cosmetic inconsistency in property ordering that could confuse a reader scanning the scripts object.

**Fix:** Reorder the script definitions to match their execution order:
```json
"build:copy-parquet": "...",
"build:copy-images": "...",
"build:pagefind": "...",
```

---

_Reviewed: 2026-04-18_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

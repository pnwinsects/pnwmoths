import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import {
  COLUMNS,
  readManifest,
  writeManifest,
  sortForInvestigation,
  advanceStatus,
} from './manifest.js';

// ---------------------------------------------------------------------------
// COLUMNS — pins the D-05 manifest schema and column order
// ---------------------------------------------------------------------------
describe('COLUMNS', () => {
  it('has exactly 13 columns', () => {
    assert.equal(COLUMNS.length, 13);
  });

  it('matches the D-05 column order exactly', () => {
    assert.deepEqual(COLUMNS, [
      'content_hash',
      'dropbox_path',
      'size_bytes',
      'server_modified',
      'filename_raw',
      'binomial_raw',
      'specimen_id',
      'view',
      'binomial_resolved',
      'species_slug',
      'match_bucket',
      'status',
      'last_error',
    ]);
  });

  it('uses content_hash as the row-identity column (D-04)', () => {
    assert.equal(COLUMNS[0], 'content_hash');
  });

  it('terminates with last_error', () => {
    assert.equal(COLUMNS[COLUMNS.length - 1], 'last_error');
  });
});

// ---------------------------------------------------------------------------
// readManifest — first-run-safe (no throw on missing file)
// ---------------------------------------------------------------------------
describe('readManifest', () => {
  it('returns [] when the manifest file does not exist (first-run safe)', async () => {
    const missingPath = join(tmpdir(), `manifest-does-not-exist-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`);
    const rows = await readManifest(missingPath);
    assert.deepEqual(rows, []);
  });
});

// ---------------------------------------------------------------------------
// writeManifest → readManifest round-trip — locks the CSV contract
// (CSV quoting + header + column order survive a full write/read cycle)
// ---------------------------------------------------------------------------
describe('writeManifest → readManifest round-trip', () => {
  it('writes three rows and reads them back with all columns intact', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'manifest-roundtrip-'));
    const path = join(dir, 'm.csv');
    try {
      const input = [
        {
          content_hash: 'aaa1111111111111111111111111111111111111111111111111111111111111',
          dropbox_path: '/Abagrotis apposita-A-D.tif',
          size_bytes: '40000000',
          server_modified: '2026-05-21T10:00:00Z',
          filename_raw: 'Abagrotis apposita-A-D.tif',
          binomial_raw: 'abagrotis apposita',
          specimen_id: 'A',
          view: 'D',
          binomial_resolved: 'abagrotis apposita',
          species_slug: 'abagrotis-apposita',
          match_bucket: 'clean-match',
          status: 'discovered',
          last_error: '',
        },
        {
          content_hash: 'bbb2222222222222222222222222222222222222222222222222222222222222',
          dropbox_path: '/Grammia nevadensis-B-V.tif',
          size_bytes: '41000000',
          server_modified: '2026-05-21T10:00:01Z',
          filename_raw: 'Grammia nevadensis-B-V.tif',
          binomial_raw: 'grammia nevadensis',
          specimen_id: 'B',
          view: 'V',
          binomial_resolved: '',
          species_slug: '',
          match_bucket: 'genus-only',
          status: 'discovered',
          last_error: '',
        },
        {
          content_hash: 'ccc3333333333333333333333333333333333333333333333333333333333333',
          // Deliberate comma + double-quote + newline embedded in the value to
          // exercise csv-stringify quoting (T-26.02-02 mitigation).
          dropbox_path: '/weird, "path"/with\nnewline.tif',
          size_bytes: '42000000',
          server_modified: '2026-05-21T10:00:02Z',
          filename_raw: 'weird, "name".tif',
          binomial_raw: 'fake, comma binomial',
          specimen_id: 'A',
          view: 'D',
          binomial_resolved: '',
          species_slug: '',
          match_bucket: 'unparseable',
          status: 'discovered',
          last_error: '',
        },
      ];

      await writeManifest(path, input);
      const out = await readManifest(path);

      assert.equal(out.length, 3);
      // Field-by-field comparison; readManifest returns strings for all fields.
      for (let i = 0; i < input.length; i++) {
        for (const col of COLUMNS) {
          assert.equal(out[i][col], input[i][col], `row ${i} column ${col} survived round-trip`);
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('emits the COLUMNS header on the first line of the CSV', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'manifest-header-'));
    const path = join(dir, 'm.csv');
    try {
      await writeManifest(path, []);
      const { readFile } = await import('node:fs/promises');
      const raw = (await readFile(path)).toString();
      const firstLine = raw.split('\n')[0];
      assert.equal(firstLine, COLUMNS.join(','));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('respects COLUMNS order even when row objects omit fields', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'manifest-omit-'));
    const path = join(dir, 'm.csv');
    try {
      // Row only sets a couple of fields; the rest should be empty strings,
      // but column ORDER must still match D-05.
      const rows = [{ content_hash: 'hhh', match_bucket: 'clean-match' }];
      await writeManifest(path, rows);
      const out = await readManifest(path);
      assert.equal(out.length, 1);
      assert.equal(out[0].content_hash, 'hhh');
      assert.equal(out[0].match_bucket, 'clean-match');
      // Missing fields read back as the empty string.
      assert.equal(out[0].dropbox_path, '');
      assert.equal(out[0].last_error, '');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// sortForInvestigation — D-12 ordering: needs-investigation buckets first,
// ordered by binomial_raw frequency desc; clean rows trail in original order.
// ---------------------------------------------------------------------------
describe('sortForInvestigation', () => {
  it('returns [] for an empty input', () => {
    assert.deepEqual(sortForInvestigation([]), []);
  });

  it('returns a single-row array unchanged for a one-row input', () => {
    const rows = [{ binomial_raw: 'x', match_bucket: 'clean-match' }];
    assert.deepEqual(sortForInvestigation(rows), rows);
  });

  it('places investigation buckets first, ordered by binomial frequency desc, with clean rows trailing in original order', () => {
    // Six rows; investigation buckets in INVESTIGATION_BUCKETS (genus-only,
    // likely-synonym, provisional, unparseable) should rise to the top,
    // grouped by binomial_raw, with the most-frequent group first.
    const grammia1 = { binomial_raw: 'grammia nevadensis', match_bucket: 'genus-only',     _id: 'g1' };
    const grammia2 = { binomial_raw: 'grammia nevadensis', match_bucket: 'genus-only',     _id: 'g2' };
    const smerinthus = { binomial_raw: 'smerinthus ophthalmica', match_bucket: 'likely-synonym', _id: 's1' };
    const monostoecha = { binomial_raw: 'monostoecha n sp',  match_bucket: 'provisional',  _id: 'p1' };
    const clean1 = { binomial_raw: 'abagrotis apposita',     match_bucket: 'clean-match',  _id: 'c1' };
    const clean2 = { binomial_raw: 'abagrotis apposita',     match_bucket: 'clean-match',  _id: 'c2' };

    const input = [clean1, grammia1, smerinthus, clean2, monostoecha, grammia2];
    const out = sortForInvestigation(input);

    assert.equal(out.length, 6);
    // First two are the highest-frequency investigation binomial (grammia, 2 rows),
    // preserving their original relative order.
    assert.deepEqual(out.slice(0, 2).map(r => r._id), ['g1', 'g2']);
    // Next come the two single-count investigation rows. The two singletons
    // both have count 1, so ties break by original index — smerinthus (idx 2)
    // before monostoecha (idx 4).
    assert.equal(out[2]._id, 's1');
    assert.equal(out[3]._id, 'p1');
    // Clean-match rows trail in original order.
    assert.deepEqual(out.slice(4, 6).map(r => r._id), ['c1', 'c2']);
  });

  it('does not mutate the input array', () => {
    const rows = [
      { binomial_raw: 'foo', match_bucket: 'genus-only', _id: 'a' },
      { binomial_raw: 'bar', match_bucket: 'clean-match', _id: 'b' },
    ];
    const lengthBefore = rows.length;
    const snapshot = rows.map(r => r._id);
    sortForInvestigation(rows);
    assert.equal(rows.length, lengthBefore);
    assert.deepEqual(rows.map(r => r._id), snapshot);
  });

  it('treats likely-synonym, provisional, and unparseable as investigation buckets', () => {
    const rows = [
      { binomial_raw: 'a', match_bucket: 'clean-match', _id: 'clean' },
      { binomial_raw: 'b', match_bucket: 'likely-synonym', _id: 'ls' },
      { binomial_raw: 'c', match_bucket: 'provisional', _id: 'pv' },
      { binomial_raw: '',  match_bucket: 'unparseable', _id: 'up' },
    ];
    const out = sortForInvestigation(rows);
    // All three investigation buckets rise to the top.
    assert.deepEqual(out.slice(0, 3).map(r => r.match_bucket).sort(), ['likely-synonym', 'provisional', 'unparseable']);
    assert.equal(out[3]._id, 'clean');
  });

  it('groups empty-string binomial_raw values (unparseables) as their own bucket', () => {
    // Two unparseables share binomial_raw === '', so they form a group of 2
    // and should sit above the single-count genus-only row even though
    // the genus-only row appears first in the input.
    const rows = [
      { binomial_raw: 'zeta', match_bucket: 'genus-only', _id: 'z' },
      { binomial_raw: '',     match_bucket: 'unparseable', _id: 'u1' },
      { binomial_raw: '',     match_bucket: 'unparseable', _id: 'u2' },
    ];
    const out = sortForInvestigation(rows);
    // Most frequent investigation group (empty-string × 2) comes first.
    assert.deepEqual(out.slice(0, 2).map(r => r._id), ['u1', 'u2']);
    assert.equal(out[2]._id, 'z');
  });
});

// ---------------------------------------------------------------------------
// advanceStatus — in-place status transition helper (Phase 29 TILE-03)
// ---------------------------------------------------------------------------
describe('advanceStatus', () => {
  // Helper to build a fully-populated row using every COLUMN.
  function makeRow(overrides = {}) {
    return {
      content_hash:      'aaa1111111111111111111111111111111111111111111111111111111111111',
      dropbox_path:      '/Abagrotis apposita-A-D.tif',
      size_bytes:        '40000000',
      server_modified:   '2026-05-21T10:00:00Z',
      filename_raw:      'Abagrotis apposita-A-D.tif',
      binomial_raw:      'abagrotis apposita',
      specimen_id:       'A',
      view:              'D',
      binomial_resolved: 'abagrotis apposita',
      species_slug:      'abagrotis-apposita',
      match_bucket:      'clean-match',
      status:            'discovered',
      last_error:        '',
      ...overrides,
    };
  }

  it("setting 'downloaded' clears last_error and preserves all other columns", () => {
    const row = makeRow({ status: 'discovered', last_error: 'previous failure' });
    // Snapshot every column value before the call.
    const before = { ...row };

    const result = advanceStatus(row, 'downloaded');

    // Returns the same reference.
    assert.equal(result, row);
    // Status advanced.
    assert.equal(row.status, 'downloaded');
    // last_error cleared.
    assert.equal(row.last_error, '');
    // Every other column is byte-identical to its prior value.
    for (const col of COLUMNS) {
      if (col === 'status' || col === 'last_error') continue;
      assert.equal(
        row[col],
        before[col],
        `column '${col}' must be preserved; was '${before[col]}', now '${row[col]}'`,
      );
    }
    // Verify the per-column loop actually checked the key columns.
    assert.equal(row.content_hash, before.content_hash);
    assert.equal(row.dropbox_path, before.dropbox_path);
    assert.equal(row.binomial_raw, before.binomial_raw);
    assert.equal(row.species_slug, before.species_slug);
    assert.equal(row.match_bucket, before.match_bucket);
  });

  it("setting 'failed' records last_error from extra.last_error and preserves other columns", () => {
    const row = makeRow({ status: 'downloaded', last_error: '' });
    const before = { ...row };

    advanceStatus(row, 'failed', { last_error: 'vips: cannot open input' });

    assert.equal(row.status, 'failed');
    assert.equal(row.last_error, 'vips: cannot open input');
    // Every other column preserved.
    for (const col of COLUMNS) {
      if (col === 'status' || col === 'last_error') continue;
      assert.equal(
        row[col],
        before[col],
        `column '${col}' must be preserved; was '${before[col]}', now '${row[col]}'`,
      );
    }
    // Named spot-checks.
    assert.equal(row.content_hash, before.content_hash);
    assert.equal(row.dropbox_path, before.dropbox_path);
    assert.equal(row.binomial_raw, before.binomial_raw);
    assert.equal(row.species_slug, before.species_slug);
    assert.equal(row.match_bucket, before.match_bucket);
  });

  it('throws TypeError on empty nextStatus', () => {
    assert.throws(
      () => advanceStatus({}, ''),
      (err) => {
        assert.ok(err instanceof TypeError, `expected TypeError, got ${err.constructor.name}`);
        assert.ok(
          err.message.includes('nextStatus must be a non-empty string'),
          `unexpected message: ${err.message}`,
        );
        return true;
      },
    );
  });
});

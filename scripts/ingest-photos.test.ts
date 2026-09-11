import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { classify, loadSynonyms, applyDeterminationsToManifest } from './ingest-photos.ts';
import type { ManifestRow } from './lib/manifest.ts';
import type { PhotoDetermination } from './lib/photo-determinations.ts';

function manifestRow(overrides: Partial<ManifestRow> = {}): ManifestRow {
  return {
    content_hash: 'abc', dropbox_path: '/Amphipoea senilis-A-D.tif', size_bytes: '1', server_modified: '',
    filename_raw: 'Amphipoea senilis-A-D.tif', binomial_raw: 'amphipoea senilis', specimen_id: 'A', view: 'D',
    binomial_resolved: '', species_slug: '', match_bucket: 'genus-only', status: 'discovered', last_error: '',
    ...overrides,
  };
}

const ruling = (photo_stem: string, species_slug: string, specimen: string): PhotoDetermination =>
  ({ photo_stem, species_slug, specimen, source: '#330', note: '' });

// ---------------------------------------------------------------------------
// applyDeterminationsToManifest (ADR 0045, #342)
// ---------------------------------------------------------------------------
describe('applyDeterminationsToManifest', () => {
  const species = {
    byBinomial: new Map([['amphipoea keiferi', { genus: 'Amphipoea', species: 'keiferi' }]]),
    bySlug: new Map([
      ['amphipoea-keiferi', { genus: 'Amphipoea', species: 'keiferi' }],
      ['nycteola-cinereana', { genus: 'Nycteola', species: 'cinereana' }],
    ]),
    genera: new Set(['amphipoea', 'nycteola']),
  };

  it('files a genus-only row under the determined species and letter, and makes it tileable', () => {
    const rows = [manifestRow()];
    const n = applyDeterminationsToManifest(rows, new Map([['Amphipoea senilis-A-D', ruling('Amphipoea senilis-A-D', 'amphipoea-keiferi', 'A')]]), species);
    assert.equal(n, 1);
    assert.equal(rows[0]?.match_bucket, 'resolved-via-determination');
    assert.equal(rows[0]?.species_slug, 'amphipoea-keiferi');
    assert.equal(rows[0]?.binomial_resolved, 'amphipoea keiferi');
  });

  // The letter is part of the ruling (C-026): frigidana specimen A becomes cinereana C.
  it('overrides a confident clean-match and the specimen letter alike', () => {
    const rows = [manifestRow({ filename_raw: 'Nycteola frigidana-A-V.tif', binomial_raw: 'nycteola frigidana', view: 'V',
      match_bucket: 'clean-match', species_slug: 'nycteola-frigidana', binomial_resolved: 'nycteola frigidana' })];
    applyDeterminationsToManifest(rows, new Map([['Nycteola frigidana-A-V', ruling('Nycteola frigidana-A-V', 'nycteola-cinereana', 'C')]]), species);
    assert.equal(rows[0]?.species_slug, 'nycteola-cinereana');
    assert.equal(rows[0]?.specimen_id, 'C');
    assert.equal(rows[0]?.view, 'V', 'the view is not part of the ruling');
  });

  it('is idempotent and counts only rows it changed', () => {
    const rows = [manifestRow()];
    const d = new Map([['Amphipoea senilis-A-D', ruling('Amphipoea senilis-A-D', 'amphipoea-keiferi', 'A')]]);
    assert.equal(applyDeterminationsToManifest(rows, d, species), 1);
    assert.equal(applyDeterminationsToManifest(rows, d, species), 0);
  });

  it('leaves rows with no ruling alone', () => {
    const rows = [manifestRow({ filename_raw: 'Other moth-A-D.tif' })];
    assert.equal(applyDeterminationsToManifest(rows, new Map([['Amphipoea senilis-A-D', ruling('Amphipoea senilis-A-D', 'amphipoea-keiferi', 'A')]]), species), 0);
    assert.equal(rows[0]?.match_bucket, 'genus-only');
  });

  it('never writes a blank letter over a row', () => {
    const rows = [manifestRow()];
    assert.equal(applyDeterminationsToManifest(rows, new Map([['Amphipoea senilis-A-D', ruling('Amphipoea senilis-A-D', 'amphipoea-keiferi', '')]]), species), 0);
    assert.equal(rows[0]?.specimen_id, 'A');
    assert.equal(rows[0]?.match_bucket, 'genus-only');
  });

  it('refuses to point a row at a species that does not exist', () => {
    const rows = [manifestRow()];
    assert.equal(applyDeterminationsToManifest(rows, new Map([['Amphipoea senilis-A-D', ruling('Amphipoea senilis-A-D', 'no-such-species', 'A')]]), species), 0);
    assert.equal(rows[0]?.species_slug, '');
  });
});

// ---------------------------------------------------------------------------
// classify (with synonyms pre-pass) — D-04, D-06
//
// Builds a small in-memory species fixture and a synonyms Map, then tests
// that the pre-pass runs BEFORE the provisional short-circuit (D-06 widening).
// ---------------------------------------------------------------------------
describe('classify (with synonyms pre-pass)', () => {
  // Minimal species fixture for these tests.
  const species = {
    byBinomial: new Map([
      ['apantesis nevadensis', { genus: 'Apantesis', species: 'nevadensis' }],
      ['abagrotis apposita',   { genus: 'Abagrotis',  species: 'apposita'  }],
    ]),
    bySlug: new Map([
      ['apantesis-nevadensis', { genus: 'Apantesis', species: 'nevadensis' }],
      ['abagrotis-apposita',   { genus: 'Abagrotis',  species: 'apposita'  }],
    ]),
    genera: new Set(['apantesis', 'abagrotis', 'grammia', 'monostoecha']),
  };

  // Synonyms Map with two curator decisions.
  const synonyms = new Map([
    ['grammia nevadensis', { binomial_resolved: 'apantesis nevadensis', species_slug: 'apantesis-nevadensis' }],
    ['monostoecha n sp',   { binomial_resolved: 'abagrotis apposita',   species_slug: 'abagrotis-apposita'   }],
  ]);

  it('promotes a genus-only binomial to resolved-via-synonym when synonyms.csv has a matching row', () => {
    const r = classify(
      { binomialFromParser: 'grammia nevadensis', bucketHintFromParser: null },
      species,
      synonyms,
    );
    assert.equal(r.match_bucket, 'resolved-via-synonym');
    assert.equal(r.binomial_resolved, 'apantesis nevadensis');
    assert.equal(r.species_slug, 'apantesis-nevadensis');
  });

  it('promotes a provisional-marked binomial through synonyms.csv (D-06 widening)', () => {
    // binomialFromParser is 'monostoecha n sp' even though the parser set
    // bucketHint = 'provisional'. The pre-pass runs BEFORE the provisional
    // short-circuit, so the curator decision wins.
    const r = classify(
      { binomialFromParser: 'monostoecha n sp', bucketHintFromParser: 'provisional' },
      species,
      synonyms,
    );
    assert.equal(r.match_bucket, 'resolved-via-synonym');
    assert.equal(r.binomial_resolved, 'abagrotis apposita');
  });

  it('falls through to clean-match when synonyms.csv does not contain the binomial', () => {
    const r = classify(
      { binomialFromParser: 'abagrotis apposita', bucketHintFromParser: null },
      species,
      synonyms,
    );
    assert.equal(r.match_bucket, 'clean-match');
  });

  it('falls through to provisional when no synonym matches and the parser flagged provisional', () => {
    const r = classify(
      { binomialFromParser: null, bucketHintFromParser: 'provisional' },
      species,
      synonyms,
    );
    assert.equal(r.match_bucket, 'provisional');
  });

  it('falls through to unparseable when no synonym matches and the binomial is null', () => {
    const r = classify(
      { binomialFromParser: null, bucketHintFromParser: null },
      species,
      synonyms,
    );
    assert.equal(r.match_bucket, 'unparseable');
  });
});

// ---------------------------------------------------------------------------
// loadSynonyms — D-04, D-09
//
// Tests first-run safety, header-only seed, single valid row, and orphan drop.
// Uses tmpdir + mkdtempSync + try/finally rmSync (manifest.test.js pattern).
// ---------------------------------------------------------------------------
describe('loadSynonyms', () => {
  // Minimal species fixture — only bySlug needs a real entry for the positive case.
  const species = {
    byBinomial: new Map(),
    bySlug: new Map([
      ['apantesis-nevadensis', { genus: 'Apantesis', species: 'nevadensis' }],
    ]),
    genera: new Set<string>(),
  };

  it('returns an empty Map when the file does not exist (first-run safe)', async () => {
    const missingPath = join(tmpdir(), `synonyms-missing-${Date.now()}.csv`);
    const result = await loadSynonyms(missingPath, species);
    assert.equal(result.size, 0);
  });

  it('returns an empty Map when the file has only the header (D-08 seed shape)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'syn-header-'));
    const path = join(dir, 's.csv');
    try {
      writeFileSync(path, 'from_binomial,to_species_slug\n');
      const result = await loadSynonyms(path, species);
      assert.equal(result.size, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('builds a one-row map for a single valid synonym', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'syn-one-'));
    const path = join(dir, 's.csv');
    try {
      writeFileSync(path, 'from_binomial,to_species_slug\ngrammia nevadensis,apantesis-nevadensis\n');
      const result = await loadSynonyms(path, species);
      assert.equal(result.size, 1);
      const entry = result.get('grammia nevadensis');
      assert.ok(entry !== undefined);
      assert.equal(entry.binomial_resolved, 'apantesis nevadensis');
      assert.equal(entry.species_slug, 'apantesis-nevadensis');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('drops a row whose to_species_slug is not in species.bySlug (orphan target → synonym-warn → drop)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'syn-orphan-'));
    const path = join(dir, 's.csv');
    try {
      writeFileSync(path, 'from_binomial,to_species_slug\nfoo bar,nonexistent-slug\n');
      const result = await loadSynonyms(path, species);
      assert.equal(result.size, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('strips a UTF-8 BOM so rows still parse when a curator saves via Notepad/Excel', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'syn-bom-'));
    const path = join(dir, 's.csv');
    try {
      // ﻿ is the UTF-8 BOM that Windows Notepad and Excel prepend on save.
      writeFileSync(path, '﻿from_binomial,to_species_slug\ngrammia nevadensis,apantesis-nevadensis\n');
      const result = await loadSynonyms(path, species);
      assert.equal(result.size, 1);
      const entry = result.get('grammia nevadensis');
      assert.ok(entry !== undefined);
      assert.equal(entry.species_slug, 'apantesis-nevadensis');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

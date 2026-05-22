import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { classify, loadSynonyms } from './ingest-photos.js';

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
    genera: new Set(),
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
      assert.equal(result.get('grammia nevadensis').species_slug, 'apantesis-nevadensis');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

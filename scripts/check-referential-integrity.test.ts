import { after, describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  RELATIONS,
  findViolations,
  loadExceptions,
  loadSpeciesSlugs,
  readReferences,
  type Exception,
  type Reference,
  type Relation,
  type SpeciesKeys,
} from './check-referential-integrity.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Species set shaped like the real loader's output: exact site keys plus normalized. */
const SPECIES: SpeciesKeys = {
  site: new Set(['aaa-one', 'bbb-two', 'ccc-three', 'ddd-sp-no-1']),
  normalized: new Set(['aaa-one', 'bbb-two', 'ccc-three', 'ddd-sp-no-1']),
};

function relation(over: Partial<Relation> = {}): Relation {
  return {
    name: 'fixture',
    path: 'data/fixture.csv',
    kind: 'csv-column',
    column: 'species_slug',
    cardinality: 'repeated',
    note: 'fixture',
    ...over,
  };
}

function refs(...raws: string[]): Reference[] {
  return raws.map((raw) => ({ raw }));
}

function run(
  references: Reference[] | null,
  exceptions: Exception[] = [],
  over: Partial<Relation> = {},
): ReturnType<typeof findViolations> {
  const rel = relation(over);
  return findViolations(SPECIES, new Map([[rel.name, references]]), exceptions, [rel]);
}

// ---------------------------------------------------------------------------
// Orphans and near-misses
// ---------------------------------------------------------------------------

describe('findViolations: orphans and near-misses', () => {
  it('passes when every reference resolves exactly', () => {
    const report = run(refs('aaa-one', 'bbb-two'));
    assert.deepEqual(report.violations, []);
    assert.equal(report.checkedReferences, 2);
  });

  it('reports a reference with no species row', () => {
    const report = run(refs('aaa-one', 'zzz-nine'));
    assert.equal(report.violations.length, 1);
    assert.equal(report.violations[0]?.slug, 'zzz-nine');
    assert.equal(report.violations[0]?.kind, 'orphan');
  });

  it('reports a slug that resolves ONLY after normalization as a near-miss, not a pass', () => {
    // The consumers join on the raw cell — src/_data/images.ts keys its map with
    // `row['species_slug']`, speciesLinks.ts slices the line, and species.njk compares
    // `s.slug == slug`. So "ddd-sp No 1" joins to nothing even though the species
    // exists as "ddd-sp-no-1". Normalizing both sides would bless the silent empty
    // join this gate exists to catch.
    const report = run(refs('ddd-sp No 1'));
    assert.equal(report.violations.length, 1);
    assert.equal(report.violations[0]?.kind, 'near-miss');
    assert.equal(report.violations[0]?.normalized, 'ddd-sp-no-1');
  });

  it('treats a case-variant reference as a near-miss too', () => {
    const report = run(refs('AAA-One'));
    assert.equal(report.violations[0]?.kind, 'near-miss', 'exact equality means case matters to consumers');
  });

  it('distinguishes a near-miss from an orphan, since the fixes differ', () => {
    const report = run(refs('ddd-sp No 1', 'zzz-nine'));
    const kinds = report.violations.map((v) => v.kind).sort();
    assert.deepEqual(kinds, ['near-miss', 'orphan']);
  });
});

// ---------------------------------------------------------------------------
// Vacuity: the gate's own worst failure
// ---------------------------------------------------------------------------

describe('findViolations: a relation that checks nothing', () => {
  it('reports a declared source that yields zero references', () => {
    // Renamed column, truncated file, or a BOM. Without this the gate reports PASS
    // having verified nothing — see the BOM case in the CLI tests below.
    const report = run([]);
    assert.equal(report.violations.length, 1);
    assert.equal(report.violations[0]?.kind, 'empty');
    assert.deepEqual(report.skipped, [], 'an empty file is a fault, not a skip');
  });

  it('still skips a relation whose file is absent', () => {
    const report = run(null);
    assert.deepEqual(report.violations, []);
    assert.deepEqual(report.skipped, ['fixture']);
  });

  it('skips a relation missing from the references map entirely', () => {
    const report = findViolations(SPECIES, new Map(), [], [relation()]);
    assert.deepEqual(report.skipped, ['fixture']);
  });

  it('refuses to run with two relations sharing a name', () => {
    // Same name means one Map key: the last write wins and the other relation is
    // checked against the wrong file's references, silently.
    assert.throws(
      () =>
        findViolations(SPECIES, new Map([['dup', refs('zzz-nine')]]), [], [
          relation({ name: 'dup', path: 'data/a.csv' }),
          relation({ name: 'dup', path: 'data/b.csv' }),
        ]),
      /duplicate relation name/,
    );
  });
});

// ---------------------------------------------------------------------------
// Cardinality
// ---------------------------------------------------------------------------

describe('findViolations: cardinality', () => {
  it('reports a repeated slug in a unique relation', () => {
    const report = run(refs('aaa-one', 'aaa-one'), [], { cardinality: 'unique' });
    assert.equal(report.violations.length, 1);
    assert.equal(report.violations[0]?.kind, 'duplicate');
    assert.equal(report.violations[0]?.count, 2);
  });

  it('allows a repeated slug in a repeated relation', () => {
    const report = run(refs('aaa-one', 'aaa-one', 'aaa-one'), [], { cardinality: 'repeated' });
    assert.deepEqual(report.violations, [], 'many images per species is normal');
  });

  it('reports a repeated orphan as one orphan, not as an orphan plus a duplicate', () => {
    // A missing species is one fault however many rows name it — see #232, where 83
    // broken images spanned 27 species.
    const report = run(refs('zzz-nine', 'zzz-nine'), [], { cardinality: 'unique' });
    assert.equal(report.violations.length, 1);
    assert.equal(report.violations[0]?.kind, 'orphan');
    assert.equal(report.violations[0]?.count, 2, 'the reference count is still reported');
  });

  it('collapses many references to one missing slug into a single violation', () => {
    const report = run(refs('zzz-nine', 'zzz-nine', 'zzz-nine', 'aaa-one'));
    assert.equal(report.violations.length, 1);
    assert.equal(report.violations[0]?.count, 3);
    assert.equal(report.checkedReferences, 4, 'every reference is still counted as checked');
  });
});

// ---------------------------------------------------------------------------
// The exceptions ratchet
// ---------------------------------------------------------------------------

describe('findViolations: exceptions ratchet', () => {
  const excuse: Exception = { relation: 'fixture', slug: 'zzz-nine', kind: 'orphan', issue: '#1' };

  it('excuses a listed violation instead of failing', () => {
    const report = run(refs('zzz-nine'), [excuse]);
    assert.deepEqual(report.violations, []);
    assert.equal(report.excused.length, 1, 'still reported, just not fatal');
  });

  it('does not excuse a different slug in the same relation', () => {
    const report = run(refs('yyy-eight'), [excuse]);
    assert.equal(report.violations.length, 1, 'an exception is per-slug, not a blanket waiver');
  });

  it('does not excuse the same slug in a different relation', () => {
    const report = run(refs('zzz-nine'), [{ ...excuse, relation: 'other' }]);
    assert.equal(report.violations.length, 1);
  });

  it('does not let an orphan waiver excuse a DUPLICATE of the same slug', () => {
    // The species exists now, so the orphan is fixed — but the row was duplicated in a
    // unique relation. A kind-blind key would excuse the duplicate AND mark the waiver
    // live, so the ratchet would never report it stale and the fixed fault would keep
    // its waiver forever.
    const report = run(refs('aaa-one', 'aaa-one'), [{ ...excuse, slug: 'aaa-one' }], {
      cardinality: 'unique',
    });
    assert.equal(report.violations.length, 1, 'the duplicate must still fail');
    assert.equal(report.violations[0]?.kind, 'duplicate');
    assert.equal(report.staleExceptions.length, 1, 'and the orphan waiver must read as stale');
  });

  it('reports an exception that no longer matches anything', () => {
    const report = run(refs('aaa-one'), [excuse]);
    assert.equal(report.staleExceptions.length, 1, 'a fixed fault must not leave a waiver behind');
    assert.equal(report.staleExceptions[0]?.slug, 'zzz-nine');
  });

  it('reports a duplicated exception line as stale', () => {
    // One exception matches one violation; the copy matches nothing, so a
    // copy-pasted waiver cannot accumulate quietly.
    const report = run(refs('zzz-nine'), [excuse, { ...excuse }]);
    assert.deepEqual(report.violations, []);
    assert.equal(report.excused.length, 1);
    assert.equal(report.staleExceptions.length, 1);
  });
});

// ---------------------------------------------------------------------------
// readReferences — each source shape
// ---------------------------------------------------------------------------

describe('readReferences', () => {
  const tmp = resolve(ROOT, '.tmp-integrity-test');

  function withFixture(files: Record<string, string>, assertion: () => void): void {
    mkdirSync(join(tmp, 'data'), { recursive: true });
    mkdirSync(join(tmp, 'src/content/species'), { recursive: true });
    try {
      for (const [path, body] of Object.entries(files)) {
        writeFileSync(join(tmp, path), body);
      }
      assertion();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  it('reads one slug per row from a csv-column relation, with physical line numbers', () => {
    withFixture({ 'data/fixture.csv': 'species_slug,x\naaa-one,1\nbbb-two,2\n' }, () => {
      assert.deepEqual(readReferences(relation(), tmp), [
        { raw: 'aaa-one', line: 2 },
        { raw: 'bbb-two', line: 3 },
      ]);
    });
  });

  it('reports the true physical line when a blank line precedes a row', () => {
    // `i + 2` would say 3 for the second row. Blank lines and quoted embedded
    // newlines (species.csv has them) both shift it, so the line comes from csv-parse.
    withFixture({ 'data/fixture.csv': 'species_slug\naaa-one\n\nzzz-nine\n' }, () => {
      const got = readReferences(relation(), tmp);
      assert.equal(got?.[1]?.line, 4, 'the fourth physical line, not the third record slot');
    });
  });

  it('reports the true physical line after a quoted embedded newline', () => {
    withFixture({ 'data/fixture.csv': 'species_slug,note\naaa-one,"two\nlines"\nzzz-nine,x\n' }, () => {
      const got = readReferences(relation(), tmp);
      assert.equal(got?.[1]?.line, 4);
    });
  });

  it('strips a UTF-8 BOM so the first column is still readable', () => {
    // Without `bom: true` the header becomes a different string, every row's slug
    // reads as undefined, and the relation silently checks nothing.
    withFixture({ 'data/fixture.csv': '﻿species_slug\nzzz-nine\n' }, () => {
      const got = readReferences(relation(), tmp);
      assert.deepEqual(got?.map((r) => r.raw), ['zzz-nine'], 'a BOM must not empty the relation');
    });
  });

  it('skips blank cells', () => {
    withFixture({ 'data/fixture.csv': 'species_slug,x\naaa-one,1\n,2\n' }, () => {
      assert.equal(readReferences(relation(), tmp)?.length, 1);
    });
  });

  it('splits a pipe-list cell into one reference per slug', () => {
    withFixture({ 'data/fixture.csv': 'similar_species\naaa-one|bbb-two|ccc-three\n' }, () => {
      const got = readReferences(relation({ kind: 'csv-pipe-list', column: 'similar_species' }), tmp);
      assert.deepEqual(got?.map((r) => r.raw), ['aaa-one', 'bbb-two', 'ccc-three']);
      assert.deepEqual(got?.map((r) => r.line), [2, 2, 2], 'all three share the row they came from');
    });
  });

  it('reads object keys from a json-keys relation', () => {
    withFixture({ 'data/fixture.json': '{"aaa-one":{"x":1},"bbb-two":{"x":2}}' }, () => {
      const got = readReferences(relation({ kind: 'json-keys', path: 'data/fixture.json' }), tmp);
      assert.deepEqual(got?.map((r) => r.raw), ['aaa-one', 'bbb-two']);
    });
  });

  it('reads a json-array relation (speciesSlugs.json)', () => {
    withFixture({ 'data/fixture.json': '["aaa-one","bbb-two"]' }, () => {
      const got = readReferences(relation({ kind: 'json-array', path: 'data/fixture.json' }), tmp);
      assert.deepEqual(got?.map((r) => r.raw), ['aaa-one', 'bbb-two']);
    });
  });

  it('rejects a json-array holding non-strings', () => {
    withFixture({ 'data/fixture.json': '["aaa-one",{"slug":"bbb-two"}]' }, () => {
      assert.throws(
        () => readReferences(relation({ kind: 'json-array', path: 'data/fixture.json' }), tmp),
        /not a JSON array of strings/,
      );
    });
  });

  it('reads a json-array-field relation (key-matrix.json species[].slug)', () => {
    withFixture(
      { 'data/fixture.json': '{"meta":{},"species":[{"slug":"aaa-one"},{"slug":"zzz-nine"}]}' },
      () => {
        const got = readReferences(
          relation({ kind: 'json-array-field', path: 'data/fixture.json', arrayKey: 'species', column: 'slug' }),
          tmp,
        );
        assert.deepEqual(got?.map((r) => r.raw), ['aaa-one', 'zzz-nine']);
      },
    );
  });

  it('rejects a json-array-field whose array key is missing', () => {
    withFixture({ 'data/fixture.json': '{"meta":{}}' }, () => {
      assert.throws(
        () =>
          readReferences(
            relation({ kind: 'json-array-field', path: 'data/fixture.json', arrayKey: 'species', column: 'slug' }),
            tmp,
          ),
        /has no array at "species"/,
      );
    });
  });

  it('rejects a json-array-field entry with no usable slug rather than skipping it', () => {
    // Skipping would shrink the checked set while the gate still passed — the
    // partial-vacuity variant of the `empty` failure mode.
    for (const species of ['[{"slug":"aaa-one"},{}]', '[{"slug":"aaa-one"},{"slug":42}]', '[{"slug":"aaa-one"}," "]']) {
      withFixture({ 'data/fixture.json': `{"meta":{},"species":${species}}` }, () => {
        assert.throws(
          () =>
            readReferences(
              relation({ kind: 'json-array-field', path: 'data/fixture.json', arrayKey: 'species', column: 'slug' }),
              tmp,
            ),
          /species\[1\]/,
        );
      });
    }
  });

  it('reads basenames from an md-basenames relation, ignoring non-Markdown', () => {
    withFixture(
      {
        'src/content/species/aaa-one.md': '# a',
        'src/content/species/bbb-two.md': '# b',
        'src/content/species/README.txt': 'not a species',
      },
      () => {
        const got = readReferences(relation({ kind: 'md-basenames', path: 'src/content/species' }), tmp);
        assert.deepEqual(got?.map((r) => r.raw).sort(), ['aaa-one', 'bbb-two']);
      },
    );
  });

  it('returns null for an absent source', () => {
    assert.equal(readReferences(relation({ path: 'data/does-not-exist.csv' }), ROOT), null);
  });

  it('returns an empty list — not null — for a header-only CSV', () => {
    // The distinction matters: null is "skipped", empty is the `empty` violation.
    withFixture({ 'data/fixture.csv': 'species_slug,x\n' }, () => {
      assert.deepEqual(readReferences(relation(), tmp), []);
    });
  });

  it('names the file when a CSV is malformed, instead of leaking a parser stack', () => {
    withFixture({ 'data/fixture.csv': 'species_slug,x\naaa-one\n' }, () => {
      assert.throws(() => readReferences(relation(), tmp), /cannot parse data\/fixture\.csv/);
    });
  });

  it('names the file when a JSON source is malformed', () => {
    withFixture({ 'data/fixture.json': '{not json' }, () => {
      assert.throws(
        () => readReferences(relation({ kind: 'json-keys', path: 'data/fixture.json' }), tmp),
        /cannot parse data\/fixture\.json/,
      );
    });
  });

  it('rejects a json-keys source that is an array rather than a slug-keyed object', () => {
    withFixture({ 'data/fixture.json': '["aaa-one"]' }, () => {
      assert.throws(
        () => readReferences(relation({ kind: 'json-keys', path: 'data/fixture.json' }), tmp),
        /not a JSON object/,
      );
    });
  });

  it('throws when a CSV relation declares no column', () => {
    withFixture({ 'data/fixture.csv': 'species_slug\naaa-one\n' }, () => {
      assert.throws(() => readReferences({ ...relation(), column: undefined }, tmp), /no column/);
    });
  });
});

// ---------------------------------------------------------------------------
// loadSpeciesSlugs / loadExceptions
// ---------------------------------------------------------------------------

describe('the species and exception loaders', () => {
  const tmp = resolve(ROOT, '.tmp-integrity-loaders');

  function withData(files: Record<string, string>, assertion: () => void): void {
    mkdirSync(join(tmp, 'data'), { recursive: true });
    try {
      for (const [path, body] of Object.entries(files)) writeFileSync(join(tmp, path), body);
      assertion();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  it('derives the site key the way src/_data/species.ts does, and a normalized twin', () => {
    withData({ 'data/species.csv': 'genus,species\nAseptis,sp No 1\n' }, () => {
      const keys = loadSpeciesSlugs(tmp);
      assert.ok(keys.site.has('aseptis-sp-no-1'), 'each space becomes a hyphen, as in the SQL');
      assert.ok(keys.normalized.has('aseptis-sp-no-1'));
    });
  });

  it('names the file when species.csv is absent instead of throwing ENOENT', () => {
    withData({}, () => {
      assert.throws(() => loadSpeciesSlugs(tmp), /data\/species\.csv not found/);
    });
  });

  it('names the file when species.csv is malformed', () => {
    withData({ 'data/species.csv': 'genus,species\nAaa\n' }, () => {
      assert.throws(() => loadSpeciesSlugs(tmp), /cannot parse data\/species\.csv/);
    });
  });

  it('names the file when the exceptions CSV is malformed', () => {
    // The `issue` column is free prose that a human edits; an unquoted comma is a
    // matter of time, and this is the one file the gate cannot afford to crash on.
    withData(
      { 'data/referential-integrity-exceptions.csv': 'relation,slug,kind,issue\na,b,orphan,too,many\n' },
      () => {
        assert.throws(
          () => loadExceptions(tmp),
          /cannot parse data\/referential-integrity-exceptions\.csv/,
        );
      },
    );
  });

  it('rejects an unknown kind rather than silently never matching', () => {
    withData(
      { 'data/referential-integrity-exceptions.csv': 'relation,slug,kind,issue\nimages.csv,b,typo,#1\n' },
      () => {
        assert.throws(() => loadExceptions(tmp), /unknown kind "typo"/);
      },
    );
  });

  it('rejects an unknown relation rather than reporting the waiver as stale', () => {
    // A typo'd relation matches nothing; without this it would surface as a STALE
    // EXCEPTION, telling the maintainer the violation was fixed when it was not.
    withData(
      { 'data/referential-integrity-exceptions.csv': 'relation,slug,kind,issue\nimage.csv,b,orphan,#1\n' },
      () => {
        assert.throws(() => loadExceptions(tmp), /unknown relation "image\.csv"/);
      },
    );
  });

  it('treats a missing exceptions file as no exceptions', () => {
    withData({}, () => {
      assert.deepEqual(loadExceptions(tmp), []);
    });
  });
});

// ---------------------------------------------------------------------------
// The CLI contract — exit codes
// ---------------------------------------------------------------------------

describe('the CLI', () => {
  const tmp = resolve(ROOT, '.tmp-integrity-cli');
  const SCRIPT = resolve(ROOT, 'scripts/check-referential-integrity.ts');

  // In a hook, not per test: a failed assertion must not strand the tree.
  after(() => rmSync(tmp, { recursive: true, force: true }));

  /** A complete, minimal tree satisfying every declared relation. */
  function writeTree(over: Record<string, string> = {}): void {
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(join(tmp, 'data'), { recursive: true });
    mkdirSync(join(tmp, 'src/_data'), { recursive: true });
    mkdirSync(join(tmp, 'src/content/species'), { recursive: true });
    const files: Record<string, string> = {
      'data/species.csv': 'id,genus,species,common_name,noc_id,authority,family,similar_species,subfamily,epithet_quoted,tribe\n1,Aaa,one,,,,Noctuidae,bbb-two,,,\n2,Bbb,two,,,,Noctuidae,aaa-one,,,\n',
      'data/images.csv': 'species_slug,filename\naaa-one,a.jpg\n',
      'data/species-links.csv': 'species_slug,site,url\naaa-one,mpg,https://example.invalid\n',
      'data/species-plates.csv': 'species_slug,plate_slug\naaa-one,plate-1\n',
      'data/checklist-order.csv': 'species_slug,mpg_p_no,matched_via\naaa-one,1,exact\n',
      'data/unpublished-species.csv': 'slug,reason\nbbb-two,fixture\n',
      'data/species-synonyms.csv': 'from_binomial,to_species_slug\nAaa old,aaa-one\n',
      'data/species-redirects.csv': 'old_slug,new_slug,reason\naaa-gone,aaa-one,fixture\n',
      'data/mpg-crosswalk.csv': 'species_slug,mpg_binomial,source\naaa-one,Aaa one,fixture\n',
      'data/species-photos.json': '{"aaa-one":{"high_res_available":true}}',
      'data/key-matrix.json': '{"meta":{},"species":[{"slug":"aaa-one"}],"characters":[],"matrix":[]}',
      'src/_data/speciesSlugs.json': '["aaa-one","bbb-two"]',
      'src/content/species/aaa-one.md': '## Identification\n',
      ...over,
    };
    for (const [path, body] of Object.entries(files)) writeFileSync(join(tmp, path), body);
  }

  function gate(): { status: number; output: string } {
    try {
      const stdout = execFileSync(process.execPath, [SCRIPT], { cwd: tmp, encoding: 'utf8' });
      return { status: 0, output: stdout };
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      return { status: err.status ?? -1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
    }
  }

  it('exits 0 and reports a count on a clean tree', () => {
    writeTree();
    const { status, output } = gate();
    assert.equal(status, 0, output);
    assert.match(output, /PASS: \d+ references across 13 relations/);
  });

  it('exits 1 on an orphan reference', () => {
    writeTree({ 'data/images.csv': 'species_slug,filename\nzzz-nine,a.jpg\n' });
    const { status, output } = gate();
    assert.equal(status, 1, 'a gate that does not fail is not a gate');
    assert.match(output, /FAILED: 1 violation/);
    assert.match(output, /zzz-nine/);
  });

  it('exits 1 on a stale exception even when nothing else is wrong', () => {
    writeTree({
      'data/referential-integrity-exceptions.csv': 'relation,slug,kind,issue\nimages.csv,gone,orphan,#1\n',
    });
    const { status, output } = gate();
    assert.equal(status, 1);
    assert.match(output, /STALE EXCEPTIONS/);
  });

  it('exits 1 — not 0 — when a BOM would otherwise empty a relation', () => {
    // The end-to-end regression for the worst failure mode: a real orphan plus a BOM
    // on the same file. `bom: true` keeps the orphan visible; the `empty` violation is
    // the backstop if a future parse loses the option.
    writeTree({ 'data/images.csv': '﻿species_slug,filename\nzzz-nine,a.jpg\n' });
    const { status, output } = gate();
    assert.equal(status, 1, 'a BOM must not turn a failing gate into a passing one');
    assert.match(output, /zzz-nine/);
  });

  it('exits 1 when a declared source is truncated to its header', () => {
    writeTree({ 'data/species-links.csv': 'species_slug,site,url\n' });
    const { status, output } = gate();
    assert.equal(status, 1);
    assert.match(output, /yields NO references/);
  });

  it('exits 1 with a named file when species.csv is missing', () => {
    writeTree();
    rmSync(join(tmp, 'data/species.csv'));
    const { status, output } = gate();
    assert.equal(status, 1);
    assert.match(output, /data\/species\.csv not found/);
    assert.doesNotMatch(output, /at Object\.\w+ \(node:/, 'no raw stack trace');
  });

  it('excuses a documented violation and still exits 0', () => {
    writeTree({
      'data/images.csv': 'species_slug,filename\naaa-one,a.jpg\nzzz-nine,b.jpg\n',
      'data/referential-integrity-exceptions.csv':
        'relation,slug,kind,issue\nimages.csv,zzz-nine,orphan,#1 — fixture\n',
    });
    const { status, output } = gate();
    assert.equal(status, 0, output);
    assert.match(output, /1 known exception/);
  });
});

// ---------------------------------------------------------------------------
// Real-artifact gates
// ---------------------------------------------------------------------------

describe('the real tree', () => {
  function realReport(): ReturnType<typeof findViolations> {
    const references = new Map(RELATIONS.map((r) => [r.name, readReferences(r, ROOT)] as const));
    return findViolations(loadSpeciesSlugs(ROOT), references, loadExceptions(ROOT));
  }

  it('passes the gate with the committed exceptions file', () => {
    const report = realReport();
    assert.deepEqual(
      report.violations.map((v) => `${v.relation} ${v.kind} ${v.slug}`),
      [],
      'a new violation must fail the build, so this list stays empty',
    );
    assert.deepEqual(
      report.staleExceptions.map((e) => `${e.relation} ${e.kind} ${e.slug}`),
      [],
      'delete exceptions whose fault has been fixed',
    );
  });

  it('reads a non-zero number of references from every single relation', () => {
    // A global floor is too slack to be useful: dropping any one relation but
    // images.csv still leaves >10,000 references. Per-relation is the real guard,
    // and the `empty` violation enforces the same thing at build time.
    const empty = RELATIONS.filter((r) => (readReferences(r, ROOT) ?? []).length === 0).map((r) => r.name);
    assert.deepEqual(empty, [], 'a relation reading zero references is checking nothing');
  });

  it('gives every exception an issue reference', () => {
    for (const e of loadExceptions(ROOT)) {
      assert.match(e.issue, /#\d+/, `exception "${e.relation} ${e.slug}" must name its issue`);
    }
  });

  it('declares no relation whose source file is absent', () => {
    const missing = RELATIONS.filter((r) => readReferences(r, ROOT) === null).map((r) => r.path);
    assert.deepEqual(missing, [], 'every declared relation must point at a file that exists');
  });

  it('declares no duplicate relation names', () => {
    const names = RELATIONS.map((r) => r.name);
    assert.equal(new Set(names).size, names.length);
  });
});

// ---------------------------------------------------------------------------
// Meta-guard: a new slug-bearing file must be declared
// ---------------------------------------------------------------------------

// The failure mode this gate exists for is not a wrong check — it is a file nobody
// thought to check. images.csv, species-links.csv, species-plates.csv and
// species-photos.json were each added without anyone deciding NOT to validate them.
// So the list of relations is itself checked: any data file with a slug-shaped column
// or a slug-shaped shape must appear in RELATIONS or be named here with a reason.
const UNDECLARED_BY_DESIGN: Record<string, string> = {
  'data/records.csv': 'build-data.ts fails on orphaned records via DuckDB, over the unioned table',
  'data/records-inat.csv': 'same DuckDB check, through createAllRecordsTable',
  'data/records-derived-district.csv':
    'keyed by row_index into records.csv; emit-records-district-audit.ts checks coverage and field divergence',
  'data/coord-fill-report.csv': 'one-shot run report — a historical record, not a live reference',
  'data/legacy-rejoin-report.csv': 'one-shot run report',
  'data/records-bad.csv': 'quarantined rows held deliberately outside the catalogue',
  'data/records-bad-coords.csv': 'quarantined rows held deliberately outside the catalogue',
  'data/species-photos-manifest.csv':
    'pipeline ledger: its species_slug is blank until a row matches, and unmatched rows are the normal state',
  'data/referential-integrity-exceptions.csv':
    'the ratchet itself — its slugs are the known violations, so checking them here would be circular',
  'data/key-coverage-report.json': 'run report listing UNMATCHED binomials — absent slugs are its subject',
  'data/cdn-inventory-report.csv':
    'run report on CDN objects nothing accounts for — slugs absent from species.csv are its subject',
  'data/plates.json': 'its `slug` is a plate slug, not a species slug',
};

// Columns that are slug-shaped but do not reference a species.
const NON_SPECIES_SLUG_COLUMNS = new Set([
  // species-plates.plate_slug points at data/plates.json, not species.csv. Verified
  // clean (98 plates, no orphans); a plates relation would need its own target set.
  'data/species-plates.csv:plate_slug',
  // species-redirects.old_slug must be ABSENT from species.csv — the inverse rule,
  // owned by speciesRedirects.test.ts. Declaring it would assert the opposite.
  'data/species-redirects.csv:old_slug',
]);

const SLUG_COLUMN = /(^|_)slug$/;

test('every data CSV with a slug-shaped column is declared or excused', () => {
  const declared = new Set(RELATIONS.map((r) => `${r.path}:${r.column ?? ''}`));
  const undeclared: string[] = [];

  for (const entry of readdirSync(resolve(ROOT, 'data'), { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.csv')) continue;
    const path = `data/${entry.name}`;
    if (path in UNDECLARED_BY_DESIGN) continue;
    // csv-parse handles CRLF and a BOM; splitting on commas by hand would not.
    const rows = parse(readFileSync(resolve(ROOT, 'data', entry.name)), {
      to_line: 1,
      columns: false,
      bom: true,
    }) as string[][];
    for (const column of rows[0] ?? []) {
      if (!SLUG_COLUMN.test(column)) continue;
      if (declared.has(`${path}:${column}`)) continue;
      if (NON_SPECIES_SLUG_COLUMNS.has(`${path}:${column}`)) continue;
      undeclared.push(`${path} column "${column}"`);
    }
  }

  assert.deepEqual(
    undeclared,
    [],
    'Add these to RELATIONS in check-referential-integrity.ts, or to UNDECLARED_BY_DESIGN with a reason. ' +
      'A slug-bearing file nobody declared is exactly how five stranded photo sets and an orphan account survived.',
  );
});

test('every data JSON file is declared or excused', () => {
  // RELATIONS already declares two JSON sources, so scanning only CSVs would leave
  // the same hole one file type over.
  const declared = new Set(RELATIONS.map((r) => r.path));
  const undeclared = readdirSync(resolve(ROOT, 'data'), { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => `data/${e.name}`)
    .filter((p) => !declared.has(p) && !(p in UNDECLARED_BY_DESIGN));

  assert.deepEqual(
    undeclared,
    [],
    'A new JSON artifact keyed or fielded by species slug must be declared in RELATIONS, ' +
      'or excused in UNDECLARED_BY_DESIGN with a reason.',
  );
});

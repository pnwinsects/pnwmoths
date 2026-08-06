import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
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
} from './check-referential-integrity.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SPECIES = new Set(['aaa-one', 'bbb-two', 'ccc-three']);

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
// findViolations — orphans
// ---------------------------------------------------------------------------

describe('findViolations: orphans', () => {
  it('passes when every reference resolves', () => {
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

  it('normalizes before comparing, so a space-form slug matches the hyphenated species', () => {
    // The site slug for `Aseptis` + `sp No 1` is "aseptis-sp no 1" raw; every
    // relation must resolve it the same way species.csv does (ADR 0010).
    const species = new Set(['aseptis-sp-no-1']);
    const rel = relation();
    const report = findViolations(species, new Map([[rel.name, refs('Aseptis-sp No 1')]]), [], [rel]);
    assert.deepEqual(report.violations, [], 'whitespace-and-case variants must not read as orphans');
  });

  it('keeps the raw form alongside the normalized slug for the failure message', () => {
    const report = run(refs('Zzz-Nine'));
    assert.equal(report.violations[0]?.slug, 'zzz-nine');
    assert.equal(report.violations[0]?.raw, 'Zzz-Nine');
  });
});

// ---------------------------------------------------------------------------
// findViolations — cardinality
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

  it('reports an orphan that also duplicates as one orphan, not two faults', () => {
    // A missing species is one fault however many rows name it — see #232, where 83
    // broken images spanned 27 species.
    const report = run(refs('zzz-nine', 'zzz-nine'), [], { cardinality: 'unique' });
    assert.equal(report.violations.length, 1);
    assert.equal(report.violations[0]?.kind, 'orphan', 'the missing row is the actionable fact');
    assert.equal(report.violations[0]?.count, 2, 'but the reference count is still reported');
  });

  it('collapses many references to one missing slug into a single violation', () => {
    const report = run(refs('zzz-nine', 'zzz-nine', 'zzz-nine', 'aaa-one'));
    assert.equal(report.violations.length, 1);
    assert.equal(report.violations[0]?.count, 3);
    assert.equal(report.checkedReferences, 4, 'every reference is still counted as checked');
  });
});

// ---------------------------------------------------------------------------
// findViolations — the exceptions ratchet
// ---------------------------------------------------------------------------

describe('findViolations: exceptions ratchet', () => {
  const excuse: Exception = { relation: 'fixture', slug: 'zzz-nine', issue: '#1' };

  it('excuses a listed orphan instead of failing', () => {
    const report = run(refs('zzz-nine'), [excuse]);
    assert.deepEqual(report.violations, []);
    assert.equal(report.excused.length, 1, 'still reported, just not fatal');
  });

  it('does not excuse a different orphan in the same relation', () => {
    const report = run(refs('yyy-eight'), [excuse]);
    assert.equal(report.violations.length, 1, 'an exception is per-slug, not a blanket waiver');
  });

  it('does not excuse the same slug in a different relation', () => {
    const report = run(refs('zzz-nine'), [{ ...excuse, relation: 'other' }]);
    assert.equal(report.violations.length, 1);
  });

  it('reports an exception that no longer matches anything', () => {
    const report = run(refs('aaa-one'), [excuse]);
    assert.equal(report.staleExceptions.length, 1, 'a fixed fault must not leave a waiver behind');
    assert.equal(report.staleExceptions[0]?.slug, 'zzz-nine');
  });

  it('treats a stale exception as a failure condition alongside violations', () => {
    // Both lists feed the same exit code; this asserts they are reported apart so
    // the message can say which happened.
    const report = run(refs('yyy-eight'), [excuse]);
    assert.equal(report.violations.length, 1);
    assert.equal(report.staleExceptions.length, 1);
  });
});

// ---------------------------------------------------------------------------
// findViolations — absent sources
// ---------------------------------------------------------------------------

describe('findViolations: absent sources', () => {
  it('skips a relation whose file is absent rather than failing', () => {
    // data/records-inat.csv does not exist until the first sync; a gate that fails
    // on an optional file fails for the wrong reason.
    const report = run(null);
    assert.deepEqual(report.violations, []);
    assert.deepEqual(report.skipped, ['fixture']);
  });

  it('skips a relation missing from the references map entirely', () => {
    const report = findViolations(SPECIES, new Map(), [], [relation()]);
    assert.deepEqual(report.skipped, ['fixture']);
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

  it('reads one slug per row from a csv-column relation, with line numbers', () => {
    withFixture({ 'data/fixture.csv': 'species_slug,x\naaa-one,1\nbbb-two,2\n' }, () => {
      const got = readReferences(relation(), tmp);
      assert.deepEqual(got, [
        { raw: 'aaa-one', line: 2 },
        { raw: 'bbb-two', line: 3 },
      ], 'line 1 is the header, so the first data row is line 2');
    });
  });

  it('carries every line of a repeated orphan into the violation', () => {
    withFixture({ 'data/fixture.csv': 'species_slug\nzzz-nine\naaa-one\nzzz-nine\n' }, () => {
      const got = readReferences(relation(), tmp);
      assert.ok(got);
      const rel = relation();
      const report = findViolations(SPECIES, new Map([[rel.name, got]]), [], [rel]);
      assert.deepEqual(report.violations[0]?.lines, [2, 4], 'the message must name every offending row');
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

  it('reads basenames from an md-basenames relation, ignoring non-Markdown', () => {
    withFixture(
      {
        'src/content/species/aaa-one.md': '# a',
        'src/content/species/bbb-two.md': '# b',
        'src/content/species/README.txt': 'not a species',
      },
      () => {
        const got = readReferences(
          relation({ kind: 'md-basenames', path: 'src/content/species' }),
          tmp,
        );
        assert.deepEqual(got?.map((r) => r.raw).sort(), ['aaa-one', 'bbb-two']);
      },
    );
  });

  it('returns null for an absent source', () => {
    assert.equal(readReferences(relation({ path: 'data/does-not-exist.csv' }), ROOT), null);
  });

  it('names the file when a CSV is malformed, instead of leaking a parser stack', () => {
    // This gate runs first, so it meets a broken file before build-data.ts does.
    withFixture({ 'data/fixture.csv': 'species_slug,x\naaa-one\n' }, () => {
      assert.throws(
        () => readReferences(relation(), tmp),
        /cannot parse data\/fixture\.csv/,
        'the message must say which file, not just what csv-parse thought',
      );
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

  it('rejects a JSON source that is an array rather than a slug-keyed object', () => {
    withFixture({ 'data/fixture.json': '["aaa-one"]' }, () => {
      assert.throws(
        () => readReferences(relation({ kind: 'json-keys', path: 'data/fixture.json' }), tmp),
        /not a JSON object/,
      );
    });
  });

  it('throws when a CSV relation declares no column', () => {
    withFixture({ 'data/fixture.csv': 'species_slug\naaa-one\n' }, () => {
      assert.throws(
        () => readReferences({ ...relation(), column: undefined }, tmp),
        /no column/,
        'a misdeclared relation must be loud, not silently empty',
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Real-artifact gates
// ---------------------------------------------------------------------------

describe('the real tree', () => {
  it('passes the gate with the committed exceptions file', () => {
    const speciesSlugs = loadSpeciesSlugs(ROOT);
    const references = new Map(
      RELATIONS.map((r) => [r.name, readReferences(r, ROOT)] as const),
    );
    const report = findViolations(speciesSlugs, references, loadExceptions(ROOT));
    assert.deepEqual(
      report.violations.map((v) => `${v.relation} ${v.kind} ${v.slug}`),
      [],
      'a new orphan slug must fail the build, so this list stays empty',
    );
    assert.deepEqual(
      report.staleExceptions.map((e) => `${e.relation} ${e.slug}`),
      [],
      'delete exceptions whose fault has been fixed',
    );
  });

  it('reads a meaningful number of references', () => {
    // Guards against a refactor that silently stops reading a source: the gate
    // would still pass, having checked nothing.
    const total = RELATIONS.reduce((n, r) => n + (readReferences(r, ROOT)?.length ?? 0), 0);
    assert.ok(total > 10_000, `expected >10,000 references across the tree, read ${total}`);
  });

  it('gives every exception an issue reference', () => {
    for (const e of loadExceptions(ROOT)) {
      assert.match(
        e.issue,
        /#\d+/,
        `exception "${e.relation} ${e.slug}" must name the issue that will resolve it`,
      );
    }
  });

  it('declares no relation whose source file is absent', () => {
    // A typo'd path would make the relation skip forever, passing while checking nothing.
    const missing = RELATIONS.filter((r) => readReferences(r, ROOT) === null).map((r) => r.path);
    assert.deepEqual(missing, [], 'every declared relation must point at a file that exists');
  });
});

// ---------------------------------------------------------------------------
// Meta-guard: a new slug-bearing data file must be declared
// ---------------------------------------------------------------------------

// The failure mode this gate exists for is not a wrong check — it is a file nobody
// thought to check. images.csv, species-links.csv, species-plates.csv and
// species-photos.json were each added without anyone deciding NOT to validate them.
// So the list of relations is itself checked: any data/*.csv with a slug-shaped
// column must appear in RELATIONS or be named here with a reason.
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
    'the ratchet itself — its slugs are the known orphans, so checking them here would be circular',
};

// data/species-redirects.csv is declared for `new_slug` but NOT for `old_slug`: a
// retired slug must be ABSENT from species.csv, the inverse of this gate's rule.
// speciesRedirects.test.ts owns that direction ("no old_slug is also a live
// species.csv slug"), so listing it here would assert the opposite of the truth.
const INVERSE_COLUMNS = new Set(['data/species-redirects.csv:old_slug']);

const SLUG_COLUMN = /^(species_slug|slug|to_species_slug|new_slug|old_slug)$/;

test('every data CSV with a slug-shaped column is either declared or excused', () => {
  const dataDir = resolve(ROOT, 'data');
  const declared = new Set(RELATIONS.map((r) => `${r.path}:${r.column ?? ''}`));
  const undeclared: string[] = [];

  for (const entry of readdirSync(dataDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.csv')) continue;
    const path = `data/${entry.name}`;
    if (path in UNDECLARED_BY_DESIGN) continue;
    const header = readFileSync(resolve(dataDir, entry.name), 'utf8').split('\n')[0] ?? '';
    const columns = (parse(header, { columns: false }) as string[][])[0] ?? [];
    for (const column of columns) {
      if (!SLUG_COLUMN.test(column)) continue;
      if (declared.has(`${path}:${column}`)) continue;
      if (INVERSE_COLUMNS.has(`${path}:${column}`)) continue;
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

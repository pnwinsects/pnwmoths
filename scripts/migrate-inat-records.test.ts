import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPlainInatPhotograph,
  migrateCsv,
  planMigration,
  unreproducibleValues,
} from './migrate-inat-records.ts';
import { RECORDS_COLUMNS } from './lib/records-source.ts';
import type { RecordRow } from './lib/records-source.ts';

function row(overrides: Partial<RecordRow> = {}): RecordRow {
  return {
    species_slug: 'lophocampa-roseata',
    record_type: 'photograph',
    latitude: '46.183537',
    longitude: '-123.829004',
    state: 'OR',
    county: 'Clatsop',
    locality: 'Astoria',
    elevation_ft: '',
    year: '2016',
    month: '8',
    day: '2',
    collector: 'M. Patterson',
    collection: '',
    notes: 'https://www.inaturalist.org/observations/3792087',
    district_id: 'US:41007',
    ...overrides,
  };
}

describe('planMigration', () => {
  it('hands over a row whose observation the sync now carries', () => {
    const plan = planMigration([row()], new Set(['3792087']));
    assert.equal(plan.migrated.length, 1);
    assert.equal(plan.kept.length, 0);
    assert.deepEqual(plan.migrated[0]?.inatIds, ['3792087']);
  });

  it('keeps a row whose observation the sync will not take', () => {
    // 144 of the 145 hand-entered observations are in this position today:
    // not in the project, so migrating them would delete them from the site.
    const plan = planMigration([row()], new Set());
    assert.equal(plan.migrated.length, 0);
    assert.equal(plan.kept.length, 1);
  });

  it('never touches a row with no iNaturalist URL at all', () => {
    const plan = planMigration([row({ notes: 'Stehr & Cook, 1968' })], new Set(['3792087']));
    assert.equal(plan.migrated.length, 0);
  });

  it('handles the real fragment and whitespace forms in records.csv', () => {
    const withFragment = row({
      notes: 'https://www.inaturalist.org/observations/3792087#activity_comment_587056',
    });
    const withTrailingSpace = row({
      notes: 'http://www.inaturalist.org/observations/62087089 ',
    });
    const plan = planMigration(
      [withFragment, withTrailingSpace],
      new Set(['3792087', '62087089']),
    );
    assert.equal(plan.migrated.length, 2);
  });

  it('never migrates a row citing more than one observation', () => {
    // Partial coverage would drop the observation the sync is not carrying;
    // full coverage is ambiguous (one occurrence documented twice, or two
    // occurrences in one row?). No such row exists in records.csv today, so
    // refusing costs nothing and guessing could not be checked.
    const multi = row({
      notes:
        'https://www.inaturalist.org/observations/1; https://www.inaturalist.org/observations/2',
    });
    assert.equal(planMigration([multi], new Set(['1'])).migrated.length, 0);
    const both = planMigration([multi], new Set(['1', '2']));
    assert.equal(both.migrated.length, 0);
    assert.equal(both.blocked.length, 1);
    assert.equal(both.kept.length, 1);
  });

  it('holds back a row the sync cannot faithfully reproduce, and reports it', () => {
    const specimen = row({ record_type: 'specimen', collection: 'CNC' });
    const plan = planMigration([specimen], new Set(['3792087']));
    assert.equal(plan.migrated.length, 0);
    assert.equal(plan.blocked.length, 1);
    // Held back means KEPT — never dropped from the file.
    assert.equal(plan.kept.length, 1);
  });

  it('ignores differences between the hand-entered and synced values', () => {
    // The curator writes "M. Patterson"; iNaturalist says "Mike Patterson".
    // Identity is the observation id, never the content.
    const plan = planMigration([row({ collector: 'Someone Else' })], new Set(['3792087']));
    assert.equal(plan.migrated.length, 1);
  });

  it('preserves the order of retained rows', () => {
    const a = row({ notes: '', year: '2001' });
    const b = row({ year: '2002' });
    const c = row({ notes: '', year: '2003' });
    const plan = planMigration([a, b, c], new Set(['3792087']));
    assert.deepEqual(
      plan.kept.map((r) => r.year),
      ['2001', '2003'],
    );
  });
});

describe('isPlainInatPhotograph', () => {
  it('accepts a plain iNaturalist photograph row', () => {
    assert.equal(isPlainInatPhotograph(row({ collection: 'iNaturalist' })), true);
    assert.equal(isPlainInatPhotograph(row({ collection: '' })), true);
  });

  it('accepts one carrying the accuracy annotation the sync writes', () => {
    assert.equal(
      isPlainInatPhotograph(
        row({
          notes:
            'location accuracy: 26.94km; https://www.inaturalist.org/observations/49684455',
        }),
      ),
      true,
    );
  });

  it('rejects a specimen that merely cites an observation', () => {
    // Real rows: a CNC specimen and a D Holden coll specimen both cite an
    // observation as documentation. Migrating one would delete the specimen
    // and let the sync recreate it as an anonymous iNaturalist photograph.
    assert.equal(isPlainInatPhotograph(row({ record_type: 'specimen' })), false);
  });

  it('rejects a row held in another collection', () => {
    assert.equal(isPlainInatPhotograph(row({ collection: 'CNC' })), false);
    assert.equal(isPlainInatPhotograph(row({ collection: 'C_LaBar' })), false);
  });

  it('rejects notes carrying prose beyond the URL', () => {
    assert.equal(
      isPlainInatPhotograph(
        row({
          notes: 'Record documented at: https://www.inaturalist.org/observations/221684965',
        }),
      ),
      false,
    );
  });
});

describe('unreproducibleValues', () => {
  it('flags an elevation the sync cannot reproduce', () => {
    // The one live handover candidate carries elevation_ft = 230. iNaturalist
    // does not supply elevation, so the sync writes that column blank — the
    // handover would erase 230 with a diff that is deletions only, i.e. a loss
    // invisible to anyone reviewing it.
    assert.deepEqual(unreproducibleValues(row({ elevation_ft: '230' })), ['elevation_ft']);
  });

  it('is empty for a row carrying nothing the sync would drop', () => {
    assert.deepEqual(unreproducibleValues(row({ elevation_ft: '' })), []);
    assert.deepEqual(unreproducibleValues(row({ elevation_ft: '  ' })), []);
  });

  it('holds such a row back rather than migrating it', () => {
    const plan = planMigration([row({ elevation_ft: '230' })], new Set(['3792087']));
    assert.equal(plan.migrated.length, 0);
    assert.equal(plan.blocked.length, 1);
    assert.equal(plan.kept.length, 1);
    assert.match(plan.blocked[0]?.blockedReason ?? '', /elevation_ft = 230/);
  });
});

describe('migrateCsv', () => {
  const header = RECORDS_COLUMNS.join(',');
  const keptLine =
    'euxoa-aurantiaca,specimen,42.02,-113.115,ID,Cassia,Black Pine Mts,6312,2012,7,12,L. G. Crabo,LGCC,,US:16031';
  const migratableLine =
    'lophocampa-roseata,photograph,46.183537,-123.829004,OR,Clatsop,Astoria,,2016,8,2,M. Patterson,,' +
    'https://www.inaturalist.org/observations/3792087,US:41007';

  it('removes only the migrated line, byte for byte', () => {
    const raw = `${header}\n${keptLine}\n${migratableLine}\n`;
    const { output, plan } = migrateCsv(raw, new Set(['3792087']));
    assert.equal(plan.migrated.length, 1);
    assert.equal(output, `${header}\n${keptLine}\n`);
  });

  it('is idempotent — a second run finds nothing to do', () => {
    const raw = `${header}\n${keptLine}\n${migratableLine}\n`;
    const { output } = migrateCsv(raw, new Set(['3792087']));
    const second = migrateCsv(output, new Set(['3792087']));
    assert.equal(second.plan.migrated.length, 0);
    assert.equal(second.output, output);
  });

  it('leaves the file untouched when nothing qualifies', () => {
    const raw = `${header}\n${keptLine}\n${migratableLine}\n`;
    const { output, plan } = migrateCsv(raw, new Set());
    assert.equal(plan.migrated.length, 0);
    assert.equal(output, raw);
  });

  it('refuses to rewrite a file whose round-trip is not deletion-only', () => {
    // CRLF input would be silently normalised to LF, turning a reviewable
    // pure-deletion diff into a whole-file rewrite.
    const raw = `${header}\r\n${keptLine}\r\n${migratableLine}\r\n`;
    assert.throws(() => migrateCsv(raw, new Set(['3792087'])), /byte-faithful/);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { migrateCsv, planMigration, readHandoverIds } from './migrate-inat-records.ts';
import { RECORDS_COLUMNS } from './lib/records-source.ts';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    elevation_ft: '230',
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

  it('keeps a multi-observation row unless the sync carries every one', () => {
    // Migrating on a partial match would silently drop the observation the
    // sync is NOT carrying.
    const multi = row({
      notes:
        'https://www.inaturalist.org/observations/1; https://www.inaturalist.org/observations/2',
    });
    assert.equal(planMigration([multi], new Set(['1'])).migrated.length, 0);
    assert.equal(planMigration([multi], new Set(['1', '2'])).migrated.length, 1);
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

describe('readHandoverIds', () => {
  it('returns nothing when the sync has not been run', () => {
    assert.equal(readHandoverIds(join(tmpdir(), 'pnwm-no-such-report.csv')).size, 0);
  });

  it('selects only already-curated rows from the report', () => {
    // The other outcomes are rejections, not handovers; migrating on one would
    // delete a curator row the sync has no intention of replacing.
    const dir = mkdtempSync(join(tmpdir(), 'pnwm-migrate-'));
    const path = join(dir, 'inat-sync-report.csv');
    writeFileSync(
      path,
      'inat_id,url,outcome,detail\n' +
        '1,u,already-curated,d\n' +
        '2,u,unresolved-taxon,d\n' +
        '3,u,already-curated,d\n' +
        '4,u,out-of-bounds,d\n',
    );
    assert.deepEqual([...readHandoverIds(path)].sort(), ['1', '3']);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('migrateCsv', () => {
  const header = RECORDS_COLUMNS.join(',');
  const keptLine =
    'euxoa-aurantiaca,specimen,42.02,-113.115,ID,Cassia,Black Pine Mts,6312,2012,7,12,L. G. Crabo,LGCC,,US:16031';
  const migratableLine =
    'lophocampa-roseata,photograph,46.183537,-123.829004,OR,Clatsop,Astoria,230,2016,8,2,M. Patterson,,' +
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

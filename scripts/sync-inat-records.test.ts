import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'csv-parse/sync';
import { buildRecordsCsv, buildRemovalReasons, buildReportCsv } from './sync-inat-records.ts';
import { RECORDS_INAT_COLUMNS } from './lib/records-source.ts';
import type { InatRecordRow } from './lib/records-source.ts';
import type { Skipped } from './lib/inat.ts';

function row(overrides: Partial<InatRecordRow> = {}): InatRecordRow {
  return {
    species_slug: 'lophocampa-roseata',
    record_type: 'photograph',
    latitude: '46.18',
    longitude: '-123.82',
    state: 'OR',
    county: 'Clatsop',
    locality: 'Astoria',
    elevation_ft: '',
    year: '2016',
    month: '8',
    day: '2',
    collector: 'Mike Patterson',
    collection: 'iNaturalist',
    notes: 'https://www.inaturalist.org/observations/3792087',
    district_id: 'US:41007',
    inat_id: '3792087',
    ...overrides,
  };
}

describe('buildRemovalReasons', () => {
  it('reports an observation the project no longer returns as having left it', () => {
    const reasons = buildRemovalReasons([row()], [], [], new Set());
    assert.equal(reasons.get('3792087'), 'left-project');
  });

  it('distinguishes a downgraded observation from one that left the project', () => {
    // The collaborator asked for three outcomes; without this these two
    // collapse into one "removed" bucket, and they call for different responses.
    const skipped: Skipped[] = [
      { inatId: '3792087', reason: 'not-research-grade', detail: 'needs_id' },
    ];
    const reasons = buildRemovalReasons([row()], [], skipped, new Set(['3792087']));
    assert.equal(reasons.get('3792087'), 'not-research-grade');
  });

  it('reports an overturned identification as an unresolved taxon', () => {
    const skipped: Skipped[] = [
      { inatId: '3792087', reason: 'unresolved-taxon', detail: 'Pseudaletia unipuncta' },
    ];
    const reasons = buildRemovalReasons([row()], [], skipped, new Set(['3792087']));
    assert.equal(reasons.get('3792087'), 'unresolved-taxon');
  });

  it('says nothing about records that are staying', () => {
    const reasons = buildRemovalReasons([row()], [row()], [], new Set(['3792087']));
    assert.equal(reasons.size, 0);
  });
});

describe('buildRecordsCsv', () => {
  it('writes the pinned 16-column header even with no rows', () => {
    const csv = buildRecordsCsv([]);
    assert.equal(csv.trim(), RECORDS_INAT_COLUMNS.join(','));
  });

  it('round-trips a row through the pinned column order', () => {
    const parsed = parse(buildRecordsCsv([row()]), {
      columns: true,
      skip_empty_lines: true,
    }) as InatRecordRow[];
    assert.deepEqual(parsed[0], row());
  });

  it('puts inat_id last, so the leading 15 line up with records.csv', () => {
    const [header] = buildRecordsCsv([row()]).split('\n');
    assert.ok(header?.endsWith(',inat_id'));
  });
});

describe('buildReportCsv', () => {
  it('writes a header-only file when nothing was skipped', () => {
    assert.equal(buildReportCsv([]).trim(), 'inat_id,url,outcome,detail');
  });

  it('records the reason and a link back to the observation', () => {
    const csv = buildReportCsv([
      { inatId: '42', reason: 'unresolved-taxon', detail: 'Pseudaletia unipuncta' },
    ]);
    const rows = parse(csv, { columns: true, skip_empty_lines: true }) as Array<
      Record<string, string>
    >;
    assert.equal(rows[0]?.inat_id, '42');
    assert.equal(rows[0]?.outcome, 'unresolved-taxon');
    assert.equal(rows[0]?.detail, 'Pseudaletia unipuncta');
    assert.equal(rows[0]?.url, 'https://www.inaturalist.org/observations/42');
  });

  it('is ordered deterministically so the committed file does not churn', () => {
    const skipped: Skipped[] = [
      { inatId: '20', reason: 'unresolved-taxon', detail: 'b' },
      { inatId: '3', reason: 'out-of-bounds', detail: 'a' },
      { inatId: '10', reason: 'unresolved-taxon', detail: 'c' },
    ];
    const first = buildReportCsv(skipped);
    const shuffled = buildReportCsv([skipped[2]!, skipped[0]!, skipped[1]!]);
    assert.equal(first, shuffled);
    const rows = parse(first, { columns: true, skip_empty_lines: true }) as Array<
      Record<string, string>
    >;
    assert.deepEqual(
      rows.map((r) => r.inat_id),
      ['3', '10', '20'],
    );
  });
});

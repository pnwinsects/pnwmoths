import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTsv, toCsv } from './extract-reference-links.ts';
import type { SpeciesLink } from './extract-reference-links.ts';

// ---------------------------------------------------------------------------
// parseTsv — converts mysql `--batch -N` (tab-separated, no header) output.
// ---------------------------------------------------------------------------

describe('parseTsv', () => {
  it('parses tab-separated rows into SpeciesLink objects', () => {
    const out = parseTsv(
      'abagrotis-apposita\tbugguide\thttps://bugguide.net/node/view/143613\n' +
        'abagrotis-apposita\tmpg\thttps://mothphotographersgroup.msstate.edu/species.php?hodges=11037\n',
    );
    assert.deepEqual(out, [
      { species_slug: 'abagrotis-apposita', site: 'bugguide', url: 'https://bugguide.net/node/view/143613' },
      { species_slug: 'abagrotis-apposita', site: 'mpg', url: 'https://mothphotographersgroup.msstate.edu/species.php?hodges=11037' },
    ]);
  });

  it('accepts the bamona site value', () => {
    const out = parseTsv('abagrotis-apposita\tbamona\thttps://www.butterfliesandmoths.org/species/Abagrotis-apposita\n');
    assert.deepEqual(out, [
      { species_slug: 'abagrotis-apposita', site: 'bamona', url: 'https://www.butterfliesandmoths.org/species/Abagrotis-apposita' },
    ]);
  });

  it('ignores blank trailing lines', () => {
    const out = parseTsv('a-b\tbugguide\thttps://bugguide.net/node/view/1\n\n');
    assert.equal(out.length, 1);
  });

  it('returns [] for empty input', () => {
    assert.deepEqual(parseTsv(''), []);
  });

  it('throws on a row missing fields', () => {
    assert.throws(() => parseTsv('a-b\tbugguide\n'), /malformed row/);
  });

  it('throws on an unexpected site value', () => {
    assert.throws(
      () => parseTsv('a-b\twikipedia\thttps://example.com\n'),
      /unexpected site/,
    );
  });
});

// ---------------------------------------------------------------------------
// toCsv — serializes to species_slug,site,url with RFC-4180 quoting.
// ---------------------------------------------------------------------------

describe('toCsv', () => {
  const rows: SpeciesLink[] = [
    { species_slug: 'abagrotis-apposita', site: 'bugguide', url: 'https://bugguide.net/node/view/143613' },
    { species_slug: 'abagrotis-apposita', site: 'mpg', url: 'https://mothphotographersgroup.msstate.edu/species.php?hodges=11037' },
  ];

  it('emits a header row', () => {
    assert.equal(toCsv(rows).split('\n')[0], 'species_slug,site,url');
  });

  it('emits one line per link plus a trailing newline', () => {
    assert.equal(toCsv(rows), 'species_slug,site,url\n' +
      'abagrotis-apposita,bugguide,https://bugguide.net/node/view/143613\n' +
      'abagrotis-apposita,mpg,https://mothphotographersgroup.msstate.edu/species.php?hodges=11037\n');
  });

  it('quotes a url containing a comma', () => {
    const out = toCsv([{ species_slug: 'a-b', site: 'bugguide', url: 'https://x/?a=1,2' }]);
    assert.match(out, /a-b,bugguide,"https:\/\/x\/\?a=1,2"\n$/);
  });

  it('round-trips through parseTsv via tab reserialization', () => {
    // toCsv output, converted back to TSV, should parse to the same rows.
    const tsv = rows.map(r => `${r.species_slug}\t${r.site}\t${r.url}`).join('\n') + '\n';
    assert.deepEqual(parseTsv(tsv), rows);
  });
});

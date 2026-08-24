import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readPhotoDeterminations, toPhotoStem } from './photo-determinations.ts';

function writeCsv(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'photo-det-'));
  const path = join(dir, 'photo-determinations.csv');
  writeFileSync(path, body);
  return path;
}

const HEADER = 'photo_stem,species_slug,specimen,source,note\n';

describe('toPhotoStem', () => {
  it('drops the extension so one key names the JPEG and the TIFF alike', () => {
    assert.equal(toPhotoStem('Amphipoea keiferi-A-D.jpg'), 'Amphipoea keiferi-A-D');
    assert.equal(toPhotoStem('Amphipoea keiferi-A-D.tif'), 'Amphipoea keiferi-A-D');
  });

  it('keeps dots inside the name, stripping only the final extension', () => {
    assert.equal(toPhotoStem('Euxoa sp. 2-A-D.jpg'), 'Euxoa sp. 2-A-D');
  });

  it('leaves an extensionless name alone', () => {
    assert.equal(toPhotoStem('Amphipoea keiferi-A-D'), 'Amphipoea keiferi-A-D');
  });
});

describe('readPhotoDeterminations', () => {
  it('returns an empty map when the file does not exist', () => {
    assert.equal(readPhotoDeterminations('/nonexistent/photo-determinations.csv').size, 0);
  });

  it('keys rulings by stem and trims every field', () => {
    const path = writeCsv(
      HEADER + ' Amphipoea keiferi-A-D , resapamea-innota , C , #330 , curator said so \n',
    );
    const map = readPhotoDeterminations(path);
    assert.deepEqual(map.get('Amphipoea keiferi-A-D'), {
      photo_stem: 'Amphipoea keiferi-A-D',
      species_slug: 'resapamea-innota',
      specimen: 'C',
      source: '#330',
      note: 'curator said so',
    });
  });

  it('skips rows with a blank stem rather than keying on the empty string', () => {
    const path = writeCsv(HEADER + ',resapamea-innota,C,#330,orphan row\n');
    assert.equal(readPhotoDeterminations(path).size, 0);
  });

  // The whole file is a claim about identity; two claims about one photograph
  // means one of them is silently losing, which is the failure mode this data
  // exists to end.
  it('refuses two rulings about one photograph', () => {
    const path = writeCsv(
      HEADER +
        'Amphipoea keiferi-A-D,resapamea-innota,C,#330,first\n' +
        'Amphipoea keiferi-A-D,amphipoea-keiferi,A,#331,second\n',
    );
    assert.throws(() => readPhotoDeterminations(path), /appears twice/);
  });
});

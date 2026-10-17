// scripts/rename-species.test.ts
//
// `npm run species:rename` against a small fixture repository. The fixture holds one file of
// each kind the script edits, so a new kind of file that names a species is a failing test here
// before it is a stale slug in production (ADR 0054).
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { applyPlan, editCsv, parseArgs, planRename, resolveTarget, splitCsvLine, splitCsvRecords } from './rename-species.ts';

const OLD = 'malacosoma-californicum';
const NEW = 'malacosoma-californica';

const SPECIES_CSV = [
  'id,genus,species,common_name,noc_id,authority,family,similar_species,subfamily,epithet_quoted,tribe',
  '1,Malacosoma,californicum,Western Tent Caterpillar Moth,MONA 7702,"(Packard, 1864)",Lasiocampidae,malacosoma-constrictum|malacosoma-disstria,Lasiocampinae,,',
  '2,Malacosoma,constrictum,,MONA 7699,"(Stretch, 1881)",Lasiocampidae,malacosoma-californicum|malacosoma-disstria,Lasiocampinae,,',
  '3,Malacosoma,disstria,,MONA 7701,"(Hübner, 1820)",Lasiocampidae,,Lasiocampinae,,',
  '4,Xylophanes,nr libya,,,,Sphingidae,,Macroglossinae,,',
  '',
].join('\n');

const FILES: Record<string, string> = {
  'data/species.csv': SPECIES_CSV,
  'data/images.csv': [
    'species_slug,filename,photographer,weight,cdn_folder',
    `${OLD},Malacosoma californicum-A-D.jpg,Merrill A. Peterson,1,`,
    `${OLD},Malacosoma californicum-A-V.jpg,Merrill A. Peterson,2,already-frozen`,
    'malacosoma-constrictum,Malacosoma constrictum-A-D.jpg,Merrill A. Peterson,1,',
    '',
  ].join('\n'),
  'data/species-photos-manifest.csv': [
    'filename_raw,specimen_id,view,species_slug,status,cdn_folder',
    `Malacosoma californicum-A-D.tif,A,D,${OLD},uploaded,`,
    `Malacosoma californicum-B-D.tif,B,D,${OLD},discovered,`,
    `Malacosoma californicum-C-D.tif,C,D,${OLD},tiled,`,
    // Filed under constrictum by its filename, but a determination says it is californicum.
    'Malacosoma constrictum-A-V.tif,A,V,malacosoma-constrictum,uploaded,',
    // Filed under californicum by its filename, but a determination moves it elsewhere.
    `Malacosoma californicum-D-D.tif,D,D,${OLD},uploaded,`,
    '',
  ].join('\n'),
  'data/photo-determinations.csv': [
    'photo_stem,species_slug,specimen,source,note',
    `Malacosoma constrictum-A-V,${OLD},D,#1,note`,
    'Malacosoma californicum-D-D,malacosoma-disstria,D,#1,note',
    '',
  ].join('\n'),
  'data/species-photos.json': JSON.stringify({
    'malacosoma-californicum': { high_res_available: true, specimens: [{ specimen_id: 'A', view: 'D', tiles_path: 'species-tiles/malacosoma-californicum/A-D' }] },
    'malacosoma-constrictum': { high_res_available: true, specimens: [] },
  }, null, 2) + '\n',
  'data/species-redirects.csv': [
    'old_slug,new_slug,reason',
    `malacosoma-californica,${OLD},an earlier rename`,
    `earlier-name,${OLD},older still`,
    '',
  ].join('\n'),
  'data/species-synonyms.csv': [
    'from_binomial,to_species_slug',
    `Malacosoma californica,${OLD}`,
    'Other thing,malacosoma-disstria',
    '',
  ].join('\n'),
  'data/species-links.csv': [
    'species_slug,site,url',
    `${OLD},bamona,https://www.butterfliesandmoths.org/species/Malacosoma-californicum`,
    '',
  ].join('\n'),
  'data/species-plates.csv': ['species_slug,plate_slug', `${OLD},plate-2`, 'malacosoma-constrictum,plate-2', ''].join('\n'),
  'data/checklist-order.csv': ['species_slug,mpg_p_no,match', `${OLD},870018,gender`, ''].join('\n'),
  'data/records.csv': [
    'species_slug,record_type,notes,record_id',
    `${OLD},specimen,"em. ex. hemlock;\nJune 21, 1952",1`,
    'malacosoma-disstria,specimen,,2',
    '',
  ].join('\n'),
  'data/records-inat.csv': ['species_slug,record_type,inat_id', `${OLD},observation,9`, ''].join('\n'),
  'data/records-derived-district.csv': ['row_index,species_slug,outcome', `1,${OLD},assigned`, ''].join('\n'),
  'data/unpublished-species.csv': ['slug,reason', 'xylophanes-nr-libya,provisional', ''].join('\n'),
  'data/mpg-crosswalk.csv': ['species_slug,mpg_binomial,source', 'xylophanes-nr-libya,Xylophanes libya,#1', ''].join('\n'),
  'data/referential-integrity-exceptions.csv': ['relation,slug,kind,issue', ''].join('\n'),
  'data/image-derivatives.csv': [
    'derived_path,source_path,kind,variant,bytes',
    `derived/${OLD}/Malacosoma californicum-A-D@320h.webp,${OLD}/Malacosoma californicum-A-D.jpg,legacy,320h,1`,
    '',
  ].join('\n'),
  'data/key-matrix.json': '{"species":[{"slug":"malacosoma-californicum"}]}',
  'src/_data/speciesSlugs.json': JSON.stringify(['malacosoma-californicum', 'malacosoma-constrictum', 'malacosoma-disstria'], null, 2) + '\n',
  [`src/content/species/${OLD}.md`]: '*Malacosoma californicum* is a common moth.\n',
  'src/content/species/malacosoma-constrictum.md': 'Text.\n',
  'scripts/check-photo-determinations.ts': `export const KNOWN_COLLISIONS = new Set(['${OLD}|A|D', 'other-species|A|D']);\n`,
};

const roots: string[] = [];

function makeRoot(overrides: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'rename-species-'));
  roots.push(root);
  for (const [path, text] of Object.entries({ ...FILES, ...overrides })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

function read(root: string, path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('splitCsvLine and editCsv', () => {
  it('give a line back exactly, quotes included', () => {
    const line = '1,"a, b",,"say ""hi""",z';
    assert.equal(splitCsvLine(line).join(','), line);
  });

  it('keeps a quoted field that spans lines inside one record', () => {
    const text = 'a,b\n1,"x\ny"\n2,z\n';
    assert.deepEqual(splitCsvRecords(text), ['a,b', '1,"x\ny"', '2,z']);
  });

  it('changes only the cell it is told to change', () => {
    const text = 'slug,note\nold,"keep, this"\nother,"and ""this"""\n';
    const result = editCsv(text, 't', (rec) => { if (rec['slug'] === 'old') rec['slug'] = 'new'; });
    assert.equal(result.text, 'slug,note\nnew,"keep, this"\nother,"and ""this"""\n');
    assert.equal(result.changed, 1);
  });
});

describe('resolveTarget', () => {
  const old = { genus: 'Malacosoma', species: 'californicum' };

  it('takes a binomial as written', () => {
    assert.deepEqual(resolveTarget(old, 'Macaria ulsterata'), { genus: 'Macaria', species: 'ulsterata' });
    assert.deepEqual(resolveTarget(old, 'Xylophanes nr libya'), { genus: 'Xylophanes', species: 'nr libya' });
  });

  it('reads a slug that keeps the old genus', () => {
    assert.deepEqual(resolveTarget(old, 'malacosoma-californica'), { genus: 'Malacosoma', species: 'californica' });
  });

  it('reads a slug that keeps the old epithet (a genus move)', () => {
    assert.deepEqual(resolveTarget({ genus: 'Speranza', species: 'boreata' }, 'macaria-boreata'), { genus: 'Macaria', species: 'boreata' });
  });

  it('asks for a binomial when the slug could be read either way', () => {
    assert.throws(() => resolveTarget(old, 'something-else'), /binomial/);
  });
});

describe('parseArgs', () => {
  it('takes two positional arguments and an optional reason', () => {
    assert.deepEqual(parseArgs(['a-b', 'A c', '--reason', 'because']), { oldSlug: 'a-b', target: 'A c', reason: 'because' });
    assert.throws(() => parseArgs(['only-one']), /usage/);
  });
});

describe('planRename', () => {
  it('re-keys the slug in every file that holds it', () => {
    const root = makeRoot();
    const plan = planRename(root, { oldSlug: OLD, target: NEW });
    applyPlan(root, plan);

    assert.match(read(root, 'data/species.csv'), /^2,Malacosoma,constrictum,.*malacosoma-californica\|malacosoma-disstria/m);
    assert.match(read(root, 'data/species.csv'), /^1,Malacosoma,californica,Western Tent Caterpillar Moth,/m);
    assert.match(read(root, 'data/species.csv'), /^1,.*malacosoma-constrictum\|malacosoma-disstria/m);
    for (const [path, expected] of [
      ['data/species-links.csv', `${NEW},bamona,`],
      ['data/species-plates.csv', `${NEW},plate-2`],
      ['data/checklist-order.csv', `${NEW},870018`],
      ['data/records-inat.csv', `${NEW},observation`],
      ['data/records-derived-district.csv', `1,${NEW},assigned`],
    ] as const) {
      assert.ok(read(root, path).includes(expected), `${path} should hold "${expected}"`);
      assert.ok(!read(root, path).includes(`${OLD},`), `${path} should no longer hold the old slug`);
    }
    // A record whose note spans lines is edited and not mangled.
    assert.ok(read(root, 'data/records.csv').includes(`${NEW},specimen,"em. ex. hemlock;\nJune 21, 1952",1`));
    // An external URL that spells the old name is the other site's, not ours.
    assert.ok(read(root, 'data/species-links.csv').includes('/species/Malacosoma-californicum'));
    assert.ok(read(root, 'src/_data/speciesSlugs.json').includes(`"${NEW}"`));
    assert.ok(read(root, 'scripts/check-photo-determinations.ts').includes(`'${NEW}|A|D'`));
    assert.ok(existsSync(join(root, `src/content/species/${NEW}.md`)));
    assert.ok(!existsSync(join(root, `src/content/species/${OLD}.md`)));
  });

  it('moves nothing on the CDN: folders are frozen and the derivatives ledger is untouched', () => {
    const root = makeRoot();
    applyPlan(root, planRename(root, { oldSlug: OLD, target: NEW }));

    const images = read(root, 'data/images.csv');
    assert.ok(images.includes(`${NEW},Malacosoma californicum-A-D.jpg,Merrill A. Peterson,1,${OLD}`), 'a blank folder becomes the old slug');
    assert.ok(images.includes(`${NEW},Malacosoma californicum-A-V.jpg,Merrill A. Peterson,2,already-frozen`), 'an existing folder is kept');
    assert.ok(images.includes('malacosoma-constrictum,Malacosoma constrictum-A-D.jpg,Merrill A. Peterson,1,\n'), 'other species are untouched');
    assert.equal(read(root, 'data/image-derivatives.csv'), FILES['data/image-derivatives.csv']);
    // The tile paths keep naming the folder the tiles are in.
    assert.ok(read(root, 'data/species-photos.json').includes('"tiles_path": "species-tiles/malacosoma-californicum/A-D"'));
    assert.ok(read(root, 'data/species-photos.json').includes(`"${NEW}": {`));
  });

  it('freezes only tiles that exist, and by the species they are filed under after determinations', () => {
    const root = makeRoot();
    applyPlan(root, planRename(root, { oldSlug: OLD, target: NEW }));
    const manifest = read(root, 'data/species-photos-manifest.csv');
    // uploaded and tiled rows of the species are frozen; a row not yet tiled is not
    assert.ok(manifest.includes(`Malacosoma californicum-A-D.tif,A,D,${NEW},uploaded,${OLD}`));
    assert.ok(manifest.includes(`Malacosoma californicum-B-D.tif,B,D,${NEW},discovered,\n`));
    assert.ok(manifest.includes(`Malacosoma californicum-C-D.tif,C,D,${NEW},tiled,${OLD}`));
    // filed under constrictum by name, but determined to californicum: frozen, slug unchanged
    assert.ok(manifest.includes(`Malacosoma constrictum-A-V.tif,A,V,malacosoma-constrictum,uploaded,${OLD}`));
    // filed under californicum by name, determined elsewhere: renamed, but its tiles are not californicum's
    assert.ok(manifest.includes(`Malacosoma californicum-D-D.tif,D,D,${NEW},uploaded,\n`));
    assert.ok(read(root, 'data/photo-determinations.csv').includes(`Malacosoma constrictum-A-V,${NEW},D,`));
  });

  it('adds the redirect, collapses chains, and swaps the redundant synonym for the old name', () => {
    const root = makeRoot();
    applyPlan(root, planRename(root, { oldSlug: OLD, target: NEW, reason: 'MPG spelling (#369)' }));

    const redirects = read(root, 'data/species-redirects.csv');
    assert.ok(redirects.includes(`${OLD},${NEW},MPG spelling (#369)`));
    assert.ok(redirects.includes(`earlier-name,${NEW},older still`), 'an older redirect now points at the live slug');
    assert.ok(!redirects.includes(`malacosoma-californica,${OLD}`), 'a redirect away from the live slug is dropped');

    const synonyms = read(root, 'data/species-synonyms.csv');
    assert.ok(!synonyms.includes('Malacosoma californica,'), 'a species is not its own synonym');
    assert.ok(synonyms.includes(`Malacosoma californicum,${NEW}`), 'the old name resolves to the new species');
    assert.ok(synonyms.includes('Other thing,malacosoma-disstria'));
  });

  it('is idempotent: once renamed, a second run says so and changes nothing', () => {
    const root = makeRoot();
    applyPlan(root, planRename(root, { oldSlug: OLD, target: NEW }));
    const again = planRename(root, { oldSlug: OLD, target: NEW });
    assert.equal(again.status, 'already-renamed');
    assert.equal(again.edits.size, 0);
  });

  it('refuses a rename onto a slug that is already a species (that is a merge)', () => {
    const root = makeRoot();
    assert.throws(() => planRename(root, { oldSlug: OLD, target: 'Malacosoma constrictum' }), /merging two species/);
  });

  it('refuses a species that does not exist', () => {
    const root = makeRoot();
    assert.throws(() => planRename(root, { oldSlug: 'no-such-species', target: 'Genus other' }), /no species has the slug/);
  });

  it('fails, writing nothing, when the old slug would survive in a file it does not know', () => {
    const root = makeRoot({ 'data/something-new.csv': `species_slug,x\n${OLD},1\n` });
    assert.throws(
      () => planRename(root, { oldSlug: OLD, target: NEW }),
      /would still appear in 1 place\(s\).*data\/something-new\.csv:2/s,
    );
    assert.equal(read(root, 'data/species.csv'), SPECIES_CSV, 'the plan is built in memory; nothing was written');
  });

  it('leaves the curator-owned fields and the prose alone, and says so', () => {
    const root = makeRoot();
    const plan = planRename(root, { oldSlug: OLD, target: NEW });
    applyPlan(root, plan);
    assert.ok(read(root, 'data/species.csv').includes('"(Packard, 1864)"'));
    assert.ok(read(root, `src/content/species/${NEW}.md`).includes('*Malacosoma californicum*'));
    assert.ok(plan.notes.some((n) => n.includes('authority')));
    assert.ok(plan.notes.some((n) => n.includes('No CDN copy')));
  });
});

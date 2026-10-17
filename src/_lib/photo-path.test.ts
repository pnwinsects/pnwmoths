// src/_lib/photo-path.test.ts
//
// Where a photograph lives on the CDN (ADR 0054), and the guard that keeps every other
// file from working it out for itself.
//
// Two kinds of test here, because the failure being prevented is quiet:
//
//   1. A renamed species — slug `malacosoma-californica`, folder `malacosoma-californicum`
//      — pushed through each module that turns a photograph row into a path. Until the
//      first rename every row has a blank folder, so every one of these modules gives the
//      right answer whether or not it uses photo-path.ts. Only a renamed species tells
//      them apart.
//   2. A scan of the source tree for code that joins a slug and a filename by hand.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cdnFolder, folderIfRenamed, photoPath, tileFolder, tilesPath } from './photo-path.ts';
import { speciesSocialImage } from './social-meta.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CDN = 'https://moths.pnwinsects.org';

/** A species renamed from *californicum* to *californica*; its photographs did not move. */
const RENAMED = { species_slug: 'malacosoma-californica', cdn_folder: 'malacosoma-californicum' };
const UNRENAMED = { species_slug: 'abagrotis-apposita', cdn_folder: '' };

describe('photoPath', () => {
  it('uses the slug when the folder is blank, null or absent', () => {
    for (const cdn_folder of ['', null, undefined]) {
      assert.equal(
        photoPath({ species_slug: 'abagrotis-apposita', cdn_folder, filename: 'Abagrotis apposita-A-D.jpg' }),
        'abagrotis-apposita/Abagrotis apposita-A-D.jpg',
      );
    }
  });

  it('uses the frozen folder, not the slug, once a species is renamed', () => {
    assert.equal(
      photoPath({ ...RENAMED, filename: 'Malacosoma californicum-A-D.jpg' }),
      'malacosoma-californicum/Malacosoma californicum-A-D.jpg',
    );
    assert.equal(cdnFolder(RENAMED), 'malacosoma-californicum');
  });
});

describe('folderIfRenamed', () => {
  it('is undefined for a species whose folder is its slug, so browser data stays unchanged', () => {
    assert.equal(folderIfRenamed(UNRENAMED), undefined);
    assert.equal(folderIfRenamed({ species_slug: 'abagrotis-apposita', cdn_folder: 'abagrotis-apposita' }), undefined);
  });

  it('names the folder for a renamed species', () => {
    assert.equal(folderIfRenamed(RENAMED), 'malacosoma-californicum');
  });
});

describe('tilesPath', () => {
  it('lower-cases the slug when the folder is blank, as the tile pipeline always has', () => {
    assert.equal(
      tilesPath({ species_slug: 'Abagrotis-Apposita', cdn_folder: '', specimen_id: 'A', view: 'D' }),
      'species-tiles/abagrotis-apposita/A-D',
    );
    assert.equal(tileFolder({ species_slug: 'Abagrotis-Apposita' }), 'abagrotis-apposita');
  });

  it('uses the frozen folder for a renamed species', () => {
    assert.equal(
      tilesPath({ ...RENAMED, specimen_id: 'B', view: 'V' }),
      'species-tiles/malacosoma-californicum/B-V',
    );
  });
});

describe('a renamed species, through each place that shows a photograph', () => {
  const photo = { filename: 'Malacosoma californicum-A-D.jpg', cdn_folder: RENAMED.cdn_folder, weight: 1 };

  it('the share image (og:image) points at the frozen folder', () => {
    const url = speciesSocialImage(RENAMED.species_slug, undefined, [photo], CDN);
    assert.equal(url, `${CDN}/malacosoma-californicum/Malacosoma%20californicum-A-D.jpg`);
  });
});

// ---------------------------------------------------------------------------
// The scan
// ---------------------------------------------------------------------------

/**
 * Source files that may build a photograph path themselves:
 *   - photo-path.ts, which is the one place that should;
 *   - the one-off migrate-* scripts, which hard-code both names of a pair on purpose
 *     (they copy objects from one folder to another, so a folder derived from the
 *     catalogue would be the wrong thing to use);
 *   - tests, which spell paths out as expected values.
 */
function isExempt(rel: string): boolean {
  return (
    rel === 'src/_lib/photo-path.ts' ||
    /^scripts\/migrate-[^/]+\.ts$/.test(rel) ||
    /\.test\.ts$/.test(rel) ||
    rel.startsWith('src/content/')
  );
}

function sourceFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|njk)$/.test(entry.name)) found.push(relative(ROOT, full).replaceAll('\\', '/'));
    }
  };
  walk(join(ROOT, 'scripts'));
  walk(join(ROOT, 'src'));
  found.push('eleventy.config.ts');
  return found.filter((rel) => !isExempt(rel)).sort();
}

/** Each way of joining a folder and a filename by hand that this repository has used. */
const HAND_BUILT: ReadonlyArray<{ pattern: RegExp; what: string }> = [
  { pattern: /\$\{[^}]*slug[^}]*\}\/\$\{[^}]*filename[^}]*\}/i, what: '`${…slug…}/${…filename…}`' },
  { pattern: /slug\s*\+\s*['"]\/['"]\s*\+\s*[\w.]*filename/i, what: "`slug + '/' + …filename`" },
  { pattern: /species-tiles\/\$\{/, what: '`species-tiles/${…}`' },
];

/** Lines that are only a comment can describe a path without building one. */
function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{#');
}

export function findHandBuiltPhotoPaths(
  files: ReadonlyArray<{ rel: string; text: string }>,
): string[] {
  const hits: string[] = [];
  for (const { rel, text } of files) {
    text.split('\n').forEach((line, i) => {
      if (isCommentLine(line)) return;
      for (const { pattern, what } of HAND_BUILT) {
        if (pattern.test(line)) hits.push(`${rel}:${i + 1}: builds a photograph path by hand with ${what}`);
      }
    });
  }
  return hits;
}

describe('findHandBuiltPhotoPaths', () => {
  it('flags each way of joining a slug and a filename', () => {
    const files = [
      { rel: 'a.ts', text: 'const p = `${row.species_slug}/${row.filename}`;' },
      { rel: 'b.njk', text: "{{ (sp.slug + '/' + img.filename) | derivative('full') }}" },
      { rel: 'c.ts', text: 'const t = `species-tiles/${slug}/${pair}`;' },
    ];
    assert.equal(findHandBuiltPhotoPaths(files).length, 3);
  });

  it('ignores comments and labels that are not paths', () => {
    const files = [
      { rel: 'a.ts', text: '// the path is `${slug}/${filename}`' },
      { rel: 'b.ts', text: ' * `species-tiles/${slug}/…` is mirrored on disk' },
      { rel: 'c.ts', text: 'log(`${row.species_slug}/${row.specimen_id}-${row.view}`);' },
    ];
    assert.deepEqual(findHandBuiltPhotoPaths(files), []);
  });
});

describe('photograph paths in the source tree', () => {
  it('are all built by src/_lib/photo-path.ts', () => {
    const files = sourceFiles().map((rel) => ({ rel, text: readFileSync(resolve(ROOT, rel), 'utf8') }));
    assert.deepEqual(
      findHandBuiltPhotoPaths(files),
      [],
      'A path joined by hand ignores `cdn_folder`, and works until the first species rename. ' +
        'Use photoPath() or tilesPath() from src/_lib/photo-path.ts (ADR 0054).',
    );
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync } from 'node:fs';
import {
  VARIANTS,
  derivedPath,
  specsForSource,
  buildWorkList,
  readSources,
  sourcePaths,
  vipsCommands,
  vipsTarget,
  acquireManifestLock,
  releaseManifestLock,
  isProcessAlive,
  type Variant,
} from './derivatives.ts';

const w530 = VARIANTS.highres.find((v) => v.token === '530')!;
const h320 = VARIANTS.legacy.find((v) => v.token === '320h')!;
const j1200 = VARIANTS.highres.find((v) => v.token === '1200')!;

describe('derivedPath', () => {
  it('puts every derivative under the derived/ prefix', () => {
    assert.match(derivedPath('x/y.jpg', h320), /^derived\//);
  });

  it('replaces the extension rather than appending to it', () => {
    assert.equal(derivedPath('habrosyne-scripta/a.jpg', h320), 'derived/habrosyne-scripta/a@320h.webp');
  });

  it('preserves spaces in Django-era filenames for the caller to encode', () => {
    assert.equal(
      derivedPath('habrosyne-scripta/Habrosyne scripta-A-D.jpg', h320),
      'derived/habrosyne-scripta/Habrosyne scripta-A-D@320h.webp',
    );
  });

  it('keeps the jpg extension for the share-card variant', () => {
    assert.equal(
      derivedPath('species-tiles/x/A-D_thumbnail.webp', j1200),
      'derived/species-tiles/x/A-D_thumbnail@1200.jpg',
    );
  });

  it('only strips a dot in the final segment', () => {
    assert.equal(derivedPath('a.b/c', w530), 'derived/a.b/c@530.webp');
  });

  it('distinguishes variants that differ only by size', () => {
    const w1060 = VARIANTS.highres.find((v) => v.token === '1060')!;
    assert.notEqual(derivedPath('x/y.webp', w530), derivedPath('x/y.webp', w1060));
  });
});

describe('VARIANTS matrix', () => {
  it('omits a 1500 hi-res variant — that slot is the stored thumbnail itself', () => {
    // `'1500'` is not in VariantToken at all, so tsc rejects a direct comparison:
    // the invariant is enforced at compile time and this only pins the token list.
    assert.deepEqual(
      VARIANTS.highres.map((v) => v.token),
      ['530', '1060', '320h', '1200'],
    );
  });

  it('shares one 320h thumbnail across the 93/186/320 slots', () => {
    assert.equal(VARIANTS.legacy.filter((v) => v.token.endsWith('h')).length, 1);
    assert.equal(VARIANTS.highres.filter((v) => v.token.endsWith('h')).length, 1);
  });

  it('emits jpg for the share card, because crawlers handle WebP badly (ADR 0021)', () => {
    assert.equal(j1200.ext, 'jpg');
  });

  it('produces no duplicate tokens within a kind', () => {
    for (const [kind, variants] of Object.entries(VARIANTS)) {
      const tokens = variants.map((v: Variant) => v.token);
      assert.equal(new Set(tokens).size, tokens.length, kind);
    }
  });
});

describe('buildWorkList', () => {
  it('produces one spec per source × variant', () => {
    const list = buildWorkList({ legacy: ['a/b.jpg'], highres: ['t/c.webp'], glossary: ['glossary/g.jpg'] });
    assert.equal(list.length, 2 + 4 + 2);
  });

  it('collapses duplicate sources — glossary terms share illustrations', () => {
    const list = buildWorkList({ legacy: [], highres: [], glossary: ['glossary/g.jpg', 'glossary/g.jpg'] });
    assert.equal(list.length, 2);
  });

  it('never emits two specs for the same derived path', () => {
    const list = buildWorkList({
      legacy: ['a/b.jpg', 'a/b.jpg'],
      highres: ['t/c.webp'],
      glossary: [],
    });
    const paths = list.map((s) => s.derivedPath);
    assert.equal(new Set(paths).size, paths.length);
  });

  it('is deterministic, so reruns and diffs are stable', () => {
    const args = { legacy: ['b/2.jpg', 'a/1.jpg'], highres: [], glossary: [] };
    assert.deepEqual(buildWorkList(args), buildWorkList(args));
    assert.equal(buildWorkList(args)[0]?.sourcePath, 'a/1.jpg');
  });
});

describe('specsForSource', () => {
  it('tags each spec with its source kind', () => {
    assert.ok(specsForSource('a/b.jpg', 'legacy').every((s) => s.kind === 'legacy'));
  });
});

describe('vipsTarget', () => {
  it('pins WebP quality to the tiling pipeline value', () => {
    assert.equal(vipsTarget('/tmp/o.webp', 'webp'), '/tmp/o.webp[Q=80]');
  });

  it('encodes jpg at its own quality', () => {
    assert.match(vipsTarget('/tmp/o.jpg', 'jpg'), /\[Q=\d+\]$/);
  });
});

describe('vipsCommands', () => {
  const src = { width: 3000, height: 2000 };

  it('resizes by width in a single command', () => {
    const cmds = vipsCommands({ op: 'width', width: 530 }, '/in', '/out.webp', 'webp', src);
    assert.equal(cmds.length, 1);
    assert.deepEqual(cmds[0], ['thumbnail', '/in', '/out.webp[Q=80]', '530', '--size', 'down']);
  });

  it('constrains height with a non-binding width ceiling', () => {
    const cmds = vipsCommands({ op: 'height', height: 320 }, '/in', '/out.webp', 'webp', src);
    assert.equal(cmds.length, 1);
    const [, , , width, flag, height] = cmds[0]!;
    assert.equal(flag, '--height');
    assert.equal(height, '320');
    assert.ok(Number(width) > src.width, 'width ceiling must not bind');
  });

  it('never upscales — every path passes --size down or an exact cover', () => {
    for (const t of [
      { op: 'width' as const, width: 530 },
      { op: 'height' as const, height: 320 },
      { op: 'passthrough' as const },
    ]) {
      const cmds = vipsCommands(t, '/in', '/out.webp', 'webp', src);
      assert.ok(cmds[0]!.includes('down'), JSON.stringify(t));
    }
  });

  it('re-encodes passthrough at the source width', () => {
    const cmds = vipsCommands({ op: 'passthrough' }, '/in', '/out.webp', 'webp', src);
    assert.equal(cmds[0]![3], '3000');
  });

  describe('fit (what Bunny actually does for the glossary box)', () => {
    it('is a single thumbnail bounded by both dimensions', () => {
      const cmds = vipsCommands({ op: 'fit', width: 188, height: 225 }, '/in', '/out.webp', 'webp', src);
      assert.equal(cmds.length, 1);
      assert.deepEqual(
        cmds[0],
        ['thumbnail', '/in', '/out.webp[Q=80]', '188', '--height', '225', '--size', 'down'],
      );
    });

    it('never crops — Bunny returns byte-identical output for gravity north/south/absent', () => {
      const cmds = vipsCommands({ op: 'fit', width: 188, height: 225 }, '/in', '/out.webp', 'webp', src);
      assert.equal(cmds.flat().includes('extract_area'), false);
      assert.equal(cmds.flat().includes('--crop'), false);
    });

    it('never upscales, matching the optimizer', () => {
      const cmds = vipsCommands({ op: 'fit', width: 4000, height: 4000 }, '/in', '/out.webp', 'webp', src);
      assert.ok(cmds[0]!.includes('down'));
    });
  });
});

describe('manifest lock', () => {
  const lockPath = join(tmpdir(), `deriv-lock-${process.pid}.lock`);

  it('refuses to run while a live process holds the lock', () => {
    acquireManifestLock(lockPath, process.pid);
    // A different pid that is definitely alive: our own parent-safe stand-in.
    assert.throws(
      () => acquireManifestLock(lockPath, process.pid + 1),
      /locked by pid/,
      'a second holder must be rejected, not silently allowed to clobber',
    );
    releaseManifestLock(lockPath);
  });

  it('takes over a stale lock rather than blocking forever', () => {
    writeFileSync(lockPath, '999999999'); // a pid that cannot exist
    assert.doesNotThrow(() => acquireManifestLock(lockPath, process.pid));
    releaseManifestLock(lockPath);
  });

  it('is re-entrant for the same pid, so a retry does not deadlock', () => {
    acquireManifestLock(lockPath, process.pid);
    assert.doesNotThrow(() => acquireManifestLock(lockPath, process.pid));
    releaseManifestLock(lockPath);
  });

  it('release is idempotent', () => {
    releaseManifestLock(lockPath);
    assert.doesNotThrow(() => releaseManifestLock(lockPath));
  });

  it('reports a live process as alive and an impossible pid as dead', () => {
    assert.equal(isProcessAlive(process.pid), true);
    assert.equal(isProcessAlive(999999999), false);
  });
});

describe('readSources', () => {
  // A throwaway data dir, so the assertions pin the shape rather than the
  // 4,000-row committed inventory.
  const dataDir = mkdtempSync(join(tmpdir(), 'pnwmoths-sources-'));
  writeFileSync(join(dataDir, 'images.csv'), [
    'species_slug,filename',
    'abagrotis-apposita,Abagrotis apposita-A-D.jpg',
    // Blank cells are skipped rather than yielding a path like "undefined/x".
    ',orphan.jpg',
    'no-file,',
  ].join('\n') + '\n');
  writeFileSync(join(dataDir, 'species-photos.json'), JSON.stringify({
    'abagrotis-apposita': { specimens: [{ tiles_path: 'species-tiles/abagrotis-apposita/A-D' }] },
    'no-specimens': {},
  }));
  writeFileSync(join(dataDir, 'glossary.csv'), [
    'term,image_filename',
    'wing,wing.jpg',
    'no-image,',
  ].join('\n') + '\n');

  const sources = readSources(dataDir);

  it('joins legacy paths from species_slug and filename', () => {
    assert.deepEqual(sources.legacy, [
      { path: 'abagrotis-apposita/Abagrotis apposita-A-D.jpg', speciesSlug: 'abagrotis-apposita' },
    ]);
  });

  it('appends _thumbnail.webp to each high-res tiles_path', () => {
    assert.deepEqual(sources.highres, [
      {
        path: 'species-tiles/abagrotis-apposita/A-D_thumbnail.webp',
        speciesSlug: 'abagrotis-apposita',
      },
    ]);
  });

  it('takes the high-res species slug from the JSON key, not the tiles path', () => {
    // ADR 0001: join slugs never come from a filename or a storage path.
    assert.equal(sources.highres[0]?.speciesSlug, 'abagrotis-apposita');
  });

  it('leaves glossary art unattached to any species', () => {
    assert.deepEqual(sources.glossary, [{ path: 'glossary/wing.jpg', speciesSlug: null }]);
  });

  it('sourcePaths flattens to the shape buildWorkList takes', () => {
    assert.deepEqual(sourcePaths(sources), {
      legacy: ['abagrotis-apposita/Abagrotis apposita-A-D.jpg'],
      highres: ['species-tiles/abagrotis-apposita/A-D_thumbnail.webp'],
      glossary: ['glossary/wing.jpg'],
    });
  });

  it('feeds buildWorkList a complete variant set per source', () => {
    const specs = buildWorkList(sourcePaths(sources));
    assert.equal(specs.length, VARIANTS.legacy.length + VARIANTS.highres.length + VARIANTS.glossary.length);
  });
});

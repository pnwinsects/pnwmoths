import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { entryTags, VITE_ENTRIES, type ViteManifest } from './vite-entries.ts';

const manifest: ViteManifest = {
  'src/styles/site.css': { file: 'assets/site-abc.css' },
  'src/components/main.ts': {
    file: 'assets/main-def.js',
    css: ['assets/main-def.css'],
    imports: ['_shared-1.js'],
  },
  '_shared-1.js': { file: 'assets/shared-1.js', css: ['assets/shared-1.css'], imports: ['_shared-2.js'] },
  '_shared-2.js': { file: 'assets/shared-2.js', imports: ['_shared-1.js'] },
};

test('entryTags: a CSS entry is one stylesheet link', () => {
  assert.equal(entryTags(manifest, 'src/styles/site.css', '/'), '<link rel="stylesheet" href="/assets/site-abc.css">');
});

test('entryTags: a script entry brings its CSS, its imports\' CSS and modulepreloads, then the script', () => {
  assert.deepEqual(entryTags(manifest, 'src/components/main.ts', '/').split('\n  '), [
    '<link rel="stylesheet" href="/assets/main-def.css">',
    '<link rel="stylesheet" href="/assets/shared-1.css">',
    '<link rel="modulepreload" href="/assets/shared-1.js">',
    '<link rel="modulepreload" href="/assets/shared-2.js">',
    '<script type="module" src="/assets/main-def.js"></script>',
  ]);
});

test('entryTags: applies the path prefix to every URL (GitHub Pages staging)', () => {
  const tags = entryTags(manifest, 'src/components/main.ts', '/pnwmoths/');
  for (const url of tags.match(/(?:href|src)="([^"]*)"/g) ?? []) {
    assert.match(url, /="\/pnwmoths\/assets\//);
  }
});

test('entryTags: an entry missing from the manifest is an error, not an empty string', () => {
  assert.throws(() => entryTags(manifest, 'src/components/nope.ts', '/'), /not in the Vite manifest/);
});

test('VITE_ENTRIES: every entry exists on disk', () => {
  for (const path of Object.values(VITE_ENTRIES)) {
    assert.doesNotThrow(() => readFileSync(path), `${path} is listed as a Vite entry but does not exist`);
  }
});

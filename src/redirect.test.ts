// src/redirect.test.ts
// End-to-end guard for the legacy-URL landing page (#181, ADR 0019).
//
// The page's logic is src/components/legacy-redirect.ts, a Vite entry of its own
// (ADR 0049), which imports the shared resolver from src/_lib/legacy-redirects.ts. The
// page supplies the data the module reads: the species slugs as a JSON block, and the
// pathPrefix-aware base on <body>. If any link in that chain breaks — the entry drops out
// of the build, the import drifts, the page stops loading the entry or stops supplying
// its data — nothing throws at build time. The page renders, the script never runs, and
// every inbound link from the old WWU site silently dies. So this asserts each link: the
// rendered page, and a real `vite build` from vite.config.ts with the resolver's mapping
// table in the emitted bundle.
//
// Lives outside src/_lib so it stays out of tsconfig.node.json: `new Eleventy(...)` has no
// construct signature under NodeNext resolution — same reason src/species-redirect.test.ts
// sits here.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import Eleventy from '@11ty/eleventy';
import { build as viteBuild } from 'vite';
import { entryTags, VITE_ENTRIES, type ViteManifest } from './_lib/vite-entries.ts';

const REDIRECT_ENTRY = VITE_ENTRIES['legacy-redirect'];

/** A manifest standing in for the real build, so the page renders without one. */
const STUB_MANIFEST: ViteManifest = {
  [REDIRECT_ENTRY]: { file: 'assets/legacy-redirect-STUB.js' },
};

// Mirrors the `ts` data-extension wiring and the viteEntry shortcode in eleventy.config.ts
// (including the .test.ts skip) so the emitted HTML — not the template source — is what
// gets asserted.
async function renderRedirectPage(pathPrefix: string): Promise<string> {
  const elev = new Eleventy('src/redirect.njk', undefined, {
    pathPrefix,
    config(eleventyConfig) {
      eleventyConfig.setInputDirectory('src');
      eleventyConfig.addShortcode('viteEntry', (entry: string) => entryTags(STUB_MANIFEST, entry, pathPrefix));
      eleventyConfig.addDataExtension('ts', {
        read: false,
        parser: async (filePath: string) => {
          if (filePath.endsWith('.test.ts')) return undefined;
          const absolutePath = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
          const m = (await import(pathToFileURL(absolutePath).href)) as { default: unknown };
          const exported = m.default;
          return typeof exported === 'function' ? exported() : exported;
        },
      });
    },
  });
  const json = (await elev.toJSON()) as Array<{ url: string; content: string }>;
  const page = json[0];
  assert.ok(page, 'expected src/redirect.njk to render exactly one page');
  return page.content;
}

describe('redirect.html: rendered output', () => {
  test('supplies the species slug list and a pathPrefix-aware base for the module', async () => {
    const content = await renderRedirectPage('/pnwmoths/');
    assert.match(content, /<body data-base-url="\/pnwmoths\/">/, 'the base must carry pathPrefix for GitHub Pages staging');
    const block = content.match(/<script type="application\/json" id="species-slugs">([\s\S]*?)<\/script>/);
    assert.ok(block, 'the species slug list must be in the page, where legacy-redirect.ts reads it');
    const slugs = JSON.parse(block[1] ?? '') as unknown;
    assert.ok(Array.isArray(slugs) && slugs.includes('habrosyne-scripta'), 'the block must be the species slug array');
  });

  test('loads the legacy-redirect entry, prefixed', async () => {
    const content = await renderRedirectPage('/pnwmoths/');
    assert.match(content, /<script type="module" src="\/pnwmoths\/assets\/legacy-redirect-STUB\.js"><\/script>/);
    assert.doesNotMatch(content, /<script type="module">/, 'no inline module: Vite no longer reads the HTML');
  });
});

describe('legacy-redirect entry: real Vite build', () => {
  test('bundles the shared resolver into the redirect entry', async () => {
    const result = await viteBuild({
      configFile: resolve('vite.config.ts'),
      logLevel: 'silent',
      build: { write: false },
    });
    const outputs = (Array.isArray(result) ? result : [result]) as Array<{
      output: Array<{ type: string; name?: string; code?: string }>;
    }>;
    const chunk = outputs
      .flatMap(r => r.output)
      .find(o => o.type === 'chunk' && o.name === 'legacy-redirect');
    assert.ok(chunk?.code, 'vite.config.ts must build a legacy-redirect entry');
    assert.ok(
      chunk.code.includes('/about-moths/glossary/'),
      'the shared resolver table must be bundled into the redirect entry — the import resolved to nothing',
    );
    assert.ok(
      chunk.code.includes('photographic-plates'),
      'the shared resolver logic must be bundled into the redirect entry',
    );
  });
});

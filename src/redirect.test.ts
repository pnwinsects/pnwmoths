// src/redirect.test.ts
// End-to-end guard for the legacy-URL landing page (#181, ADR 0019).
//
// The page is now a Vite entry: its inline module imports the shared resolver from
// src/_lib/legacy-redirects.ts, which is passthrough-copied to _site/_lib. If that
// arrangement breaks — the passthrough is dropped, the import path drifts, the page stops
// being scanned as an entry — nothing throws at build time. The page renders, the script
// never runs, and every inbound link from the old WWU site silently dies. So this drives a
// real Eleventy render and a real vite.build() over the output and asserts the resolver's
// mapping table actually lands in the emitted bundle.
//
// Lives outside src/_lib so it stays out of tsconfig.node.json: `new Eleventy(...)` has no
// construct signature under NodeNext resolution — same reason src/species-redirect.test.ts
// sits here.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  readdirSync,
  copyFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  realpathSync,
} from 'node:fs';
import { resolve, isAbsolute, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import Eleventy from '@11ty/eleventy';
import { build as viteBuild } from 'vite';

// Mirrors the `ts` data-extension wiring in eleventy.config.ts (including the .test.ts
// skip) so the emitted HTML — not the template source — is what gets asserted.
async function renderRedirectPage(pathPrefix: string): Promise<string> {
  const elev = new Eleventy('src/redirect.njk', undefined, {
    pathPrefix,
    config(eleventyConfig) {
      eleventyConfig.setInputDirectory('src');
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
  test('inlines the species slug list and a pathPrefix-aware BASE', async () => {
    const content = await renderRedirectPage('/pnwmoths/');
    assert.match(content, /const BASE = '\/pnwmoths\/'/, 'BASE must carry pathPrefix for GitHub Pages staging');
    assert.match(content, /new Set\(\["/, 'the species slug list must be inlined into the page');
  });

  test('the module import survives a real Vite build with the resolver bundled in', async () => {
    const content = await renderRedirectPage('/');
    // realpathSync: on macOS os.tmpdir() is a symlink and Vite resolves `root` to the real
    // path, which otherwise turns emitted asset names into rejected path traversals (#168).
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'pnwm-redirect-vite-')));
    try {
      // Reproduces the production layout: redirect.html at the site root, _lib/ beside it.
      writeFileSync(join(dir, 'redirect.html'), content);
      mkdirSync(join(dir, '_lib'), { recursive: true });
      for (const file of readdirSync(resolve('src/_lib')).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
        copyFileSync(resolve('src/_lib', file), join(dir, '_lib', file));
      }

      const result = await viteBuild({
        root: dir,
        logLevel: 'silent',
        build: { write: false, rollupOptions: { input: { redirect: join(dir, 'redirect.html') } } },
      });
      const output = (result as { output: Array<{ type: string; code?: string }> }).output;
      const bundledJs = output.filter(o => o.type === 'chunk').map(o => o.code ?? '').join('\n');

      assert.ok(
        bundledJs.includes('/about-moths/glossary/'),
        'the shared resolver table must be bundled into the redirect page — the import resolved to nothing',
      );
      assert.ok(
        bundledJs.includes('photographic-plates'),
        'the shared resolver logic must be bundled into the redirect page',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

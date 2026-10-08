// Builds the client bundle: the entries in src/_lib/vite-entries.ts, and nothing else.
// Vite does not see the HTML. Eleventy loads each entry through the `viteEntry`
// shortcode, which reads the manifest this build writes (ADR 0049).
import { defineConfig } from 'vite';
import { VITE_ENTRIES, VITE_OUT_DIR, pathPrefix } from './src/_lib/vite-entries.ts';

export default defineConfig({
  // Applied to the URLs Vite writes into the bundle itself, e.g. the lazily
  // loaded openseadragon chunk. The shortcode applies the same prefix to the tags.
  base: pathPrefix,
  // public/ is passthrough-copied by Eleventy; nothing here references it.
  publicDir: false,
  build: {
    outDir: VITE_OUT_DIR,
    // Not under `npm run dev`: there `vite build --watch` starts beside `eleventy --serve`,
    // and emptying the directory races Eleventy's first passthrough copy out of it.
    emptyOutDir: !process.env['PNWM_VITE_WATCH'],
    manifest: true,
    sourcemap: true,
    rollupOptions: { input: VITE_ENTRIES },
  },
});

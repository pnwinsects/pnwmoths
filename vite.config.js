import { defineConfig } from 'vite';

export default defineConfig({
  root: '_site',
  build: {
    outDir: '_site',
    emptyOutDir: false, // CRITICAL: do not delete Eleventy output
  },
});

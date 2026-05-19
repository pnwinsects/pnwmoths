import { defineConfig } from 'vite';

const base = process.env.GITHUB_PAGES ? '/pnwmoths/' : '/';

export default defineConfig({
  root: '_site',
  base,
  build: {
    outDir: '_site',
    emptyOutDir: false,
    sourcemap: true,
  },
});

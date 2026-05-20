import { defineConfig } from 'vite';

const base = process.env.GITHUB_PAGES ? '/pnwmoths/' : '/';

export default defineConfig({
  root: '_site',
  base,
  server: {
    hmr: { port: 24679 },
  },
  build: {
    outDir: '_site',
    emptyOutDir: false,
    sourcemap: true,
  },
});

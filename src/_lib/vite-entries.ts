// The client bundle's entry points, and the tags that load them (ADR 0049).
//
// Vite builds these entries on its own (vite.config.ts); it never sees the HTML. Each
// page loads an entry through the `viteEntry` shortcode, which looks the entry up in
// Vite's manifest and writes the tags for its hashed files. Before this, Vite processed
// every page as an entry of its own, ~1,390 of them, and from vite 8.3 that no longer
// fit in CI's heap (#364).

/**
 * The served-path prefix. On GitHub Pages the site lives under /pnwmoths/;
 * actions/configure-pages sets GITHUB_PAGES=true so the build knows to apply it.
 * Locally and in production it is "/", which makes `| url` a no-op. Shared by
 * eleventy.config.ts and vite.config.ts, which must agree on it.
 */
export const pathPrefix = process.env['GITHUB_PAGES'] ? '/pnwmoths/' : '/';

/** Where `vite build` writes; eleventy.config.ts passthrough-copies its assets/ into _site/. */
export const VITE_OUT_DIR = '.vite-build';

/** Vite's manifest, relative to {@link VITE_OUT_DIR}. */
export const VITE_MANIFEST = '.vite/manifest.json';

/** Every entry a page may load, keyed by the name the build gives its output file. */
export const VITE_ENTRIES = {
  main: 'src/components/main.ts',
  'legacy-redirect': 'src/components/legacy-redirect.ts',
  site: 'src/styles/site.css',
} as const;

/** One record of Vite's build manifest (the fields this module reads). */
export interface ManifestChunk {
  file: string;
  css?: string[];
  imports?: string[];
}
export type ViteManifest = Record<string, ManifestChunk>;

/**
 * The HTML that loads `entry`: a stylesheet link for a CSS entry; for a script entry,
 * links for every stylesheet it or its static imports pull in, modulepreloads for those
 * imports, then the module script. Paths are prefixed with `prefix` (Vite's `base`).
 *
 * Throws when the entry is not in the manifest, so a page cannot silently ship
 * without its script.
 */
export function entryTags(manifest: ViteManifest, entry: string, prefix: string): string {
  const chunk = manifest[entry];
  if (!chunk) {
    throw new Error(
      `viteEntry: "${entry}" is not in the Vite manifest. Run \`npm run build:vite\` first, ` +
        `and list the entry in VITE_ENTRIES (src/_lib/vite-entries.ts).`
    );
  }
  const href = (file: string) => `${prefix}${file}`;
  if (chunk.file.endsWith('.css')) return `<link rel="stylesheet" href="${href(chunk.file)}">`;

  // Static imports, depth-first, each once. Their CSS loads with the entry's.
  const imports: ManifestChunk[] = [];
  const seen = new Set<string>();
  const visit = (keys: readonly string[] | undefined) => {
    for (const key of keys ?? []) {
      if (seen.has(key)) continue;
      seen.add(key);
      const imported = manifest[key];
      if (!imported) continue;
      imports.push(imported);
      visit(imported.imports);
    }
  };
  visit(chunk.imports);

  const css = [...new Set([...(chunk.css ?? []), ...imports.flatMap(c => c.css ?? [])])];
  return [
    ...css.map(file => `<link rel="stylesheet" href="${href(file)}">`),
    ...imports.map(c => `<link rel="modulepreload" href="${href(c.file)}">`),
    `<script type="module" src="${href(chunk.file)}"></script>`,
  ].join('\n  ');
}

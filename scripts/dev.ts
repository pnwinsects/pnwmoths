// scripts/dev.ts — `npm run dev`: the client bundle and the site, both rebuilt on change.
//
// Vite and Eleventy are separate builds (ADR 0049): Vite writes the bundle and its
// manifest, and Eleventy writes pages whose tags come from that manifest. So dev runs
// one `vite build` first, then `vite build --watch` beside `eleventy --serve`. Eleventy
// watches the manifest, so a component edit rebuilds the pages that load it, and the
// passthrough copy carries the new bundle into _site/.
//
// A script rather than `a & b` in package.json so it behaves the same in every shell,
// and so stopping one process stops the other.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const BIN = 'node_modules/.bin';

function main(): void {
  const first = spawnSync(`${BIN}/vite`, ['build'], { stdio: 'inherit' });
  if (first.status !== 0) process.exit(first.status ?? 1);

  const children: ChildProcess[] = [
    // PNWM_VITE_WATCH keeps the watcher from emptying .vite-build/ while Eleventy copies
    // out of it (vite.config.ts).
    spawn(`${BIN}/vite`, ['build', '--watch'], { stdio: 'inherit', env: { ...process.env, PNWM_VITE_WATCH: '1' } }),
    spawn(`${BIN}/eleventy`, ['--serve', '--config=eleventy.config.ts'], { stdio: 'inherit' }),
  ];
  const stopAll = (code: number) => {
    for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
    process.exit(code);
  };
  for (const child of children) child.on('exit', code => stopAll(code ?? 0));
  process.on('SIGINT', () => stopAll(0));
  process.on('SIGTERM', () => stopAll(0));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

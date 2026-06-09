---
phase: 33-toolchain-schema-scaffolding
plan: "01"
subsystem: toolchain
tags: [typescript, tsconfig, devDependencies, eleventy-shim]
dependency_graph:
  requires: []
  provides: [tsconfig.node.json, tsconfig.browser.json, tsconfig.json, src/types/eleventy.d.ts, npm-run-typecheck]
  affects: [package.json, package-lock.json]
tech_stack:
  added: [typescript@^6, "@types/node@^24", "@types/leaflet@^1.9.21"]
  patterns: [three-config-tsconfig-layout, allowImportingTsExtensions-with-noEmit, eleventy-local-type-shim]
key_files:
  created:
    - tsconfig.json
    - tsconfig.node.json
    - tsconfig.browser.json
    - src/types/eleventy.d.ts
  modified:
    - package.json
    - package-lock.json
decisions:
  - "Use allowImportingTsExtensions:true (not rewriteRelativeImportExtensions) in tsconfig.node.json — semantically correct for Node 24 native type-stripping + noEmit:true workflow"
  - "typecheck script invokes each sub-config explicitly (tsc -p tsconfig.browser.json --noEmit && tsc -p tsconfig.node.json --noEmit) because tsc does not follow references in plain --noEmit mode"
  - "No composite:true in any tsconfig — only needed for tsc --build incremental mode; omitted to avoid .tsbuildinfo side effects"
  - "Keep zod in dependencies (not devDependencies) — consumed by build scripts at build time, not dev-only"
metrics:
  duration: "~4 minutes"
  completed: "2026-06-09"
  tasks_completed: 2
  files_changed: 6
---

# Phase 33 Plan 01: Toolchain Install & tsconfig Scaffolding Summary

**One-liner:** TypeScript toolchain with three-config layout (NodeNext + Vite bundler + root references) and Eleventy shim, npm run typecheck exits 0 before any .js file is converted.

## What Was Built

Repaired the research-phase slopcheck install (five packages incorrectly in `dependencies`) and wired the full TypeScript type-check infrastructure:

1. **Dependency classification corrected** (`package.json` + `package-lock.json`): `typescript`, `@types/node@^24`, `@types/leaflet` moved to `devDependencies`; `zod` kept in `dependencies`; `@types/openseadragon` removed (OSD 6 ships own types; stub used enum syntax violating TS-03).

2. **`npm run typecheck` script added** with exact value `tsc -p tsconfig.browser.json --noEmit && tsc -p tsconfig.node.json --noEmit` — each sub-config invoked explicitly because TypeScript does NOT follow `references` in plain `--noEmit` mode.

3. **Three tsconfig files created:**
   - `tsconfig.node.json`: NodeNext module/resolution, Node 24 target, `isolatedModules:true`, `allowImportingTsExtensions:true`, `noEmit:true`, strict + extra-strict flags.
   - `tsconfig.browser.json`: ESNext/bundler for Vite, `useDefineForClassFields:false` (Lit requirement), `experimentalDecorators:true` (Lit reactive props), `isolatedModules:true`, DOM lib, `types:["vite/client"]`.
   - `tsconfig.json`: Root IDE/editor solution config with `files:[]` and `references` to both sub-configs.

4. **`src/types/eleventy.d.ts` shim created** (~25 lines): `EleventyTransformContext` interface (`page.outputPath: string | false`), `EleventyConfig` interface with all 6 called methods (`addPlugin`, `addFilter`, `addTransform`, `addGlobalData`, `addPassthroughCopy`, `on`), and `declare module '@11ty/eleventy'` with `EleventyRenderPlugin`.

## Verification Results

- `node -e "..."` package.json assertion: **package.json OK**
- `npm run typecheck && node -e "..."` tsconfig + shim assertion: **tsconfigs + shim OK**
- `grep -rnE '\benum\b' src/types/`: **empty (no enums)**

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. This plan adds only toolchain scaffolding (tsconfigs, type shim, dependency classification) with no runtime behavior or data paths.

## Threat Flags

None. This plan adds only dev-tooling (`devDependencies`) and type declarations; no runtime code, no network endpoints, no new trust boundaries.

## Self-Check: PASSED

- tsconfig.json exists: FOUND
- tsconfig.node.json exists: FOUND
- tsconfig.browser.json exists: FOUND
- src/types/eleventy.d.ts exists: FOUND
- Task 1 commit 947d5233: FOUND
- Task 2 commit 715fe38a: FOUND

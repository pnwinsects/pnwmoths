---
phase: 37-lit-web-components-migration
plan: "03"
subsystem: src/components
tags: [lit, typescript, migration, slideshow, occurrence-popup, plate-viewer, glossary-tooltip, MIG-04]
dependency_graph:
  requires:
    - src/types/schemas.ts (zod/mini, Specimen/OccurrenceRecord types — Plan 01)
    - src/types/index.ts (re-exports Specimen, OccurrenceRecord)
  provides:
    - src/components/pnwm-image-slideshow.ts (typed Lit component, static properties = {} form)
    - src/components/pnwm-image-slideshow.test.ts (direct class import, node --test green)
    - src/components/pnwm-occurrence-popup.ts (typed popup with OccurrenceRecord)
    - src/components/pnwm-plate-viewer.ts (typed plate-viewer component)
    - src/components/glossary-tooltip.ts (typed vanilla DOM script)
  affects:
    - Plans 04-05 (remaining components depend on same types layer)
tech_stack:
  added: []
  patterns:
    - static properties: PropertyDeclarations = {} class-field form preserved (D-06/D-07)
    - noUncheckedIndexedAccess ?? fallback pattern on all Specimen[] index accesses (Pitfall 7)
    - typed querySelectorAll<HTMLElement> + non-null assertions for build-baked DOM (glossary-tooltip)
    - OSD open() string cast via as unknown as TileSourceSpecifier (runtime-valid, types absent)
key_files:
  created: []
  modified:
    - src/components/pnwm-image-slideshow.ts
    - src/components/pnwm-image-slideshow.test.ts
    - src/components/pnwm-occurrence-popup.ts
    - src/components/pnwm-plate-viewer.ts
    - src/components/glossary-tooltip.ts
decisions:
  - D-06/D-07 preserved: static properties = {} class-field form, no decorators, customElements.define kept
  - OSD open() call: string cast (as unknown as TileSourceSpecifier) preserves runtime behavior where @types lacks the string overload for the method
  - _handleKeydown: renamed bound copy to _boundHandleKeydown to avoid TypeScript duplicate identifier error while preserving symmetric addEventListener/removeEventListener
  - zoomifytileservice cast to TileSourceOptions for plate-viewer (OSD @types lacks tilesUrl property but it is valid at runtime)
metrics:
  duration: 548s
  completed: "2026-06-10"
  tasks: 3
  files: 5
---

# Phase 37 Plan 03: Standalone Display Components (.ts) Summary

One-liner: Rename+annotate four display-only components (slideshow/popup/plate-viewer/glossary-tooltip) to TypeScript with static-properties class-field form, typed Specimen[]/OccurrenceRecord fields, noUncheckedIndexedAccess guards, and no decorators.

## What Was Built

### Task 1: Convert pnwm-image-slideshow.js -> .ts + test (TDD, MIG-04)

Converted `src/components/pnwm-image-slideshow.js` to TypeScript using TDD:

- **RED commit:** renamed test file `.js` → `.ts` (git mv), updated import specifier `.js` → `.ts`; tests failed until source existed
- **GREEN commit:** renamed component `.js` → `.ts`, added full type annotations

Key type changes:
- Expanded Lit import to `{ LitElement, html, css, type PropertyDeclarations, type CSSResult, type TemplateResult, type PropertyValues }`
- Added `import type { Specimen } from '../types/index.ts'`
- `static properties: PropertyDeclarations = { ... }` — class-field form preserved (NOT getter, per plan)
- `static styles: CSSResult = css\`...\``
- All instance fields declared above constructor (`slug: string`, `_currentIndex: number`, `_images: Array<{...}>`, `_highResSpecimens: Specimen[]`, `_osdViewer: import('openseadragon').Viewer | null`, etc.)
- `noUncheckedIndexedAccess` guards: `this._highResSpecimens[this._currentIndex] ?? this._highResSpecimens[0]!` in `_prevSpecimen`, `_nextSpecimen`, `render()`, `_openLightbox()`; `MONTHS[month - 1]!` in `_formatCaption`
- Test file: `import { PnwmImageSlideshow } from './pnwm-image-slideshow.ts'` (direct class import — the decorator-free proof)

Test file also gained type annotations for inline lambda params (`url: string`, `ctx: {...}`, `view: string`) to satisfy `noImplicitAny`.

### Task 2: Convert pnwm-occurrence-popup.js + pnwm-plate-viewer.js -> .ts (TDD, MIG-04)

**RED commit:** renamed both files `.js` → `.ts`; typecheck failed with missing field declarations and implicit any params.

**GREEN commit:** added type annotations to both files.

`pnwm-occurrence-popup.ts`:
- `static properties: PropertyDeclarations = { record: { attribute: false } }`
- `record: OccurrenceRecord | null` instance field
- `formatPlace/formatDateLine/formatAttribution/formatNotes` all typed with `OccurrenceRecord` param
- Lit `html` template preserved exactly — the existing XSS mitigation (T-37-04) carried forward unchanged; no unsafeHTML
- `noUncheckedIndexedAccess` guard on `MONTHS[r.month - 1]!` in `formatDateLine`

`pnwm-plate-viewer.ts`:
- `static properties: PropertyDeclarations = { ... }` with `tilesUrl/prefixUrl/width/height`
- All instance fields declared and initialized in constructor
- `querySelector<HTMLElement>('#viewer')` with early return null guard
- `zoomifytileservice` object cast to `TileSourceOptions` (OSD @types lacks `tilesUrl` but runtime supports it)

### Task 3: Convert glossary-tooltip.js -> .ts (vanilla DOM script, MIG-04)

Rename+annotate of the top-level vanilla DOM script — no Lit class, no customElements.define:

- `querySelectorAll<HTMLElement>('abbr.glossary-term')` typed
- `forEach((abbr: HTMLElement, index: number) => ...)` callback typed
- `hideTimer: ReturnType<typeof setTimeout> | undefined`
- `popover.querySelector<HTMLImageElement>('.gt-img')!` and `popover.querySelector<HTMLParagraphElement>('.gt-def')!` — non-null assertions justified by build-time-authored `innerHTML` on the same popover
- `show(): void` and `hide(): void` return types
- All runtime behavior byte-identical (SC-5)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Duplicate identifier for _handleKeydown**
- **Found during:** Task 1 GREEN typecheck
- **Issue:** TypeScript reported "Duplicate identifier '_handleKeydown'" — declaring a `declare` field with the same name as the method created a conflict
- **Fix:** Renamed the bound copy field from `_handleKeydown` to `_boundHandleKeydown` (used in `connectedCallback`/`disconnectedCallback`); kept the method as `_handleKeydown`. Tests still pass (tests use `_buildDziUrl`, `_prevSpecimen`, `_nextSpecimen`, `_formatCaption` — not `_handleKeydown` directly)
- **Files modified:** `src/components/pnwm-image-slideshow.ts`
- **Commit:** e3a3a965

**2. [Rule 1 - Bug] OSD Viewer.open() type mismatch**
- **Found during:** Task 1 GREEN typecheck
- **Issue:** `@types/openseadragon` types `Viewer.open()` as `(tileSources: TileSourceSpecifier | TileSourceSpecifier[]) => Viewer` but the original JS passed a DZI URL string directly
- **Fix:** Added `as unknown as import('openseadragon').TileSourceSpecifier` cast — preserves runtime behavior (OSD accepts string DZI URLs at runtime); string overload absent from types. Tests confirm the string value still reaches the mock `open()` call unchanged
- **Files modified:** `src/components/pnwm-image-slideshow.ts`
- **Commit:** e3a3a965

**3. [Rule 1 - Bug] pnwm-image-slideshow.test.ts implicit any params**
- **Found during:** Task 1 GREEN typecheck
- **Issue:** Inline callback params `url`, `ctx`, `view` had implicit `any` type under `noImplicitAny`
- **Fix:** Added type annotations: `url: string`, `ctx: { highResAvailable: boolean; _highResSpecimens?: unknown[] }`, `view: string`
- **Files modified:** `src/components/pnwm-image-slideshow.test.ts`
- **Commit:** e3a3a965

**4. [Rule 1 - Bug] pnwm-plate-viewer.ts zoomifytileservice tilesUrl property**
- **Found during:** Task 2 GREEN typecheck
- **Issue:** `@types/openseadragon` `TileSourceOptions` lacks `tilesUrl` property; OSD does support `zoomifytileservice` with `tilesUrl` at runtime
- **Fix:** Added `as import('openseadragon').TileSourceOptions` cast on the tileSources object literal
- **Files modified:** `src/components/pnwm-plate-viewer.ts`
- **Commit:** 3062f5fa

## Self-Check

### Created/Modified Files Exist
- [x] `src/components/pnwm-image-slideshow.ts` — exists
- [x] `src/components/pnwm-image-slideshow.test.ts` — exists
- [x] `src/components/pnwm-occurrence-popup.ts` — exists
- [x] `src/components/pnwm-plate-viewer.ts` — exists
- [x] `src/components/glossary-tooltip.ts` — exists

### .js variants removed
- [x] `src/components/pnwm-image-slideshow.js` — does not exist
- [x] `src/components/pnwm-occurrence-popup.js` — does not exist
- [x] `src/components/pnwm-plate-viewer.js` — does not exist
- [x] `src/components/glossary-tooltip.js` — does not exist

### Commits Exist
- [x] fac21ec3 — test(37-03): TDD RED - pnwm-image-slideshow.test.ts with .ts import specifier
- [x] e3a3a965 — feat(37-03): convert pnwm-image-slideshow.js -> .ts with typed Specimen/OSD fields (MIG-04)
- [x] 69073950 — test(37-03): TDD RED - pnwm-occurrence-popup.ts, pnwm-plate-viewer.ts renamed
- [x] 3062f5fa — feat(37-03): convert pnwm-occurrence-popup.ts, pnwm-plate-viewer.ts - typed (MIG-04)
- [x] f608eb5b — feat(37-03): convert glossary-tooltip.js -> .ts (vanilla DOM script, MIG-04)

### Verification Results
- [x] `grep -c "@customElement|@property|@state" pnwm-image-slideshow.ts` = 0
- [x] `grep -c "static properties" pnwm-image-slideshow.ts` = 1 (class-field form preserved)
- [x] `grep -c "pnwm-image-slideshow.js" pnwm-image-slideshow.test.ts` = 0
- [x] `node --test src/components/pnwm-image-slideshow.test.ts` — 17/17 pass
- [x] `grep -c "customElements.define" pnwm-occurrence-popup.ts` = 1
- [x] `grep -c "customElements.define" pnwm-plate-viewer.ts` = 1
- [x] `grep -c "html\`" pnwm-occurrence-popup.ts` = 7 (Lit html escaping preserved)
- [x] `grep -c "unsafeHTML" pnwm-occurrence-popup.ts` = 0
- [x] `grep -c "querySelectorAll<HTMLElement>" glossary-tooltip.ts` = 1
- [x] `grep -c "@ts-ignore" glossary-tooltip.ts` = 0
- [x] `npm run typecheck` exits 0

## Self-Check: PASSED

## Known Stubs

None — this plan is a rename+annotate conversion. No new data flows or UI rendering paths introduced.

## Threat Flags

None — this plan's threat model explicitly covers T-37-04 (occurrence-popup XSS via Lit html escaping). The Lit `html` tagged template was preserved exactly; no unsafeHTML introduced. No new network endpoints, auth paths, or schema changes.

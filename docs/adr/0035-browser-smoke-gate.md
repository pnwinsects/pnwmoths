# 0035. The built bundle is driven in a real browser before it ships

**Status:** Accepted
**Date:** 2026-08-16
**Issue:** [#316](https://github.com/pnwinsects/pnwmoths/issues/316)
**Follows:** [#315](https://github.com/pnwinsects/pnwmoths/pull/315), the regression that motivated it

## Context

For three days every interactive component on the production site rendered its first frame and then
froze. Maps sat on "Loading occurrence data…", the filter bar and Browse accordions were inert, the
photo lightbox never opened. Nothing threw, nothing logged, and every gate the project has was
green.

The cause is written up in [#315](https://github.com/pnwinsects/pnwmoths/pull/315) and in
[lessons-learned](../lessons-learned.md): Lit installs reactive properties as accessors on the
prototype, a plain TypeScript field declaration compiles to a real class field when
`useDefineForClassFields` is on, and an instance field shadows the accessor, so the setter never runs
and `requestUpdate()` never fires. The Vite 8 bump ([#193](https://github.com/pnwinsects/pnwmoths/pull/193))
flipped that default underneath a root `tsconfig.json` that did not set it.

What matters here is not the bug but **why nothing could see it**. Every check this project runs
reads bytes:

| Gate | What it reads |
| --- | --- |
| `npm test` | the TypeScript **sources**, via node's type stripping |
| `check-html.ts` | static markup, tokenized ([ADR 0024](0024-html-validity-gate.md)) |
| `check-page-weight.ts` | file sizes |
| `check-derivatives.ts`, `check-withheld.ts`, `check-referential-integrity.ts` | flat data files |
| `lychee` | `href`/`src` attributes |
| `deploy-smoke.ts` | that the CDN returns the bytes we uploaded |

A site whose every component is inert satisfies all of them. `npm test` is the sharp case: its
component tests import the sources and call exported pure functions, and node's type stripping
**erases an annotation-only declaration**, so the suite exercised different code than the bundler
emitted. The tests were not weak; they were testing a different artifact.

The static guard added in #315 (`src/components/reactive-fields.test.ts`) closes this specific hole —
it fails if a component reintroduces a plain class field or either tsconfig loses the option. It
cannot close the general one, because the general one is "the bundle behaves differently from the
sources" and there is no bound on the ways that can happen.

## Decision

**`scripts/check-browser-smoke.ts` serves `_site/` and drives it in headless Chrome, asserting that
components reach their _second_ frame. It runs in CI after the build — blocking, and before the
production upload.**

- **Assertions are about state *changes*, not presence.** Every check is chosen so that passing it
  requires a re-render: the occurrence map must report a non-zero plotted count (which needs the
  async Parquet load to resolve *and* `_loading = false` to go through the accessor); a Browse family
  heading must flip `aria-expanded` and reveal a child; an Identify character selection must move the
  results count. "Did the HTML appear" would have passed during the outage.
- **Only observable DOM is asserted** — aria-labels, `aria-expanded`, visible text. Never component
  internals. The map's aria-label is load-bearing precisely because it is the component's own
  published summary of what it drew, so an assertion on it cannot drift from what a user gets.
- **Three pages, chosen for distinct machinery, not for coverage.** The species factsheet is the
  async-Parquet path (hyparquet, the copied `.parquet` files, `import.meta.env.BASE_URL`); Browse is
  pure client-side reactivity over two fetched JSON files; Identify is the only path that crosses a
  component boundary, where `pnwm-identify` sets properties on `<key-results-grid>`. A shadowed field
  on either side of that boundary breaks the third check and neither of the first two.
- **The species under test is derived from the build, never pinned.** `pickSpeciesSlug()` takes the
  largest `records.parquet` — the species with the most records. A hard-coded slug would be a
  curation hostage (species get merged, renamed and gated, see [ADR 0029](0029-removing-a-species.md)),
  and "most records" is what makes a plotted count of zero a real failure rather than an artefact of
  which species we happened to name.
- **Everything off-origin is aborted** — OpenStreetMap tiles, Bunny CDN photos, Google Fonts. The
  check is hermetic and has no external failure modes, and blocking the network forces the assertions
  onto what the components *compute* rather than what they download. A map still reports the markers
  it plotted with no basemap under them.
- **It is NOT part of `npm run build`.** The build stays runnable offline and without a browser, the
  same reasoning that keeps `generate-range-map.ts` and `generate-social-card.ts` manual. A
  maintainer editing a CSV on a laptop must not need Chrome to see their change.
- **`playwright-core`, driving an already-installed browser.** It is already a dependency for
  `generate-social-card.ts` and bundles no browser of its own; the GitHub Actions ubuntu runner image
  preinstalls Chrome, so CI needs no download step and no `--with-deps`. Channels are probed
  (`chrome`, `chromium`, `msedge`) and `SMOKE_BROWSER_CHANNEL` overrides.
- **It runs before `site:upload` in production**, not after. `deploy:smoke` already checks that the
  CDN serves what we uploaded; that is a freshness check and it passed happily throughout the outage.
  This one asks whether what we are about to upload works.

## Consequences

- **Verified against the actual regression, not against a description of it.** Reverting
  `src/components` and `tsconfig.json` to `4eb8c2f1^` and rebuilding under vite 8.2.1 reproduces the
  shipped emit byte-for-byte — `properties={record:{attribute:!1}};record;` — and all three checks
  fail with the diagnosis in the message. The build still exits 0, as it did in August.
- **A stale `node_modules` hides this class of bug entirely.** The first reproduction attempt built
  green because the local install was vite 8.0.10 while `package.json` asked for `^8.2.1`. That is
  worth knowing on its own: *the bundler version is part of the input*, and a local build proves less
  about production than it appears to. Recorded in [lessons-learned](../lessons-learned.md).
- **CI gains a browser step of roughly a minute.** Failures cost more — each unmet assertion burns
  its 15s timeout — which is the right way round.
- **The failure messages carry the diagnosis, not just the symptom.** A frozen map prints the #315
  signature and points at `declare` and `useDefineForClassFields`, because the expensive part of that
  outage was not fixing it but recognising it.
- **This does not cover no-JS degradation**, which is a separate invariant and stays with the static
  gates: these checks run *with* JavaScript by definition.
- **Three checks is a floor, not a target.** [ADR 0013](0013-highres-osd-dzi.md) already wants a
  one-species E2E for the OSD viewer in the lightbox; that is a natural fourth and is not built here.

## Alternatives rejected

- **Extend `reactive-fields.test.ts` to cover more static patterns.** It is a good guard and it stays,
  but it answers "does the source look right", and the whole lesson of #315 is that the source looked
  right. Every static guard is a list of known ways to be wrong.
- **Run the component tests in a browser (jsdom, web-test-runner, Vitest browser mode).** This is the
  conventional answer and it is aimed slightly off-target. It would test the components as *modules*,
  compiled by the test runner's own pipeline — a third artifact, agreeing with neither the sources
  nor `_site/`. The defect lived in what eleventy-plugin-vite emitted, so the only trustworthy input
  is the built site.
- **Full `@playwright/test`.** Brings a test runner, a config file, browser downloads and a fixture
  model for three assertions, in a repo whose entire suite is `node --test`. The runner's value is in
  parallelism, retries and reporting; none of those are what is missing here. Rejected as a second
  testing idiom for no gain.
- **Screenshot / visual regression.** Would have caught this and much it should not: a map with no
  basemap (because the network is blocked) and CDN photos that come and go make pixel comparison
  noisy exactly where this needs to be certain. Semantic assertions on the accessible DOM say what we
  actually mean.
- **Check the emitted bundle textually for `};fieldname;`.** Cheap, and it would have caught this
  precise shape — but it is `check-html.ts`'s trick applied to a problem that is not textual. The next
  bundler-only breakage will not be a class field.
- **Run it against production instead of the local build (extend `deploy:smoke`).** Then the gate
  fires *after* users see the outage, which is where we already were.
- **Advisory rather than blocking.** [ADR 0033](0033-referential-integrity-gate.md) draws this line
  well: advisory is right where judgement is involved, blocking is right where the answer is
  mechanical. "Did the component re-render" is mechanical.

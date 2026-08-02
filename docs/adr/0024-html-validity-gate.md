# 0024. The build fails on a malformed or unknown start tag

**Status:** Accepted

## Context

`src/plates/index.njk` opened a Nunjucks comment with the whitespace-stripping marker *inside* an
open tag:

```njk
<img
  {#- The stored thumbnail is already 240×300 … -#}
  src="{{ … | derivative('240x300') }}"
```

The `-` ate the newline separating the tag name from its first attribute, so every card on
`/plates/` shipped as `<imgsrc="https://…">` — 98 of them. The HTML tokenizer ends a tag name at
whitespace, `/` or `>`, so that is an element named `imgsrc`, which renders as nothing. The plates
index lost every thumbnail, in production, for months.

Nothing in the pipeline said so, and it is worth being precise about why, because each near-miss
looks like coverage:

- **Vite does parse it.** The build prints `Unable to parse HTML; parse5 error code
  unexpected-character-in-attribute-name` — and exits 0. A warning in a 17-step build is not a gate.
- **`node-html-parser` is already a dependency, and hides it.** Parsing the broken page with it
  returns an ordinary `img` element. It is lenient by design; using it here would have proved the
  markup fine.
- **lychee reads `href`/`src` attributes.** An element that never became an `img` has no `src` for
  it to check, so the link checker sees nothing missing.
- **`check-derivatives.ts` proves the derivative exists on the CDN**, which it did. The URL was
  correct; it just was not in an attribute of a real element.
- **`check-page-weight.ts` weighs bytes**, and the page got *smaller*.

The common shape: every existing check reads the output as a document. This defect destroyed the
document *while* producing valid-looking bytes, so reading it as a document is exactly what cannot
see it.

## Decision

**`scripts/check-html.ts` runs as a build step (`build:check-html`, inside `build:site`) and fails
the build if any emitted page contains a start tag that is malformed or names an element that does
not exist.**

Two rules, applied to `_site/**/*.html`:

1. **A tag name must be followed by whitespace, `/` or `>`.** Anything else means the separator was
   lost and an attribute has been fused onto the name — `<imgsrc="…"`.
2. **The name must be a standard HTML element or a valid custom element** (one containing a hyphen).
   This catches the same root cause in the case rule 1 cannot see: `<img` followed by a valueless
   attribute collapses to `<imghidden`, a bare name that is perfectly well-formed and simply is not
   an element.

The check is **textual**, matching the one tokenizer rule that matters, and runs against **built
output** rather than templates — so it holds regardless of which templating feature produced the
markup. Comments, `<script>` bodies and `<style>` bodies are masked first (length- and
line-preserving, so reported line numbers stay true), because `a<bfoo` in JavaScript is not a start
tag.

Deprecated elements are deliberately absent from the element list: emitting `<center>` should start
a conversation, not pass quietly.

## Consequences

- Verified against the real defect before the fix landed: 98 findings, exit 1, grouped to one line
  per tag name per file — 98 copies of one bug is one bug, and printing it 98 times buries the next
  one. After the template fix: `PASS: 1376 page(s)`.
- **Zero false positives across the whole site today.** 1,376 pages, 50 distinct element names, all
  standard or `pnwm-*`. That is what makes a zero-tolerance gate affordable here; a guard that cries
  wolf gets deleted.
- A new standard element (`<search>`, `<dialog>`) that the list is missing fails the build with a
  message naming the file to edit. The list is the maintenance cost, and it is the part that earns
  rule 2.
- Prose containing literal unescaped `<something>` markup would fail. That is a genuine finding, not
  a false one.
- This is a **structural** check, not a validator. Duplicate attributes, misnested elements and
  unclosed quotes still pass. Adding a spec parser would cover those, at the cost of a dependency and
  an unknown amount of pre-existing noise — worth revisiting only if that class of bug actually
  bites.

## Alternatives considered

- **Make Vite's existing parse5 warning fatal.** Rejected: it is a warning emitted from inside a
  third-party plugin's pipeline over an intermediate directory (`.11ty-vite/`), with no supported
  hook to escalate it, and it would tie a build gate to Vite's internals.
- **Add parse5 and check every page for parse errors.** Rejected for now on the noise question above
  — a gate is only worth having if it can be zero-tolerance, and nothing establishes that this one
  could be without first measuring the existing error load.
- **Parse with `node-html-parser`, already a dependency.** Rejected: it reports the broken markup as
  a valid `img`. It is the right tool for reading documents and the wrong one for judging them.
- **A source-level lint banning `{#-`/`{%-`/`{{-` inside an open tag.** Rejected: it guards one
  cause rather than the defect, needs its own fragile parse of the template, and would miss the same
  breakage arriving from a filter, an include or a future template language.

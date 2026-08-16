import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Source-level invariant guard (same spirit as entry-point-guards.test.ts).
//
// Lit installs reactive properties as ACCESSORS on the element prototype. A
// TypeScript field declaration for the same name — `slug: string;` — compiles to
// a real class field whenever `useDefineForClassFields` is on, and a class field
// is defined directly on the instance, shadowing the prototype accessor. The
// component still renders once, so nothing looks broken; it just never re-renders
// again. That is exactly how the site shipped inert maps, filters and lightboxes
// after a bundler upgrade flipped the default (see docs/lessons-learned.md).
//
// `declare` is the fix that does not depend on any compiler flag: TypeScript is
// required to erase a `declare` field entirely, so the prototype accessor
// survives. Initialize such properties in the constructor.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const COMPONENTS = join(ROOT, 'src', 'components');

/** Blank out template-literal and string contents so their braces don't skew nesting depth. */
function stripLiterals(line: string): string {
  return line
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

/** Instance field declarations sitting directly in a `extends LitElement` class body. */
function plainClassFields(source: string): string[] {
  const found: string[] = [];
  let inClass = false;
  let depth = 0;
  let inTemplate = false;
  source.split(/\r?\n/).forEach((line, index) => {
    if (/class\s+\w+\s+extends\s+LitElement/.test(line)) {
      inClass = true;
      depth = 0;
    }
    if (!inClass) return;

    const cleaned = stripLiterals(line);
    // A line with an odd number of surviving backticks opens or closes a
    // multi-line template literal (the `css` and `html` tags).
    const backticks = (cleaned.match(/`/g) ?? []).length;
    const bodyLine = !inTemplate;
    if (backticks % 2 === 1) inTemplate = !inTemplate;
    if (!bodyLine) return;

    const opened = depth;
    depth += (cleaned.match(/\{/g) ?? []).length - (cleaned.match(/\}/g) ?? []).length;
    if (
      opened === 1 &&
      /^ {2}(?!declare\b|static\b|constructor\b|get\b|set\b|async\b|#|\/|\*|\})[_a-zA-Z][\w]*\??\s*[:=]/.test(line)
    ) {
      found.push(`${index + 1}: ${line.trim()}`);
    }
    if (depth <= 0 && opened > 0) inClass = false;
  });
  return found;
}

describe('Lit reactive properties are never shadowed by class fields', () => {
  const sources = readdirSync(COMPONENTS)
    .filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))
    .map((name) => ({ name, text: readFileSync(join(COMPONENTS, name), 'utf8') }))
    .filter((f) => /class\s+\w+\s+extends\s+LitElement/.test(f.text));

  it('finds the component sources to check', () => {
    assert.ok(sources.length >= 10, `expected many Lit components, found ${sources.length}`);
  });

  for (const { name, text } of sources) {
    it(`${name} declares every instance field with \`declare\``, () => {
      assert.deepEqual(
        plainClassFields(text),
        [],
        `${name} declares instance fields in the class body. A class field is defined on ` +
          'the instance and shadows the accessor Lit installs for a reactive property, so ' +
          'the component renders once and then never updates again. Write `declare foo: T;` ' +
          'and assign the initial value in the constructor.',
      );
    });
  }

  it('detects a shadowing field, and accepts the `declare` form', () => {
    const bad = 'class X extends LitElement {\n  slug: string;\n  constructor() { super(); }\n}\n';
    const good = 'class X extends LitElement {\n  declare slug: string;\n  constructor() { super(); }\n}\n';
    assert.equal(plainClassFields(bad).length, 1);
    assert.deepEqual(plainClassFields(good), []);
  });

  it('ignores CSS selectors inside a static styles template literal', () => {
    const styled = [
      'class X extends LitElement {',
      '  static styles = css`',
      '    td:last-child { text-align: right; }',
      '    table { width: 100%; }',
      '  `;',
      '  declare slug: string;',
      '}',
    ].join('\n');
    assert.deepEqual(plainClassFields(styled), []);
  });
});

describe('the bundler sees useDefineForClassFields: false', () => {
  // Vite is handed a COPY of the tree as its root, so component files fall outside
  // tsconfig.browser.json's `include` and the nearest tsconfig for them is the root
  // solution file. The option has to be restated there or the bundler picks its own
  // default — which is how the accessors got shadowed in production.
  it('is set in the root tsconfig.json, which is the one bundlers resolve', () => {
    const raw = readFileSync(join(ROOT, 'tsconfig.json'), 'utf8');
    assert.match(
      raw,
      /"useDefineForClassFields"\s*:\s*false/,
      'The root tsconfig.json must set "useDefineForClassFields": false — it is the ' +
        'nearest tsconfig for the copied sources Vite actually compiles.',
    );
  });

  it('is set in tsconfig.browser.json, which typecheck uses', () => {
    const raw = readFileSync(join(ROOT, 'tsconfig.browser.json'), 'utf8');
    assert.match(raw, /"useDefineForClassFields"\s*:\s*false/);
  });
});

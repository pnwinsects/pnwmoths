import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeRegex,
  escapeHtml,
  buildTermMap,
  applyGlossaryTerms,
} from './glossary-transform.js';

// ---------------------------------------------------------------------------
// escapeRegex
// ---------------------------------------------------------------------------
describe('escapeRegex', () => {
  it('escapes + in 1A+2A', () => {
    assert.equal(escapeRegex('1A+2A'), '1A\\+2A');
  });

  it('does not escape hyphen in W-mark (hyphen is not a metachar outside [])', () => {
    assert.equal(escapeRegex('W-mark'), 'W-mark');
  });

  it('escapes period in M1.M3', () => {
    assert.equal(escapeRegex('M1.M3'), 'M1\\.M3');
  });

  it('escapes all 12 metacharacters', () => {
    // Each metacharacter from /[.*+?^${}()|[\]\\]/
    const metacharacters = ['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\'];
    for (const ch of metacharacters) {
      const escaped = escapeRegex(ch);
      assert.ok(escaped.startsWith('\\'), `Expected ${ch} to be escaped, got: ${escaped}`);
    }
  });
});

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------
describe('escapeHtml', () => {
  it('escapes double quotes', () => {
    assert.equal(escapeHtml('the "head"'), 'the &quot;head&quot;');
  });

  it('escapes ampersand', () => {
    assert.equal(escapeHtml('a & b'), 'a &amp; b');
  });

  it('escapes < and >', () => {
    assert.equal(escapeHtml('a<b>c'), 'a&lt;b&gt;c');
  });

  it('escapes ampersand before quotes (order matters: & first)', () => {
    // If & is escaped before ", then &" does not become &amp;quot;
    assert.equal(escapeHtml('"&"'), '&quot;&amp;&quot;');
  });

  it('passes through plain text unchanged', () => {
    assert.equal(escapeHtml('plain text'), 'plain text');
  });
});

// ---------------------------------------------------------------------------
// buildTermMap
// ---------------------------------------------------------------------------
describe('buildTermMap', () => {
  const CDN = 'https://cdn.example';

  it('sorts longest term first', () => {
    const rows = [
      { term: 'wing', definition: 'a wing', image_filename: '' },
      { term: 'forewing', definition: 'the front wing', image_filename: '' },
    ];
    const map = buildTermMap(rows, CDN);
    assert.equal(map[0].term, 'forewing');
    assert.equal(map[1].term, 'wing');
  });

  it('builds imageUrl from cdnBaseUrl and image_filename', () => {
    const rows = [{ term: 'costa', definition: 'leading edge', image_filename: 'costa.jpg' }];
    const map = buildTermMap(rows, CDN);
    assert.equal(map[0].imageUrl, 'https://cdn.example/glossary/costa.jpg');
  });

  it('sets imageUrl to empty string when image_filename is empty', () => {
    const rows = [{ term: 'costa', definition: 'leading edge', image_filename: '' }];
    const map = buildTermMap(rows, CDN);
    assert.equal(map[0].imageUrl, '');
  });

  it('pre-compiles regex with case-insensitive flag', () => {
    const rows = [{ term: 'Forewing', definition: 'front wing', image_filename: '' }];
    const map = buildTermMap(rows, CDN);
    assert.ok(map[0].regex.flags.includes('i'), 'regex should have i flag');
    map[0].regex.lastIndex = 0;
    assert.ok(map[0].regex.test('forewing'), 'should match lowercase');
    map[0].regex.lastIndex = 0;
    assert.ok(map[0].regex.test('FOREWING'), 'should match uppercase');
  });

  it('regex does not match partial words (subcostal should not match costal)', () => {
    const rows = [{ term: 'costal', definition: 'of the costa', image_filename: '' }];
    const map = buildTermMap(rows, CDN);
    map[0].regex.lastIndex = 0;
    assert.ok(!map[0].regex.test('subcostal'), 'costal should not match inside subcostal');
    map[0].regex.lastIndex = 0;
    assert.ok(map[0].regex.test('the costal margin'), 'costal should match as a standalone word');
  });

  it('regex handles metacharacter term 1A+2A', () => {
    const rows = [{ term: '1A+2A', definition: 'fused anal vein', image_filename: '' }];
    const map = buildTermMap(rows, CDN);
    map[0].regex.lastIndex = 0;
    assert.ok(map[0].regex.test('1A+2A'), '1A+2A regex should match literal 1A+2A');
    map[0].regex.lastIndex = 0;
    assert.ok(!map[0].regex.test('1AAAA2A'), 'regex should not match unintended pattern');
  });
});

// ---------------------------------------------------------------------------
// applyGlossaryTerms
// ---------------------------------------------------------------------------
describe('applyGlossaryTerms', () => {
  const CDN = 'https://cdn.example';
  const rows = [
    { term: 'forewing', definition: 'the front wing', image_filename: '' },
    { term: 'wing', definition: 'a wing structure', image_filename: 'wing.jpg' },
    { term: '1A+2A', definition: 'fused anal vein', image_filename: '' },
    { term: 'costal', definition: 'of the costa', image_filename: '' },
  ];
  const termMap = buildTermMap(rows, CDN);

  it('wraps first occurrence only (second occurrence is plain text)', () => {
    const html = '<html><body><main><p>The forewing and forewing again.</p></main></body></html>';
    const result = applyGlossaryTerms(html, termMap);
    const abbrCount = (result.match(/<abbr/g) || []).length;
    assert.equal(abbrCount, 1, 'should have exactly one abbr element');
    assert.ok(result.includes('<abbr class="glossary-term"'), 'abbr should have glossary-term class');
  });

  it('wraps longer term (forewing) before shorter term (wing)', () => {
    const html = '<html><body><main><p>The forewing is visible.</p></main></body></html>';
    const result = applyGlossaryTerms(html, termMap);
    // forewing should be wrapped, wing inside forewing should NOT be separately wrapped
    const abbrCount = (result.match(/<abbr/g) || []).length;
    assert.equal(abbrCount, 1, 'only one abbr should appear');
    assert.ok(result.includes('>forewing<'), 'forewing content should be inside abbr');
  });

  it('wraps metacharacter term 1A+2A', () => {
    const html = '<html><body><main><p>The vein 1A+2A is fused.</p></main></body></html>';
    const result = applyGlossaryTerms(html, termMap);
    assert.ok(result.includes('>1A+2A<'), '1A+2A should be wrapped');
    assert.ok(result.includes('<abbr class="glossary-term"'), 'should use correct class');
  });

  it('does not match costal inside subcostal', () => {
    const html = '<html><body><main><p>the subcostal region</p></main></body></html>';
    const result = applyGlossaryTerms(html, termMap);
    assert.ok(!result.includes('<abbr'), 'subcostal should not produce an abbr element');
  });

  it('abbr has title, data-definition, and data-image-url attributes', () => {
    const html = '<html><body><main><p>The forewing.</p></main></body></html>';
    const result = applyGlossaryTerms(html, termMap);
    assert.ok(result.includes('title="the front wing"'), 'title attribute required');
    assert.ok(result.includes('data-definition="the front wing"'), 'data-definition required');
    assert.ok(result.includes('data-image-url=""'), 'data-image-url should be empty string when no image');
  });

  it('data-image-url contains CDN URL when image_filename is set', () => {
    const html = '<html><body><main><p>The wing structure.</p></main></body></html>';
    const result = applyGlossaryTerms(html, termMap);
    assert.ok(
      result.includes('data-image-url="https://cdn.example/glossary/wing.jpg"'),
      'data-image-url should contain CDN URL'
    );
  });

  it('escapes double quotes in definition attribute values', () => {
    const quotedRows = [{ term: 'head', definition: 'the "head" end', image_filename: '' }];
    const quotedMap = buildTermMap(quotedRows, CDN);
    const html = '<html><body><main><p>The head is visible.</p></main></body></html>';
    const result = applyGlossaryTerms(html, quotedMap);
    assert.ok(
      result.includes('title="the &quot;head&quot; end"'),
      'double quotes in definition must be escaped as &quot;'
    );
  });

  it('seen Set is per-invocation: two calls on same HTML each produce a wrap', () => {
    const html = '<html><body><main><p>The forewing is present.</p></main></body></html>';
    const result1 = applyGlossaryTerms(html, termMap);
    const result2 = applyGlossaryTerms(html, termMap);
    assert.ok(result1.includes('<abbr'), 'first call should wrap');
    assert.ok(result2.includes('<abbr'), 'second call should also wrap (fresh seen Set)');
  });

  it('does not transform content outside main (header, footer, nav)', () => {
    const html = '<html><body><header><p>The forewing.</p></header><main><p>body</p></main></body></html>';
    const result = applyGlossaryTerms(html, termMap);
    // abbr may appear inside main>p but not in header>p
    assert.ok(!result.includes('<header><p>The <abbr'), 'forewing in header should not be wrapped');
  });

  it('two distinct terms in the same text node: positionally-first is wrapped, not the longer one', () => {
    // "forewing" appears at index ~4, "outer margin" appears at index ~22.
    // longest-first order puts "outer margin" (12 chars) before "forewing" (8 chars).
    // The fixed substituteTerms() must select "forewing" (min match.index = 4).
    const multiRows = [
      { term: 'forewing', definition: 'the front wing', image_filename: '' },
      { term: 'outer margin', definition: 'the outer edge', image_filename: '' },
    ];
    const multiMap = buildTermMap(multiRows, CDN);
    // Confirm longest-first sort: "outer margin" (12) sorts before "forewing" (8)
    assert.equal(multiMap[0].term, 'outer margin', 'outer margin should sort first (longest)');
    assert.equal(multiMap[1].term, 'forewing', 'forewing should sort second (shorter)');

    const html = '<html><body><main><p>The forewing and outer margin are visible.</p></main></body></html>';
    const result = applyGlossaryTerms(html, multiMap);

    // "forewing" appears at a lower character index than "outer margin",
    // so it must be wrapped first regardless of the termMap sort order.
    assert.ok(
      result.includes('>forewing<'),
      'forewing must be wrapped (positionally first in the text node)'
    );
    // Both terms are in the same text node; the while-loop wraps both in one pass.
    assert.ok(
      result.includes('>outer margin<'),
      'outer margin must also be wrapped (on subsequent element pass)'
    );
    // Verify both are wrapped as abbr elements
    const abbrCount = (result.match(/<abbr/g) || []).length;
    assert.equal(abbrCount, 2, 'both terms must be wrapped — exactly 2 abbr elements');
  });
});

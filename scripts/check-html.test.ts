import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findBadTags, maskRawText } from './check-html.ts';

describe('findBadTags catches the bug it exists for', () => {
  // The literal shape /plates/ shipped for months: a Nunjucks `{#-` inside the
  // open tag ate the newline after `<img`, so 98 cards rendered as an element
  // named `imgsrc` and no thumbnail appeared.
  const broken = '<li><a href="/plates/x/">\n  <imgsrc="https://cdn/x.webp"\n    alt="" width="240">\n</a></li>';

  it('reports the fused tag name', () => {
    const found = findBadTags('plates/index.html', broken);
    assert.equal(found.length, 1);
    assert.equal(found[0]?.tagName, 'imgsrc');
    assert.equal(found[0]?.reason, 'malformed-start-tag');
  });

  it('reports the line the tag is on, not the line the file starts on', () => {
    assert.equal(findBadTags('f.html', broken)[0]?.line, 2);
  });

  it('passes the same markup once the separator is back', () => {
    const fixed = broken.replace('<imgsrc=', '<img src=');
    assert.deepEqual(findBadTags('plates/index.html', fixed), []);
  });
});

describe('findBadTags accepts well-formed markup', () => {
  it('accepts standard elements with and without attributes', () => {
    const html = '<html><head><title>t</title></head><body><main id="m"><p>hi</p><br/><hr></main></body></html>';
    assert.deepEqual(findBadTags('f.html', html), []);
  });

  it('accepts the project\'s custom elements', () => {
    const html = '<pnwm-occurrence-map slug="x"></pnwm-occurrence-map><pnwm-identify></pnwm-identify>';
    assert.deepEqual(findBadTags('f.html', html), []);
  });

  it('accepts a tag broken across lines, which is how these templates are written', () => {
    assert.deepEqual(findBadTags('f.html', '<img\n  src="a.webp"\n  alt="">'), []);
  });

  it('accepts closing tags', () => {
    assert.deepEqual(findBadTags('f.html', '<div><span>x</span></div>'), []);
  });
});

describe('findBadTags rejects names that are not elements', () => {
  it('rejects an invented element name', () => {
    const found = findBadTags('f.html', '<pinput type="text">');
    assert.equal(found[0]?.reason, 'unknown-element');
    assert.equal(found[0]?.tagName, 'pinput');
  });

  it('rejects a fused name even when no attribute value follows', () => {
    // `<img\n{#- … -#}\nhidden` collapses to `<imghidden` — a bare name, so the
    // "what follows the name" rule cannot see it. The element list is what does.
    const found = findBadTags('f.html', '<imghidden>');
    assert.equal(found[0]?.reason, 'unknown-element');
  });

  it('rejects a deprecated element rather than quietly allowing it', () => {
    assert.equal(findBadTags('f.html', '<center>x</center>')[0]?.reason, 'unknown-element');
  });

  it('does not mistake a single-word name for a custom element', () => {
    assert.equal(findBadTags('f.html', '<mycomponent>')[0]?.reason, 'unknown-element');
    assert.deepEqual(findBadTags('f.html', '<my-component>'), []);
  });
});

describe('maskRawText keeps non-markup out of the scan', () => {
  it('blanks script bodies, so `a<bfoo` in JavaScript is not a tag', () => {
    assert.deepEqual(findBadTags('f.html', '<script>if (a<bfoo) {}</script>'), []);
  });

  it('blanks style bodies', () => {
    assert.deepEqual(findBadTags('f.html', '<style>.a{content:"<xyz="}</style>'), []);
  });

  it('blanks comments', () => {
    assert.deepEqual(findBadTags('f.html', '<!-- <imgsrc="x"> -->'), []);
  });

  it('preserves length and line count so offsets still line up', () => {
    const html = '<p>a</p>\n<script>\nvar x = 1;\n</script>\n<imgsrc="x">';
    assert.equal(maskRawText(html).length, html.length);
    assert.equal(maskRawText(html).split('\n').length, html.split('\n').length);
    assert.equal(findBadTags('f.html', html)[0]?.line, 5);
  });

  it('still scans markup that follows a masked region', () => {
    assert.equal(findBadTags('f.html', '<script>x</script><imgsrc="y">').length, 1);
  });
});

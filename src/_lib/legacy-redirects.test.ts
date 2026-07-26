// Tests for the shared legacy-URL resolver (#181). This module is the single
// implementation behind both src/redirect.njk (browser) and scripts/fetch-analytics.ts
// (nightly CDN-log classification), so the `matched` flag is load-bearing twice over:
// it decides what the visitor sees *and* what shows up on /analytics/ as a backlog item.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  resolveLegacyPath,
  normalizeLegacyPath,
  stripQueryAndHash,
  STATIC_MAP,
  REDIRECT_PAGE_PATH,
  REDIRECT_FROM_PARAM,
} from './legacy-redirects.ts';

const SLUGS = new Set(['acronicta-americana', 'globia-subflava']);

describe('stripQueryAndHash', () => {
  test('drops a query string', () => {
    assert.equal(stripQueryAndHash('/browse/foo/?utm_source=x'), '/browse/foo/');
  });

  test('drops a fragment', () => {
    assert.equal(stripQueryAndHash('/browse/foo/#images'), '/browse/foo/');
  });

  test('leaves a clean path untouched', () => {
    assert.equal(stripQueryAndHash('/browse/foo/'), '/browse/foo/');
  });
});

describe('normalizeLegacyPath', () => {
  test('adds leading and trailing slashes', () => {
    assert.equal(normalizeLegacyPath('browse/foo'), '/browse/foo/');
  });

  test('trims surrounding whitespace', () => {
    assert.equal(normalizeLegacyPath('  /browse/foo/  '), '/browse/foo/');
  });

  test('strips query strings so one legacy page groups as one entry', () => {
    assert.equal(normalizeLegacyPath('/browse/foo?utm_source=newsletter'), '/browse/foo/');
  });

  test('maps an empty path to root', () => {
    assert.equal(normalizeLegacyPath(''), '/');
  });
});

describe('resolveLegacyPath: matched cases', () => {
  test('maps a known static page', () => {
    assert.deepEqual(resolveLegacyPath('/about-moths/glossary/', SLUGS), {
      target: 'glossary/index.html',
      matched: true,
    });
  });

  test('maps a static page carrying a query string', () => {
    assert.deepEqual(resolveLegacyPath('/gsearch/?q=moth', SLUGS), {
      target: 'search/index.html',
      matched: true,
    });
  });

  test('maps a published species slug to its factsheet', () => {
    assert.deepEqual(resolveLegacyPath('/browse/acronicta-americana/', SLUGS), {
      target: 'species/acronicta-americana/index.html',
      matched: true,
    });
  });

  test('normalizes underscores and case in a species segment', () => {
    assert.deepEqual(resolveLegacyPath('/browse/Acronicta_Americana/', SLUGS), {
      target: 'species/acronicta-americana/index.html',
      matched: true,
    });
  });

  test('sends family/subfamily/tribe segments to browse as an intended outcome', () => {
    for (const segment of ['family-noctuidae', 'subfamily-noctuinae', 'tribe-noctuini']) {
      assert.deepEqual(resolveLegacyPath(`/browse/${segment}/`, SLUGS), {
        target: 'browse/index.html',
        matched: true,
      });
    }
  });

  test('sends a bare genus segment to browse as an intended outcome', () => {
    assert.deepEqual(resolveLegacyPath('/browse/acronicta/', SLUGS), {
      target: 'browse/index.html',
      matched: true,
    });
  });

  test('collapses any photographic plate id to the plates index', () => {
    assert.deepEqual(resolveLegacyPath('/photographic-plates/42/', SLUGS), {
      target: 'plates/index.html',
      matched: true,
    });
  });

  test('maps the legacy homepage', () => {
    assert.deepEqual(resolveLegacyPath('/', SLUGS), { target: 'index.html', matched: true });
  });
});

describe('resolveLegacyPath: reported misses', () => {
  test('an unpublished species-looking slug is a miss', () => {
    assert.deepEqual(resolveLegacyPath('/browse/xestia-notaspecies/', SLUGS), {
      target: 'browse/index.html',
      matched: false,
    });
  });

  test('an unknown top-level path falls back to home and is a miss', () => {
    assert.deepEqual(resolveLegacyPath('/some/unknown/django/view/', SLUGS), {
      target: 'index.html',
      matched: false,
    });
  });

  test('misses still return a usable target so the visitor is never stranded', () => {
    const { target } = resolveLegacyPath('/some/unknown/view/', SLUGS);
    assert.ok(target.endsWith('index.html'));
  });
});

describe('redirect.njk wiring', () => {
  const template = readFileSync(resolve('src/redirect.njk'), 'utf8');

  test('imports the shared resolver instead of carrying its own copy', () => {
    assert.match(
      template,
      /import\s*\{[^}]*resolveLegacyPath[^}]*\}\s*from\s*'\.\/_lib\/legacy-redirects\.ts'/,
      'src/redirect.njk must import src/_lib/legacy-redirects.ts — a second inline copy of the '
        + 'resolver would drift from the one scripts/fetch-analytics.ts replays over the CDN logs',
    );
  });

  test('no longer defines its own mapping tables', () => {
    assert.doesNotMatch(template, /const STATIC_MAP\s*=/);
    assert.doesNotMatch(template, /const SYNONYMS\s*=/);
  });

  test('reads the same ?from= parameter name the analytics job parses', () => {
    assert.equal(REDIRECT_FROM_PARAM, 'from');
    assert.match(template, /params\.get\(REDIRECT_FROM_PARAM\)/);
  });

  test('is served from the path the analytics job looks for', () => {
    assert.match(template, new RegExp(`permalink:\\s*${REDIRECT_PAGE_PATH}`));
  });

  test('every STATIC_MAP target is site-relative (BASE is prepended at navigation time)', () => {
    for (const [from, target] of Object.entries(STATIC_MAP)) {
      assert.ok(!target.startsWith('/'), `${from} -> ${target} must not start with "/"`);
      assert.ok(target.endsWith('.html'), `${from} -> ${target} must name an explicit .html file`);
    }
  });
});

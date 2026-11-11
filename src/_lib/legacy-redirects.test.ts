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
  slugsWithoutPages,
  normalizeLegacyPath,
  stripQueryAndHash,
  stripUnexpandedPlaceholder,
  STATIC_MAP,
  REDIRECT_PAGE_PATH,
  REDIRECT_FROM_PARAM,
} from './legacy-redirects.ts';

const SLUGS = new Set(['acronicta-americana', 'globia-subflava', 'aseptis-sp-no-1']);
// aseptis-sp-no-1 is in the catalogue but has no page (on the unpublished list).
const NO_PAGES = new Set(['aseptis-sp-no-1']);

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

describe('stripUnexpandedPlaceholder', () => {
  test('strips a literal {REQUEST_URI} left by the legacy rewrite rule', () => {
    assert.equal(
      stripUnexpandedPlaceholder('{REQUEST_URI}browse/acronicta/acronicta-americana/'),
      'browse/acronicta/acronicta-americana/',
    );
  });

  test('strips the ${...} and %{...} spellings', () => {
    assert.equal(stripUnexpandedPlaceholder('${REQUEST_URI}browse/foo/'), 'browse/foo/');
    assert.equal(stripUnexpandedPlaceholder('%{REQUEST_URI}browse/foo/'), 'browse/foo/');
  });

  test('strips a percent-encoded placeholder that nothing decoded', () => {
    assert.equal(stripUnexpandedPlaceholder('%7BREQUEST_URI%7Dbrowse/foo/'), 'browse/foo/');
  });

  test('strips repeated placeholders', () => {
    assert.equal(stripUnexpandedPlaceholder('{REQUEST_URI}{REQUEST_URI}browse/foo/'), 'browse/foo/');
  });

  test('leaves a normal path untouched', () => {
    assert.equal(stripUnexpandedPlaceholder('/browse/foo/'), '/browse/foo/');
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
    assert.deepEqual(resolveLegacyPath('/about-moths/glossary/', SLUGS, NO_PAGES), {
      target: 'glossary/index.html',
      matched: true,
    });
  });

  test('maps a static page carrying a query string', () => {
    assert.deepEqual(resolveLegacyPath('/gsearch/?q=moth', SLUGS, NO_PAGES), {
      target: 'search/index.html',
      matched: true,
    });
  });

  test('maps a published species slug to its factsheet', () => {
    assert.deepEqual(resolveLegacyPath('/browse/acronicta-americana/', SLUGS, NO_PAGES), {
      target: 'species/acronicta-americana/index.html',
      matched: true,
    });
  });

  test('normalizes underscores and case in a species segment', () => {
    assert.deepEqual(resolveLegacyPath('/browse/Acronicta_Americana/', SLUGS, NO_PAGES), {
      target: 'species/acronicta-americana/index.html',
      matched: true,
    });
  });

  test('sends family/subfamily/tribe segments to browse as an intended outcome', () => {
    for (const segment of ['family-noctuidae', 'subfamily-noctuinae', 'tribe-noctuini']) {
      assert.deepEqual(resolveLegacyPath(`/browse/${segment}/`, SLUGS, NO_PAGES), {
        target: 'browse/index.html',
        matched: true,
      });
    }
  });

  test('sends a bare genus segment to browse as an intended outcome', () => {
    assert.deepEqual(resolveLegacyPath('/browse/acronicta/', SLUGS, NO_PAGES), {
      target: 'browse/index.html',
      matched: true,
    });
  });

  test('collapses any photographic plate id to the plates index', () => {
    assert.deepEqual(resolveLegacyPath('/photographic-plates/42/', SLUGS, NO_PAGES), {
      target: 'plates/index.html',
      matched: true,
    });
  });

  test('maps the legacy homepage', () => {
    assert.deepEqual(resolveLegacyPath('/', SLUGS, NO_PAGES), { target: 'index.html', matched: true });
  });

  test('resolves a link whose {REQUEST_URI} the legacy site never expanded', () => {
    assert.deepEqual(
      resolveLegacyPath(
        '{REQUEST_URI}browse/family-notuidae/subfamily-acronictinae/acronicta/acronicta-americana/',
        SLUGS,
        NO_PAGES,
      ),
      { target: 'species/acronicta-americana/index.html', matched: true },
    );
  });

  test('a bare unexpanded placeholder falls back to the homepage as matched', () => {
    assert.deepEqual(resolveLegacyPath('{REQUEST_URI}', SLUGS, NO_PAGES), {
      target: 'index.html',
      matched: true,
    });
  });
});

describe('resolveLegacyPath: species without a page (#271)', () => {
  test('sends a link to an unpublished or withheld species to Browse, not to a 404', () => {
    assert.deepEqual(resolveLegacyPath('/browse/family-noctuidae/aseptis-sp-no-1/', SLUGS, NO_PAGES), {
      target: 'browse/index.html',
      matched: true,
    });
  });

  test('applies after normalising underscores and case', () => {
    assert.deepEqual(resolveLegacyPath('/browse/Aseptis_sp_no_1/', SLUGS, NO_PAGES), {
      target: 'browse/index.html',
      matched: true,
    });
  });

  test('leaves species with pages alone', () => {
    assert.deepEqual(resolveLegacyPath('/browse/acronicta-americana/', SLUGS, NO_PAGES), {
      target: 'species/acronicta-americana/index.html',
      matched: true,
    });
  });
});

describe('slugsWithoutPages', () => {
  test('returns catalogue slugs the build did not publish, sorted', () => {
    assert.deepEqual(
      slugsWithoutPages(['b-two', 'a-one', 'c-three'], ['a-one']),
      ['b-two', 'c-three'],
    );
  });
});

describe('resolveLegacyPath: reported misses', () => {
  test('an unpublished species-looking slug is a miss', () => {
    assert.deepEqual(resolveLegacyPath('/browse/xestia-notaspecies/', SLUGS, NO_PAGES), {
      target: 'browse/index.html',
      matched: false,
    });
  });

  test('an unknown top-level path falls back to home and is a miss', () => {
    assert.deepEqual(resolveLegacyPath('/some/unknown/django/view/', SLUGS, NO_PAGES), {
      target: 'index.html',
      matched: false,
    });
  });

  test('misses still return a usable target so the visitor is never stranded', () => {
    const { target } = resolveLegacyPath('/some/unknown/view/', SLUGS, NO_PAGES);
    assert.ok(target.endsWith('index.html'));
  });
});

describe('redirect.njk wiring', () => {
  const template = readFileSync(resolve('src/redirect.njk'), 'utf8');
  // The page's logic, a Vite entry of its own since ADR 0049.
  const script = readFileSync(resolve('src/components/legacy-redirect.ts'), 'utf8');

  test('the page embeds the species without pages, computed from the published species', () => {
    assert.match(template, /id="species-without-pages">\{\{ speciesSlugs \| slugsWithoutPages\(species\)/);
    assert.match(script, /resolveLegacyPath\(fromPath, SPECIES_SLUGS, SPECIES_WITHOUT_PAGES\)/);
  });

  test('the page loads the legacy-redirect entry', () => {
    assert.match(template, /\{% viteEntry "src\/components\/legacy-redirect\.ts" %\}/);
  });

  test('imports the shared resolver instead of carrying its own copy', () => {
    assert.match(
      script,
      /import\s*\{[^}]*resolveLegacyPath[^}]*\}\s*from\s*'\.\.\/_lib\/legacy-redirects\.ts'/,
      'src/components/legacy-redirect.ts must import src/_lib/legacy-redirects.ts — a second copy of the '
        + 'resolver would drift from the one scripts/fetch-analytics.ts replays over the CDN logs',
    );
  });

  test('no longer defines its own mapping tables', () => {
    for (const source of [template, script]) {
      assert.doesNotMatch(source, /const STATIC_MAP\s*=/);
      assert.doesNotMatch(source, /const SYNONYMS\s*=/);
    }
  });

  test('reads the same ?from= parameter name the analytics job parses', () => {
    assert.equal(REDIRECT_FROM_PARAM, 'from');
    assert.match(script, /params\.get\(REDIRECT_FROM_PARAM\)/);
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

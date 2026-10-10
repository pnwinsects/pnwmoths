import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isScannerProbe,
  isBrowserDefault,
  isBuildAsset,
  isLegacyMappingCandidate,
  isNoise404,
} from './request-noise.ts';
import { STATIC_MAP } from './legacy-redirects.ts';

// The exact 25 rows the /analytics/ miss queue displayed for the 30 days to
// 2026-10-09 — every row it had. Not one is a legacy URL needing a mapping.
// Keys carry the trailing slash normalizeLegacyPath() adds.
const OBSERVED_MISSES = [
  '/robots.txt/', '/favicon.ico/', '/wp/', '/media/images/favicon.ico/',
  '/wordpress/', '/.env/', '/.env.local/', '/.env.development/',
  '/.env.production/', '/wp/wp-json/batch/v1/', '/wordpress/wp-json/batch/v1/',
  '/blog/', '/wp-admin/admin-ajax.php/', '/apple-touch-icon.png/',
  '/.env.staging/', '/apple-touch-icon-precomposed.png/',
  '/blog/wp-json/batch/v1/', '/wp/index.php/', '/.env.backup/',
  '/wordpress/index.php/', '/wp-login.php/', '/.env.bak/', '/blog/index.php/',
  '/assets/redirect-Cwg5P0BB.js/', '/assets/modulepreload-polyfill-P2Xu9kJm.js/',
];

describe('the queue that prompted this module', () => {
  test('excludes every row the live miss queue was showing', () => {
    const kept = OBSERVED_MISSES.filter(isLegacyMappingCandidate);
    assert.deepEqual(kept, [], 'these 25 rows are the entire visible queue; none is actionable');
  });

  test('keeps every real legacy path the resolver knows about', () => {
    // If any of these were filtered, a genuine mapping gap would go unreported —
    // the exact failure this module is meant to fix, inverted.
    for (const legacy of Object.keys(STATIC_MAP)) {
      assert.equal(isLegacyMappingCandidate(legacy), true, `${legacy} must stay in the queue`);
    }
  });

  test('keeps plausible legacy species and browse URLs', () => {
    for (const p of [
      '/browse/acronicta-americana/',
      '/species/xestia-unknown/',
      '/browse-all/noctuidae/',
      '/explore-data/records/',
      '/photographic-plates/plate-12/',
      '/about-moths/glossary/',
    ]) {
      assert.equal(isLegacyMappingCandidate(p), true, `${p} must stay in the queue`);
    }
  });
});

describe('isScannerProbe', () => {
  test('matches PHP, which neither the legacy nor the current site has ever served', () => {
    assert.equal(isScannerProbe('/index.php'), true);
    assert.equal(isScannerProbe('/xmlrpc.php'), true);
    assert.equal(isScannerProbe('/wp-login.php/'), true);
  });

  test('matches .env at any depth and in every suffixed variant', () => {
    for (const p of ['/.env', '/.env/', '/.env.production/', '/api/.env', '/app/.env.bak/']) {
      assert.equal(isScannerProbe(p), true, p);
    }
  });

  test('matches VCS and tooling directories', () => {
    assert.equal(isScannerProbe('/.git/config'), true);
    assert.equal(isScannerProbe('/.aws/credentials'), true);
  });

  test('matches CMS locator probes', () => {
    for (const p of ['/wp/', '/wordpress/', '/blog/', '/wp-admin/admin-ajax.php/']) {
      assert.equal(isScannerProbe(p), true, p);
    }
  });

  test('does not match species slugs that merely contain a probe word', () => {
    // A substring match here would quietly delete real work from the queue.
    for (const p of [
      '/species/wplike-moth/',
      '/browse/blogia-fictus/',
      '/species/enviable-moth/',
      '/browse/philodoria-php-like/',
    ]) {
      assert.equal(isScannerProbe(p), false, p);
    }
  });

  test('is case-insensitive', () => {
    assert.equal(isScannerProbe('/WP-Login.PHP'), true);
    assert.equal(isScannerProbe('/.ENV.Production/'), true);
  });
});

describe('isBrowserDefault', () => {
  test('matches the files browsers and crawlers fetch unprompted', () => {
    for (const p of [
      '/robots.txt', '/robots.txt/', '/sitemap.xml', '/favicon.ico',
      '/favicon.png', '/apple-touch-icon.png', '/apple-touch-icon-precomposed.png',
      '/.well-known/traffic-advice', '/site.webmanifest',
    ]) {
      assert.equal(isBrowserDefault(p), true, p);
    }
  });

  test('matches an icon at any depth, as a page can declare one anywhere', () => {
    // The legacy Django site served its favicon from /media/, and pages elsewhere
    // still link to it — this was the one row the first draft of this module let
    // through into the queue.
    assert.equal(isBrowserDefault('/media/images/favicon.ico/'), true);
    assert.equal(isBrowserDefault('/static/apple-touch-icon.png'), true);
  });

  test('does not match a page that merely sits at a similar path', () => {
    assert.equal(isBrowserDefault('/species/robots-txt/'), false);
    assert.equal(isBrowserDefault('/images/favicon-guide/'), false);
  });
});

describe('isBuildAsset', () => {
  test('matches our own emitted bundles', () => {
    assert.equal(isBuildAsset('/assets/redirect-Cwg5P0BB.js/'), true);
    assert.equal(isBuildAsset('/pagefind/pagefind.js'), true);
    assert.equal(isBuildAsset('/_lib/legacy-redirects.js'), true);
  });
});

describe('isNoise404', () => {
  // The distinction that keeps this change from deleting its own evidence.
  test('hides scanner probes', () => {
    assert.equal(isNoise404('/.env.production'), true);
    assert.equal(isNoise404('/wp-login.php'), true);
  });

  test('keeps a 404 on a browser default visible, because that is a real gap', () => {
    // 6,222 404s on this path in 30 days is how the missing robots.txt was found.
    // Filtering it from the 404 list would have hidden the finding that prompted
    // this whole change.
    assert.equal(isNoise404('/robots.txt'), false);
    assert.equal(isNoise404('/apple-touch-icon.png'), false);
    assert.equal(isNoise404('/sitemap.xml'), false);
  });

  test('keeps ordinary missing pages visible', () => {
    assert.equal(isNoise404('/species/typo-slug/'), false);
  });
});

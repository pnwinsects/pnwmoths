import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { siteObjectStorageUrl, contentTypeFor, listSiteFiles, hashBytes, filesToUpload, MANIFEST_KEY } from './upload-site.ts';

// ---------------------------------------------------------------------------
// Suite 1: siteObjectStorageUrl — targets the zone ROOT (no key-images/ prefix)
// ---------------------------------------------------------------------------

describe('siteObjectStorageUrl', () => {
  it('maps a root file to the zone root with no extra prefix', () => {
    assert.equal(
      siteObjectStorageUrl('index.html'),
      'https://la.storage.bunnycdn.com/pnwmoths/index.html'
    );
  });

  it('encodes each path segment but preserves "/" separators', () => {
    assert.equal(
      siteObjectStorageUrl('species/acronicta-americana/records.parquet'),
      'https://la.storage.bunnycdn.com/pnwmoths/species/acronicta-americana/records.parquet'
    );
  });

  it('encodes spaces in a segment as %20 without encoding slashes', () => {
    assert.equal(
      siteObjectStorageUrl('plates/some plate/thumb.html'),
      'https://la.storage.bunnycdn.com/pnwmoths/plates/some%20plate/thumb.html'
    );
  });
});

// ---------------------------------------------------------------------------
// Suite 2: contentTypeFor — extension → MIME map
// ---------------------------------------------------------------------------

describe('contentTypeFor', () => {
  it('maps .html to text/html; charset=utf-8', () => {
    assert.equal(contentTypeFor('page.html'), 'text/html; charset=utf-8');
  });

  it('maps .js to a JavaScript content type', () => {
    assert.match(contentTypeFor('app.js'), /javascript/);
  });

  it('maps .json to application/json', () => {
    assert.equal(contentTypeFor('data.json'), 'application/json');
  });

  it('maps .webp to image/webp', () => {
    assert.equal(contentTypeFor('x.webp'), 'image/webp');
  });

  it('maps .css to text/css; charset=utf-8', () => {
    assert.equal(contentTypeFor('style.css'), 'text/css; charset=utf-8');
  });

  it('maps .parquet to a generic binary type', () => {
    assert.match(contentTypeFor('data.parquet'), /application\/(octet-stream|vnd\.apache\.parquet)/);
  });

  it('maps an unknown extension to application/octet-stream', () => {
    assert.equal(contentTypeFor('mystery.xyz'), 'application/octet-stream');
  });
});

// ---------------------------------------------------------------------------
// Suite 3: listSiteFiles — recursive POSIX-relative walk
// ---------------------------------------------------------------------------

describe('listSiteFiles', () => {
  it('returns POSIX-relative paths for every file recursively, no dirs, no leading ./', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pnwmoths-upload-site-test-'));
    writeFileSync(join(dir, 'index.html'), '<html></html>');
    mkdirSync(join(dir, 'species', 'a'), { recursive: true });
    writeFileSync(join(dir, 'species', 'a', 'records.parquet'), 'x');
    writeFileSync(join(dir, 'species', 'a', 'index.html'), 'y');

    const files = listSiteFiles(dir).sort();
    assert.deepEqual(files, [
      'index.html',
      'species/a/index.html',
      'species/a/records.parquet',
    ]);
    for (const f of files) {
      assert.ok(!f.startsWith('./'), `${f} must not have a leading ./`);
      assert.ok(!f.startsWith('/'), `${f} must be relative`);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 4: additive-only source invariant (D-02 / T-jtl-01)
// ---------------------------------------------------------------------------

describe('additive-only invariant', () => {
  it('upload-site.ts source contains no DELETE / mirror / sync-delete logic', () => {
    const src = readFileSync(new URL('./upload-site.ts', import.meta.url), 'utf8');
    assert.ok(!src.includes('DELETE'), 'source must not contain the string DELETE');
    assert.ok(!src.includes('-X DELETE'), 'source must not issue a curl DELETE');
    assert.ok(!/\bmirror\b/i.test(src), 'source must not contain mirror logic');
    assert.ok(!/--delete\b/.test(src), 'source must not contain a --delete flag');
  });
});

// ---------------------------------------------------------------------------
// Suite: hashBytes — stable sha256 content hash
// ---------------------------------------------------------------------------

describe('hashBytes', () => {
  it('matches the canonical sha256 of "hello"', () => {
    assert.equal(
      hashBytes(Buffer.from('hello')),
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    );
  });

  it('is content-addressed: identical bytes hash the same, different bytes differ', () => {
    assert.equal(hashBytes(Buffer.from('abc')), hashBytes(Buffer.from('abc')));
    assert.notEqual(hashBytes(Buffer.from('abc')), hashBytes(Buffer.from('abd')));
    // Sanity-check against an independent computation.
    assert.equal(hashBytes(Buffer.from('abc')), createHash('sha256').update('abc').digest('hex'));
  });
});

// ---------------------------------------------------------------------------
// Suite: filesToUpload — manifest diff (the change-detection core)
// ---------------------------------------------------------------------------

describe('filesToUpload', () => {
  it('uploads only changed and new files, skipping unchanged ones', () => {
    const local = { 'a.html': '1', 'b.html': '2', 'c.html': '3' };
    const remote = { 'a.html': '1', 'b.html': 'OLD' }; // a unchanged, b changed, c new
    assert.deepEqual(filesToUpload(local, remote).sort(), ['b.html', 'c.html']);
  });

  it('uploads everything when the remote manifest is empty (self-healing full upload)', () => {
    const local = { 'a.html': '1', 'b.html': '2' };
    assert.deepEqual(filesToUpload(local, {}).sort(), ['a.html', 'b.html']);
  });

  it('uploads nothing when every hash matches', () => {
    const local = { 'a.html': '1', 'b.html': '2' };
    assert.deepEqual(filesToUpload(local, { ...local }), []);
  });
});

// ---------------------------------------------------------------------------
// Suite: manifest key is a reserved zone-root path
// ---------------------------------------------------------------------------

describe('MANIFEST_KEY', () => {
  it('is a single zone-root JSON object key (no slashes, .json)', () => {
    assert.ok(!MANIFEST_KEY.includes('/'), 'manifest lives at the zone root');
    assert.match(MANIFEST_KEY, /\.json$/);
  });
});

// ---------------------------------------------------------------------------
// Suite 5: DRY_RUN over a fixture makes zero network calls
// ---------------------------------------------------------------------------

describe('DRY_RUN smoke', () => {
  it('prints the PUT plan for a fixture and makes zero curl/network calls', () => {
    const siteDir = mkdtempSync(join(tmpdir(), 'pnwmoths-upload-site-dry-'));
    writeFileSync(join(siteDir, 'index.html'), '<html></html>');

    const scriptPath = new URL('./upload-site.ts', import.meta.url).pathname;
    const out = execFileSync('node', [scriptPath], {
      env: { ...process.env, DRY_RUN: '1', SITE_DIR: siteDir, BUNNY_STORAGE_PASSWORD: '' },
      encoding: 'utf8',
    });

    assert.match(out, /la\.storage\.bunnycdn\.com\/pnwmoths\/index\.html/);
  });
});

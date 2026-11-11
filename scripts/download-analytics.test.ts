import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  analyticsListUrl, analyticsFileUrl, STORAGE_PREFIX,
  syncAnalytics, isComplete, downloadedCount, renderReport, type RemoteFile,
} from './download-analytics.ts';

// ---------------------------------------------------------------------------
// analyticsListUrl
// ---------------------------------------------------------------------------

describe('analyticsListUrl', () => {
  it('builds correct list URL with trailing slash', () => {
    const url = analyticsListUrl();
    assert.equal(url, 'https://la.storage.bunnycdn.com/pnwmoths/_analytics/');
  });
});

// ---------------------------------------------------------------------------
// analyticsFileUrl
// ---------------------------------------------------------------------------

describe('analyticsFileUrl', () => {
  it('builds correct file download URL', () => {
    const url = analyticsFileUrl('2026-06-29.json');
    assert.equal(url, 'https://la.storage.bunnycdn.com/pnwmoths/_analytics/2026-06-29.json');
  });

  it('encodes special characters', () => {
    const url = analyticsFileUrl('file name.json');
    assert.ok(url.includes('file%20name.json'));
  });
});

// ---------------------------------------------------------------------------
// STORAGE_PREFIX
// ---------------------------------------------------------------------------

describe('STORAGE_PREFIX', () => {
  it('matches upload-analytics prefix', () => {
    assert.equal(STORAGE_PREFIX, '_analytics');
  });
});

// ---------------------------------------------------------------------------
// syncAnalytics — only new or changed files are downloaded, and a failure
// leaves the build going with whatever is on disk (issue #450)
// ---------------------------------------------------------------------------

const sha = (s: string): string => createHash('sha256').update(s).digest('hex').toUpperCase();

function remote(name: string, content: string, withChecksum = true): RemoteFile {
  return { name, length: Buffer.byteLength(content), checksum: withChecksum ? sha(content) : null };
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'download-analytics-'));
}

describe('syncAnalytics', () => {
  it('downloads only files that are absent or whose checksum differs', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, '2026-07-01.json'), '{"a":1}');
    writeFileSync(join(dir, '2026-07-02.json'), '{"old":1}');
    const requested: string[] = [];
    const content: Record<string, string> = {
      '2026-07-01.json': '{"a":1}',
      '2026-07-02.json': '{"new":2}',
      '2026-07-03.json': '{"c":3}',
    };
    const result = await syncAnalytics(dir, {
      list: async () => Object.entries(content).map(([n, c]) => remote(n, c)),
      download: async (n) => { requested.push(n); return content[n]!; },
    });
    assert.deepEqual(requested, ['2026-07-02.json', '2026-07-03.json']);
    assert.deepEqual(result.files.map((f) => f.status), ['current', 'downloaded', 'downloaded']);
    assert.equal(readFileSync(join(dir, '2026-07-02.json'), 'utf-8'), '{"new":2}');
    assert.ok(isComplete(result));
    assert.equal(downloadedCount(result), 2);
  });

  it('falls back to size when Bunny gives no checksum', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, '2026-07-01.json'), '{"a":1}');
    writeFileSync(join(dir, '2026-07-02.json'), '{"a":'); // cut short
    const requested: string[] = [];
    await syncAnalytics(dir, {
      list: async () => [remote('2026-07-01.json', '{"a":1}', false), remote('2026-07-02.json', '{"b":2}', false)],
      download: async (n) => { requested.push(n); return '{"b":2}'; },
    });
    assert.deepEqual(requested, ['2026-07-02.json']);
  });

  it('keeps a cached copy when its download fails, and reports the run incomplete', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, '2026-07-04.json'), '{"cached":1}');
    const result = await syncAnalytics(dir, {
      list: async () => [remote('2026-07-04.json', '{"fresh":1}'), remote('2026-07-05.json', '{}')],
      download: async () => { throw new Error('download x: HTTP 502 after 4 retries'); },
    });
    assert.deepEqual(result.files.map((f) => f.status), ['stale', 'missing']);
    assert.equal(readFileSync(join(dir, '2026-07-04.json'), 'utf-8'), '{"cached":1}');
    assert.equal(existsSync(join(dir, '2026-07-05.json')), false);
    assert.equal(isComplete(result), false);
    const report = renderReport(result);
    assert.match(report, /could not download 2 of the 2/);
    assert.match(report, /1 day\(s\) are missing/);
    assert.match(report, /1 day\(s\) are shown from an older copy/);
    assert.match(report, /`2026-07-04\.json` \(older copy kept\): download x: HTTP 502/);
  });

  it('treats a failed listing as incomplete and keeps every cached file', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, '2026-07-01.json'), '{}');
    const result = await syncAnalytics(dir, {
      list: async () => { throw new Error('list analytics: HTTP 503 after 4 retries'); },
      download: async () => { throw new Error('should not be called'); },
    });
    assert.equal(isComplete(result), false);
    assert.equal(result.localCount, 1);
    assert.match(renderReport(result), /could not list[\s\S]*from the 1 daily file\(s\) cached[\s\S]*HTTP 503/);
  });

  it('is complete when Bunny lists nothing', async () => {
    const result = await syncAnalytics(tempDir(), { list: async () => [], download: async () => '' });
    assert.ok(isComplete(result));
  });
});

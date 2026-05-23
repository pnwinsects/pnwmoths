import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { downloadSharedFile } from './dropbox-download.js';

// ---------------------------------------------------------------------------
// downloadSharedFile — input validation and error-message shape
// ---------------------------------------------------------------------------
describe('downloadSharedFile', () => {
  it('throws when token is missing — error contains "missing required param: token" but not the token value', async () => {
    await assert.rejects(
      () => downloadSharedFile({ shareUrl: 'https://example.com', dropboxPath: '/a.tif', token: '', destPath: '/tmp/a.tif' }),
      (err) => {
        assert.ok(
          err.message.includes('missing required param: token'),
          `expected "missing required param: token" in: ${err.message}`,
        );
        // The token value here is empty string so nothing to leak, but verify
        // the function does not reconstruct a token-like string in the message.
        assert.ok(
          !err.message.includes('sl.'),
          `error message must not contain token-like substring: ${err.message}`,
        );
        return true;
      },
    );
  });

  it('throws a shaped error when fetch returns 401 — message starts with endpoint path, does not contain token value', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => ({
        ok: false,
        status: 401,
        text: async () => 'invalid_access_token',
      });

      await assert.rejects(
        () => downloadSharedFile({
          shareUrl: 'https://www.dropbox.com/scl/fo/example',
          dropboxPath: '/test.tif',
          token: 'sl.SECRET',
          destPath: '/tmp/test.tif',
        }),
        (err) => {
          assert.ok(
            err.message.startsWith('/2/sharing/get_shared_link_file → 401:'),
            `expected message to start with "/2/sharing/get_shared_link_file → 401:" but got: ${err.message}`,
          );
          assert.ok(
            !err.message.includes('sl.SECRET'),
            `error message must not contain the token value "sl.SECRET": ${err.message}`,
          );
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

/**
 * scripts/lib/dropbox-download.js
 *
 * Phase 29 (v2.2 high-res photos): download a single file from a Dropbox
 * shared-link folder to a local path.
 *
 * API endpoint used (the only Dropbox endpoint this library touches):
 *   POST https://content.dropboxapi.com/2/sharing/get_shared_link_file
 *
 * This endpoint differs from the /2/files/* metadata endpoints in
 * scripts/lib/dropbox-list.js in two important ways:
 *   1. It uses the content-download host (content.dropboxapi.com), not the
 *      metadata host (api.dropboxapi.com).
 *   2. The JSON arguments are supplied in the `Dropbox-API-Arg` HTTP header,
 *      NOT in the request body — the body is empty, and the response body IS
 *      the file bytes.
 *
 * No retry policy lives here. Plan 02's scripts/tile-photos.js wraps calls
 * with its own withRetry helper, matching the "no retry in the library" stance
 * of scripts/lib/dropbox-list.js.
 *
 * Token security (T-29.01-01): the Authorization header value is never echoed
 * in thrown error messages. Error shape mirrors dbxCall() in dropbox-list.js:
 *   `${endpoint} → ${status}: ${text}`
 * Dropbox does not echo the Authorization header in its error response bodies.
 */

import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Download a single file from a Dropbox shared-link folder, streaming the
 * response body directly to a local file.
 *
 * @param {object} params
 * @param {string} params.shareUrl    - The Dropbox shared-folder URL (scl/fo/.../?rlkey=...)
 * @param {string} params.dropboxPath - The path of the file within the shared folder, e.g. '/Abagrotis apposita-A-D.tif'
 * @param {string} params.token       - Dropbox OAuth bearer token (never logged)
 * @param {string} params.destPath    - Absolute local path to write the downloaded file
 * @returns {Promise<void>}           - Resolves when the file is fully written
 * @throws {Error} If any required param is missing or the Dropbox API returns non-2xx
 */
export async function downloadSharedFile({ shareUrl, dropboxPath, token, destPath }) {
  // Validate all required params — throw before any network call so callers
  // can distinguish configuration errors from transient network errors.
  for (const [name, value] of [
    ['shareUrl', shareUrl],
    ['dropboxPath', dropboxPath],
    ['token', token],
    ['destPath', destPath],
  ]) {
    if (!value) {
      throw new Error(`downloadSharedFile: missing required param: ${name}`);
    }
  }

  const res = await fetch('https://content.dropboxapi.com/2/sharing/get_shared_link_file', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({ url: shareUrl, path: dropboxPath }),
      // No Content-Type header — the body is empty for this endpoint.
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`/2/sharing/get_shared_link_file → ${res.status}: ${text}`);
  }

  // Create the parent directory if it does not exist (mirrors mkdir -p).
  await mkdir(dirname(destPath), { recursive: true });

  // Stream the response body to the destination file.
  // Node's fetch returns a Web Streams ReadableStream; pipeline handles the
  // web-stream → fs writable conversion automatically in Node 18+.
  await pipeline(res.body, createWriteStream(destPath));
}

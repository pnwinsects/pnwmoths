/**
 * scripts/lib/dropbox-download.ts
 *
 * Phase 29 (v2.2 high-res photos): download a single file from a Dropbox
 * shared-link folder to a local path.
 * Phase 34 (v3.0): converted to strict TypeScript.
 *
 * API endpoint used (the only Dropbox endpoint this library touches):
 *   POST https://content.dropboxapi.com/2/sharing/get_shared_link_file
 *
 * This endpoint differs from the /2/files/* metadata endpoints in
 * scripts/lib/dropbox-list.ts in two important ways:
 *   1. It uses the content-download host (content.dropboxapi.com), not the
 *      metadata host (api.dropboxapi.com).
 *   2. The JSON arguments are supplied in the `Dropbox-API-Arg` HTTP header,
 *      NOT in the request body — the body is empty, and the response body IS
 *      the file bytes.
 *
 * No retry policy lives here. Plan 02's scripts/tile-photos.js wraps calls
 * with its own withRetry helper, matching the "no retry in the library" stance
 * of scripts/lib/dropbox-list.ts.
 *
 * Token security (T-29.01-01): the Authorization header value is never echoed
 * in thrown error messages. Error shape mirrors dbxCall() in dropbox-list.ts:
 *   `${endpoint} → ${status}: ${text}`
 * Dropbox does not echo the Authorization header in its error response bodies.
 */

import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

// Internal param type — not exported; all params required, no optional fields.
interface DownloadParams {
  shareUrl: string;
  dropboxPath: string;
  token: string;
  destPath: string;
}

// Custom error type for retriable flag (avoids modifying Error prototype).
// Cast pattern from RESEARCH — single widening cast of a value this function constructs.
interface DropboxError extends Error {
  retriable: boolean;
}

/**
 * Download a single file from a Dropbox shared-link folder, streaming the
 * response body directly to a local file.
 *
 * @throws {Error} If any required param is missing or the Dropbox API returns non-2xx
 * @throws {DropboxError} On non-2xx response, with `.retriable === (status === 429)` (T-29.01-01)
 */
export async function downloadSharedFile(params: DownloadParams): Promise<void> {
  const { shareUrl, dropboxPath, token, destPath } = params;
  // Validate all required params — throw before any network call so callers
  // can distinguish configuration errors from transient network errors.
  for (const [name, value] of [
    ['shareUrl', shareUrl],
    ['dropboxPath', dropboxPath],
    ['token', token],
    ['destPath', destPath],
  ] as [string, string][]) {
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
    const err = new Error(`/2/sharing/get_shared_link_file → ${res.status}: ${text}`) as DropboxError;
    // 4xx errors (except 429 rate-limit) are permanent client errors; retrying won't help.
    // Token never appears in error message (T-29.01-01 / T-34-02).
    err.retriable = res.status === 429;
    throw err;
  }

  // Create the parent directory if it does not exist (mirrors mkdir -p).
  await mkdir(dirname(destPath), { recursive: true });

  // Stream the response body to the destination file.
  // Node's fetch returns a Web Streams ReadableStream; pipeline handles the
  // web-stream → fs writable conversion automatically in Node 18+.
  // Strict null check: guard res.body before pipeline (RESEARCH — null guard required).
  if (!res.body) throw new Error('downloadSharedFile: response body is null');
  await pipeline(res.body, createWriteStream(destPath));
}

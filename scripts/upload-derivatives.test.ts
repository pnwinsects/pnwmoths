import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  redact,
  encodeStoragePath,
  storageUrl,
  emitCommittedManifest,
  type ManifestRow,
} from './upload-derivatives.ts';

function row(over: Partial<ManifestRow> = {}): ManifestRow {
  return {
    derived_path: 'derived/a/b@320h.webp',
    source_path: 'a/b.jpg',
    kind: 'legacy',
    variant: '320h',
    status: 'uploaded',
    bytes: '1234',
    error: '',
    ...over,
  };
}

describe('redact', () => {
  it('removes the storage password from a message', () => {
    assert.equal(redact('AccessKey: hunter2 failed', 'hunter2'), 'AccessKey: [REDACTED] failed');
  });

  it('removes every occurrence, not just the first', () => {
    assert.equal(redact('hunter2 and hunter2', 'hunter2'), '[REDACTED] and [REDACTED]');
  });

  it('is a no-op when no secret is set, rather than mangling the message', () => {
    assert.equal(redact('nothing to hide', ''), 'nothing to hide');
  });
});

describe('encodeStoragePath', () => {
  it('encodes spaces in Django-era filenames', () => {
    assert.equal(
      encodeStoragePath('derived/habrosyne-scripta/Habrosyne scripta-A-D@320h.webp'),
      'derived/habrosyne-scripta/Habrosyne%20scripta-A-D%40320h.webp',
    );
  });

  it('percent-encodes the @ separator, which is safe because Bunny decodes paths', () => {
    // encodeURIComponent escapes `@` to `%40`. Verified against the live CDN that
    // Bunny fully percent-decodes path segments — `%48`/`%2D`/`%2E` all resolve to
    // the same object as `H`/`-`/`.` — so `%40` and `@` address one file, and the
    // ADR 0022 naming convention survives the round trip.
    assert.equal(encodeStoragePath('derived/a@320h.webp'), 'derived/a%40320h.webp');
  });

  it('preserves separators rather than encoding them', () => {
    assert.equal(encodeStoragePath('a/b/c.webp'), 'a/b/c.webp');
  });

  it('encodes characters that would otherwise split the path', () => {
    assert.equal(encodeStoragePath('a/b?c.webp'), 'a/b%3Fc.webp');
  });
});

describe('storageUrl', () => {
  it('targets the storage zone, not the pull zone', () => {
    assert.equal(
      storageUrl('derived/a/b@320h.webp', 'la.storage.bunnycdn.com', 'pnwmoths'),
      'https://la.storage.bunnycdn.com/pnwmoths/derived/a/b%40320h.webp',
    );
  });

  it('encodes the path it embeds', () => {
    assert.match(storageUrl('derived/a b.webp', 'h', 'z'), /a%20b\.webp$/);
  });
});

describe('emitCommittedManifest', () => {
  it('includes uploaded rows', () => {
    const csv = emitCommittedManifest([row()]);
    assert.match(csv, /derived\/a\/b@320h\.webp/);
  });

  it('EXCLUDES generated-but-not-uploaded rows — the guard must not pass on local-only files', () => {
    const csv = emitCommittedManifest([row({ status: 'generated', derived_path: 'derived/local@320h.webp' })]);
    assert.equal(csv.includes('derived/local@320h.webp'), false);
  });

  it('excludes failed rows', () => {
    const csv = emitCommittedManifest([row({ status: 'failed', derived_path: 'derived/bad@320h.webp' })]);
    assert.equal(csv.includes('derived/bad@320h.webp'), false);
  });

  it('drops the status and error columns, which are run state not product', () => {
    const header = emitCommittedManifest([row()]).split('\n')[0];
    assert.equal(header, 'derived_path,source_path,kind,variant,bytes');
  });

  // #214: var/ holds only what the current run touched, so emitting from scratch
  // state alone deleted every other derivative's row and failed the source gate
  // site-wide. Scoping a run (KIND=, LIMIT=, ONLY=) is the documented workflow,
  // which made this reachable from the runbook's own instructions.
  it('preserves existing committed rows the current run never touched', () => {
    const csv = emitCommittedManifest(
      [row({ derived_path: 'derived/new@320h.webp' })],
      [row({ derived_path: 'derived/untouched@320h.webp' })],
    );
    assert.match(csv, /derived\/untouched@320h\.webp/);
    assert.match(csv, /derived\/new@320h\.webp/);
  });

  it('refreshes an existing row rather than duplicating it', () => {
    const csv = emitCommittedManifest(
      [row({ derived_path: 'derived/same@320h.webp', bytes: '999' })],
      [row({ derived_path: 'derived/same@320h.webp', bytes: '111' })],
    );
    const hits = csv.trim().split('\n').filter((l) => l.includes('derived/same@320h.webp'));
    assert.equal(hits.length, 1);
    assert.match(hits[0]!, /999/);
  });

  it('keeps a committed row even when this run failed to re-upload it', () => {
    // The object is still on the zone; nothing is ever deleted there. Dropping the
    // row would fail the build for an image that renders perfectly well.
    const csv = emitCommittedManifest(
      [row({ derived_path: 'derived/flaky@320h.webp', status: 'failed' })],
      [row({ derived_path: 'derived/flaky@320h.webp' })],
    );
    assert.match(csv, /derived\/flaky@320h\.webp/);
  });

  it('sorts by derived_path so the committed diff is stable', () => {
    const csv = emitCommittedManifest([
      row({ derived_path: 'derived/z@320h.webp' }),
      row({ derived_path: 'derived/a@320h.webp' }),
    ]);
    const lines = csv.trim().split('\n');
    assert.match(lines[1]!, /derived\/a@320h\.webp/);
    assert.match(lines[2]!, /derived\/z@320h\.webp/);
  });

  it('emits a header-only file when nothing is uploaded yet', () => {
    assert.equal(emitCommittedManifest([]).trim(), 'derived_path,source_path,kind,variant,bytes');
  });
});

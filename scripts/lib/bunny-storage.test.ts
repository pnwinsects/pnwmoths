// scripts/lib/bunny-storage.test.ts
// Unit tests for the shared Bunny storage client's pure and offline behavior.
// Network paths (walk/copyObject) are exercised by the migration scripts that
// use them; here we pin the contracts the copies were extracted around.
// Run via: node --test scripts/lib/bunny-storage.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBunnyStorage, retargetSlugSegment, pooled } from './bunny-storage.ts';

const client = () => createBunnyStorage({ host: 'la.storage.bunnycdn.com', zone: 'pnwmoths', password: 'sekrit' });

test('storageUrl: encodes each segment but not the separators', () => {
  assert.equal(
    client().storageUrl('catocala-cleopatra/Catocala allusa-A-D.jpg'),
    'https://la.storage.bunnycdn.com/pnwmoths/catocala-cleopatra/Catocala%20allusa-A-D.jpg',
  );
});

test('redact: strips the password from log-bound messages', () => {
  assert.equal(client().redact('PUT failed: AccessKey sekrit rejected'), 'PUT failed: AccessKey [REDACTED] rejected');
});

test('redact: passes messages through when no password is set', () => {
  const open = createBunnyStorage({ host: 'h', zone: 'z', password: '' });
  assert.equal(open.redact('list x: 401'), 'list x: 401');
});

test('retargetSlugSegment: rewrites the folder, never the filename', () => {
  assert.equal(
    retargetSlugSegment('catocala-allusa/Catocala allusa-A-D.jpg', 'catocala-allusa', 'catocala-cleopatra'),
    'catocala-cleopatra/Catocala allusa-A-D.jpg',
  );
  assert.equal(
    retargetSlugSegment('species-tiles/catocala-allusa/A-D_files/9/1_2.webp', 'catocala-allusa', 'catocala-cleopatra'),
    'species-tiles/catocala-cleopatra/A-D_files/9/1_2.webp',
  );
});

test('retargetSlugSegment: leaves a key outside the slug alone', () => {
  const key = 'derived/abagrotis-apposita/Abagrotis apposita-A-D@320h.webp';
  assert.equal(retargetSlugSegment(key, 'catocala-allusa', 'catocala-cleopatra'), key);
});

test('withRetry: returns the first success without exhausting attempts', async () => {
  let calls = 0;
  const result = await client().withRetry(async () => { calls++; return 'ok'; }, 'noop');
  assert.equal(result, 'ok');
  assert.equal(calls, 1);
});

test('pooled: runs every item exactly once with bounded concurrency', async () => {
  const seen: number[] = [];
  let inFlight = 0;
  let peak = 0;
  await pooled([1, 2, 3, 4, 5, 6], 2, async (n) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise(r => setTimeout(r, 5));
    seen.push(n);
    inFlight--;
  });
  assert.deepEqual([...seen].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
  assert.ok(peak <= 2, `concurrency peaked at ${peak}`);
});

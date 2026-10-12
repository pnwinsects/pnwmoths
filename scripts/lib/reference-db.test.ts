import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { explainFailure, parseBatch, unescapeBatch, DEFAULT_CONTAINER } from './reference-db.ts';

describe('explainFailure', () => {
  test('a missing container names the checkout, the Compose command and both container names', () => {
    const msg = explainFailure('Error response from daemon: No such container: pnwmoths-mysql', 'pnwmoths-mysql');
    assert.match(msg, /pnwinsects\/pnwinsects-app/);
    assert.match(msg, /docker compose up -d db/);
    assert.match(msg, new RegExp(DEFAULT_CONTAINER));
    assert.match(msg, /pnwmoths-local-site-db-1/);
    assert.match(msg, /MYSQL_CONTAINER/);
  });

  test('a stopped container says so', () => {
    const msg = explainFailure('Error response from daemon: container abc is not running', DEFAULT_CONTAINER);
    assert.match(msg, /exists but is stopped/);
    assert.match(msg, /docker compose up -d db/);
  });

  test("Docker not running says so, in either CLI generation's wording", () => {
    for (const detail of [
      'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?',
      'failed to connect to the docker API at unix:///var/run/docker.sock; check if the path is correct and if the daemon is running: dial unix /var/run/docker.sock: connect: no such file or directory',
    ]) {
      assert.match(explainFailure(detail, DEFAULT_CONTAINER), /Docker itself is not running/);
    }
  });

  test('a SQL error passes through without start-up advice', () => {
    const msg = explainFailure("ERROR 1146 (42S02): Table 'pnwmoths.nope' doesn't exist", DEFAULT_CONTAINER);
    assert.match(msg, /ERROR 1146/);
    assert.doesNotMatch(msg, /docker compose/);
  });
});

describe('parseBatch', () => {
  test('keys each row by the header and decodes escaping', () => {
    assert.deepStrictEqual(parseBatch('genus\ttribe\nAus\tBini\nCus\ta\\tb\n'), [
      { genus: 'Aus', tribe: 'Bini' },
      { genus: 'Cus', tribe: 'a\tb' },
    ]);
  });

  test('a header with no rows, or no output at all, is no rows', () => {
    assert.deepStrictEqual(parseBatch('genus\ttribe\n'), []);
    assert.deepStrictEqual(parseBatch(''), []);
  });
});

describe('unescapeBatch', () => {
  test('decodes \\n, \\0 and a literal backslash', () => {
    assert.equal(unescapeBatch('a\\nb\\0c\\\\d'), 'a\nb\0c\\d');
  });
});

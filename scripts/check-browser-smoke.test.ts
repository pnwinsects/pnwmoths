import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import {
  CHECKS,
  contentTypeFor,
  parsePlottedCount,
  parseResultCount,
  parseTimeout,
  pickSpeciesSlug,
  resolveRequestPath,
  serveSite,
  summarize,
} from './check-browser-smoke.ts';

// The browser-driving half of check-browser-smoke.ts is exercised by running it
// (`npm run smoke:browser`), not from here — a unit test that launched Chrome
// would put a browser on the critical path of `npm test`. What is covered here
// is everything a wrong answer in would make the smoke check lie: the fixture
// server's path resolution, the species picker, and the two parsers that decide
// pass from fail.

describe('contentTypeFor', () => {
  it('types the assets the components actually fetch', () => {
    assert.match(contentTypeFor('/a/index.html'), /^text\/html/);
    assert.match(contentTypeFor('/assets/main.js'), /^text\/javascript/);
    assert.match(contentTypeFor('/species-states.json'), /^application\/json/);
    assert.equal(contentTypeFor('/species/x/records.parquet'), 'application/octet-stream');
  });

  it('is case-insensitive about the extension', () => {
    assert.equal(contentTypeFor('/IMAGES/HEADER.PNG'), 'image/png');
  });

  it('falls back to octet-stream rather than guessing', () => {
    assert.equal(contentTypeFor('/what/is/this.zzz'), 'application/octet-stream');
    assert.equal(contentTypeFor('/no-extension'), 'application/octet-stream');
  });
});

describe('resolveRequestPath', () => {
  let root: string;

  before(() => {
    root = mkdtempSync(join(tmpdir(), 'pnwm-smoke-serve-'));
    mkdirSync(join(root, 'browse'), { recursive: true });
    mkdirSync(join(root, 'empty'), { recursive: true });
    writeFileSync(join(root, 'index.html'), 'home');
    writeFileSync(join(root, 'browse', 'index.html'), 'browse');
    writeFileSync(join(root, 'key-matrix.json'), '{}');
    writeFileSync(join(root, 'a b.json'), '{}');
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  it('resolves a file path', () => {
    assert.equal(resolveRequestPath('/key-matrix.json', root), join(root, 'key-matrix.json'));
  });

  it('resolves a directory to its index.html, with or without a trailing slash', () => {
    const expected = join(root, 'browse', 'index.html');
    assert.equal(resolveRequestPath('/browse/', root), expected);
    assert.equal(resolveRequestPath('/browse', root), expected);
  });

  it('resolves the site root', () => {
    assert.equal(resolveRequestPath('/', root), join(root, 'index.html'));
  });

  it('ignores query strings and fragments', () => {
    assert.equal(resolveRequestPath('/browse/?state=WA#Noctuidae', root), join(root, 'browse', 'index.html'));
  });

  it('decodes percent-encoding', () => {
    assert.equal(resolveRequestPath('/a%20b.json', root), join(root, 'a b.json'));
  });

  it('404s a missing file, and a directory with no index', () => {
    assert.equal(resolveRequestPath('/nope.json', root), null);
    assert.equal(resolveRequestPath('/empty/', root), null);
  });

  it('404s malformed percent-encoding instead of throwing', () => {
    assert.equal(resolveRequestPath('/%E0%A4%A.html', root), null);
  });

  // A traversal that silently succeeded would let a check pass against a file
  // that is not in the build at all.
  it('refuses to escape the site directory', () => {
    assert.equal(resolveRequestPath('/../../etc/passwd', root), null);
    assert.equal(resolveRequestPath('/browse/../../../etc/passwd', root), null);
    assert.equal(resolveRequestPath('/%2e%2e/%2e%2e/etc/passwd', root), null);
  });

  it('refuses a NUL byte', () => {
    assert.equal(resolveRequestPath('/index.html\0.json', root), null);
  });

  it('does not treat a sibling directory sharing a prefix as inside the root', () => {
    // `${root}-evil` starts with `${root}` as a string but is not under it.
    const sibling = `${root}-evil`;
    mkdirSync(sibling, { recursive: true });
    writeFileSync(join(sibling, 'secret.json'), '{}');
    try {
      const escaped = `/..${sep}${sibling.split(sep).pop()}${sep}secret.json`;
      assert.equal(resolveRequestPath(escaped, root), null);
    } finally {
      rmSync(sibling, { recursive: true, force: true });
    }
  });
});

describe('pickSpeciesSlug', () => {
  let root: string;

  const writeParquet = (slug: string, bytes: number): void => {
    mkdirSync(join(root, 'species', slug), { recursive: true });
    writeFileSync(join(root, 'species', slug, 'records.parquet'), Buffer.alloc(bytes));
  };

  before(() => {
    root = mkdtempSync(join(tmpdir(), 'pnwm-smoke-pick-'));
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  it('throws when the build has no species directory', () => {
    const bare = mkdtempSync(join(tmpdir(), 'pnwm-smoke-bare-'));
    try {
      assert.throws(() => pickSpeciesSlug(bare), /run the build first/);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it('throws when no species has a records.parquet', () => {
    const empty = mkdtempSync(join(tmpdir(), 'pnwm-smoke-noparquet-'));
    try {
      mkdirSync(join(empty, 'species', 'aaa-bbb'), { recursive: true });
      assert.throws(() => pickSpeciesSlug(empty), /records\.parquet/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('picks the largest parquet — the species with the most records', () => {
    writeParquet('aaa-first', 100);
    writeParquet('zzz-biggest', 900);
    writeParquet('mmm-middle', 500);
    assert.equal(pickSpeciesSlug(root), 'zzz-biggest');
  });

  it('breaks ties alphabetically so the choice is stable across machines', () => {
    const tied = mkdtempSync(join(tmpdir(), 'pnwm-smoke-tie-'));
    try {
      for (const slug of ['zebra-one', 'alpha-one', 'mid-one']) {
        mkdirSync(join(tied, 'species', slug), { recursive: true });
        writeFileSync(join(tied, 'species', slug, 'records.parquet'), Buffer.alloc(42));
      }
      assert.equal(pickSpeciesSlug(tied), 'alpha-one');
    } finally {
      rmSync(tied, { recursive: true, force: true });
    }
  });

  it('skips species directories with no parquet at all', () => {
    mkdirSync(join(root, 'species', 'zzzz-noparquet'), { recursive: true });
    assert.equal(pickSpeciesSlug(root), 'zzz-biggest');
  });
});

describe('parsePlottedCount', () => {
  it('reads the count out of the map aria-label', () => {
    assert.equal(
      parsePlottedCount('Occurrence map for Smerinthus ophthalmica: 412 records plotted.'),
      412,
    );
  });

  it('handles the singular form the component emits for one record', () => {
    assert.equal(parsePlottedCount('Occurrence map for Foo bar: 1 record plotted.'), 1);
  });

  it('handles a thousands separator', () => {
    assert.equal(parsePlottedCount('Occurrence map for Foo bar: 1,204 records plotted.'), 1204);
  });

  // Zero is a real answer and must not be confused with "could not tell".
  it('distinguishes zero from unparseable', () => {
    assert.equal(parsePlottedCount('Occurrence map for Foo bar: 0 records plotted.'), 0);
    assert.equal(parsePlottedCount('Loading occurrence data...'), null);
    assert.equal(parsePlottedCount(''), null);
  });
});

describe('parseResultCount', () => {
  it('reads both phrasings buildCountText produces', () => {
    assert.equal(parseResultCount('Showing all 1,190 species'), 1190);
    assert.equal(parseResultCount('37 species match'), 37);
  });

  it('returns null when the line is not a count', () => {
    assert.equal(parseResultCount('No matches'), null);
  });
});

describe('serveSite', () => {
  it('serves the tree it is given and 404s everything else', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pnwm-smoke-http-'));
    mkdirSync(join(root, 'browse'), { recursive: true });
    writeFileSync(join(root, 'browse', 'index.html'), '<p>browse</p>');
    const { origin, close } = await serveSite(root);
    try {
      const ok = await fetch(`${origin}/browse/`);
      assert.equal(ok.status, 200);
      assert.match(ok.headers.get('content-type') ?? '', /^text\/html/);
      assert.equal(await ok.text(), '<p>browse</p>');

      assert.equal((await fetch(`${origin}/missing/`)).status, 404);
    } finally {
      await close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('CHECKS', () => {
  // Deliberately not asserting an exact count: that would be pure ossification,
  // an edit tax on adding the fourth check ADR 0035 already anticipates.
  it('is non-empty and every entry is runnable', () => {
    assert.ok(CHECKS.length > 0);
    for (const check of CHECKS) {
      assert.equal(typeof check.name, 'string');
      assert.ok(check.name.length > 0);
      assert.equal(typeof check.run, 'function');
    }
  });

  it('gives every check a distinct name, since names are how failures are reported', () => {
    assert.equal(new Set(CHECKS.map((c) => c.name)).size, CHECKS.length);
  });
});

describe('parseTimeout', () => {
  it('defaults when unset or empty', () => {
    assert.equal(parseTimeout(undefined), 15_000);
    assert.equal(parseTimeout(''), 15_000);
  });

  it('accepts a positive number', () => {
    assert.equal(parseTimeout('500'), 500);
  });

  // NaN reaching setDefaultTimeout disables the timeout, so a typo would hang
  // CI to its job limit instead of failing.
  it('rejects values that would disable the timeout', () => {
    assert.throws(() => parseTimeout('garbage'), /positive number/);
    assert.throws(() => parseTimeout('0'), /positive number/);
    assert.throws(() => parseTimeout('-5'), /positive number/);
    assert.throws(() => parseTimeout('Infinity'), /positive number/);
  });
});

describe('summarize', () => {
  // This is the rule that decides whether CI goes green. Inverting it would
  // make every assertion in the file decorative, so it is tested directly
  // rather than only through a browser run.
  const silent = (): void => {};
  const run = (outcomes: Parameters<typeof summarize>[0]): { code: number; errors: string[] } => {
    const errors: string[] = [];
    const code = summarize(outcomes, silent, (msg: string) => errors.push(msg));
    return { code, errors };
  };

  const passing = (name: string) => ({ name, failure: null, pageErrors: [] });

  it('exits 0 only when every check passed', () => {
    assert.equal(run([passing('a'), passing('b')]).code, 0);
  });

  it('exits 1 when any check failed', () => {
    const { code, errors } = run([passing('a'), { name: 'b', failure: 'broke', pageErrors: [] }]);
    assert.equal(code, 1);
    assert.ok(errors.some((e) => e.includes('FAIL b')));
    assert.ok(errors.some((e) => e.includes('1 of 2')));
  });

  it('exits 1 when a check passed its assertions but the page threw', () => {
    const { code, errors } = run([{ name: 'a', failure: null, pageErrors: ['TypeError: x'] }]);
    assert.equal(code, 1);
    assert.ok(errors.some((e) => e.includes('passed its assertions but the page threw')));
    assert.ok(errors.some((e) => e.includes('TypeError: x')));
  });

  // The "green while checking nothing" shape (ADR 0033): an empty run is a
  // failure, not a vacuous pass.
  it('exits 1 when no checks ran at all', () => {
    const { code, errors } = run([]);
    assert.equal(code, 1);
    assert.ok(errors.some((e) => e.includes('no checks ran')));
  });

  it('reports at most three page errors so one check cannot bury the others', () => {
    const { errors } = run([
      { name: 'a', failure: null, pageErrors: ['e1', 'e2', 'e3', 'e4', 'e5'] },
    ]);
    assert.equal(errors.filter((e) => e.includes('page threw:')).length, 3);
  });
});

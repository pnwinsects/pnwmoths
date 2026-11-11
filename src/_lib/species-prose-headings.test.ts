// src/_lib/species-prose-headings.test.ts
// Every species account's headings must go down one level at a time (WCAG 1.3.1, #204).
//
// The species page supplies the h1 (the species name), so an account starts at `##`. Until
// #204 almost every account jumped from `## Identification` straight to `##### Adults`, and
// screen-reader users moving by heading met an outline with two levels missing. The accounts
// are edited by hand, often in GitHub's web editor, so this test is what stops the old shape
// coming back in a new account.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIR = resolve('src/content/species');

/** Each place where a heading is more than one level deeper than the one before it. */
export function headingSkips(markdown: string): string[] {
  const skips: string[] = [];
  let previous = 1; // the page's own h1
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const match = /^(#{1,6})\s/.exec(line);
    if (!match) continue;
    const level = match[1]!.length;
    if (level > previous + 1) skips.push(`"${line.trim()}" follows a level-${previous} heading`);
    previous = level;
  }
  return skips;
}

test('headingSkips finds a jump of more than one level, and nothing else', () => {
  assert.deepEqual(headingSkips('## Identification\n\n### Adults\n\n## Habitat\n'), []);
  assert.deepEqual(headingSkips('## Identification\n\n##### Adults\n'), [
    '"##### Adults" follows a level-2 heading',
  ]);
  assert.deepEqual(headingSkips('```\n##### not a heading\n```\n## Real\n'), []);
});

test('no species account skips a heading level', () => {
  const problems = readdirSync(DIR)
    .filter((f) => f.endsWith('.md'))
    .flatMap((f) => headingSkips(readFileSync(join(DIR, f), 'utf8')).map((s) => `${f}: ${s}`));
  assert.deepEqual(
    problems,
    [],
    'Each heading may be at most one level below the one before it. Accounts start at ## ' +
      '(Identification, Habitat…), and their subheadings (Adults, Larvae, Pacific Northwest…) use ###. ' +
      'See _instructions/EDITING_DESCRIPTION.md.',
  );
});

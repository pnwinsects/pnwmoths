// src/index.test.ts
// Tests for the homepage announcement region (issue #70).
// The template renders src/content/home-announcement.md only when it exists,
// mirroring the optional species-prose pattern (src/species/species.njk).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const indexSource = readFileSync(resolve(ROOT, 'src', 'index.njk'), 'utf8');

test('index.njk: checks for src/content/home-announcement.md via fileExists', () => {
  assert.ok(
    indexSource.includes('"src/content/home-announcement.md"'),
    'index.njk must reference src/content/home-announcement.md'
  );
  assert.match(
    indexSource,
    /announcementPath\s*\|\s*fileExists/,
    'index.njk must gate the announcement on the fileExists filter'
  );
});

test('index.njk: renders the announcement file with renderFile when present', () => {
  assert.match(
    indexSource,
    /\{%\s*renderFile\s+announcementPath\s*%\}/,
    'index.njk must render the announcement markdown with the renderFile shortcode'
  );
});

test('index.njk: wraps the announcement in a home-announcement region', () => {
  assert.match(
    indexSource,
    /<div class="home-announcement" role="region" aria-label="Site announcement">/,
    'index.njk must wrap the rendered announcement in a labeled home-announcement region'
  );
});

test('index.njk: announcement block appears before the homepage stats', () => {
  const announcementIdx = indexSource.indexOf('home-announcement');
  const statsIdx = indexSource.indexOf('home-stats');
  assert.ok(announcementIdx !== -1, 'home-announcement block must exist');
  assert.ok(statsIdx !== -1, 'home-stats block must exist');
  assert.ok(announcementIdx < statsIdx, 'announcement must render above the stats block');
});

test('theme.css: defines .home-announcement styling', () => {
  const cssSource = readFileSync(resolve(ROOT, 'src', 'styles', 'theme.css'), 'utf8');
  assert.match(
    cssSource,
    /\.home-announcement\s*\{/,
    'theme.css must define a .home-announcement rule'
  );
});

test('src/content/home-announcement.md is non-empty when present', () => {
  // Mirrors species prose: maintainers can add or remove this optional file,
  // but committing an empty announcement would render a blank callout.
  const path = resolve(ROOT, 'src', 'content', 'home-announcement.md');
  assert.ok(
    !existsSync(path) || readFileSync(path, 'utf8').trim().length > 0,
    'if src/content/home-announcement.md exists, it should not be committed empty'
  );
});

// src/_lib/social-meta.test.ts
// Tests for the sharing-metadata derivation (issue #198).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MAX_DESCRIPTION_LENGTH,
  firstParagraph,
  proseDescription,
  speciesDescription,
  speciesFallbackDescription,
  speciesSocialImage,
  speciesSocialImageAlt,
  stripMarkdown,
  truncate,
} from './social-meta.ts';

const CDN = 'https://moths.pnwinsects.org';

test('stripMarkdown: removes emphasis, links, images and inline code', () => {
  assert.equal(stripMarkdown('*Abagrotis apposita* is a moth'), 'Abagrotis apposita is a moth');
  assert.equal(stripMarkdown('**bold** and __also bold__'), 'bold and also bold');
  assert.equal(stripMarkdown('see [BugGuide](https://bugguide.net/1)'), 'see BugGuide');
  assert.equal(stripMarkdown('![a moth](/img/moth.png) follows'), 'a moth follows');
  assert.equal(stripMarkdown('the `slug` field'), 'the slug field');
  assert.equal(stripMarkdown('a <em>raw</em> tag'), 'a raw tag');
});

test('stripMarkdown: collapses the hard wraps and double spaces in the factsheet prose', () => {
  assert.equal(
    stripMarkdown('FW length 14 -  17 mm\nthat flies in\nforests.'),
    'FW length 14 - 17 mm that flies in forests.',
  );
});

test('stripMarkdown: leaves intra-word underscores alone', () => {
  assert.equal(stripMarkdown('the species_slug column'), 'the species_slug column');
});

test('stripMarkdown: drops unbalanced emphasis markers left by the legacy CMS', () => {
  // Real shape from src/content/species/euxoa-lineifrons.md before it was fixed:
  // stray markers either side of a non-breaking space.
  assert.equal(stripMarkdown('**Euxoa lineifrons* *is a pale moth'), 'Euxoa lineifrons is a pale moth');
  assert.equal(stripMarkdown('a member of the subgenus* *Euxoa*.*'), 'a member of the subgenus Euxoa.');
});

test('firstParagraph: skips headings and returns the first real paragraph', () => {
  const markdown = [
    '## Identification',
    '',
    '##### Adults',
    '',
    '*Abagrotis apposita* is a mottled brick-red moth that flies in forests in late summer.',
    '',
    '## Habitat',
  ].join('\n');
  assert.equal(
    firstParagraph(markdown),
    'Abagrotis apposita is a mottled brick-red moth that flies in forests in late summer.',
  );
});

test('firstParagraph: skips lists, blockquotes, tables, fences and short stubs', () => {
  const markdown = [
    '# Title',
    '',
    '- a bullet that is quite long but is still structure, not prose at all',
    '',
    '> a block quote that is quite long but is still structure, not prose at all',
    '',
    '| a | table |',
    '',
    'None.',
    '',
    'This is the first paragraph that actually reads as a description of something.',
  ].join('\n');
  assert.equal(
    firstParagraph(markdown),
    'This is the first paragraph that actually reads as a description of something.',
  );
});

test('firstParagraph: strips YAML front matter before looking for prose', () => {
  const markdown = [
    '---',
    'title: "A page title long enough to be mistaken for a paragraph of prose"',
    '---',
    '',
    'The real opening paragraph of the page, comfortably past the length floor.',
  ].join('\n');
  assert.equal(
    firstParagraph(markdown),
    'The real opening paragraph of the page, comfortably past the length floor.',
  );
});

test('firstParagraph: returns null when there is no prose paragraph', () => {
  assert.equal(firstParagraph('## Identification\n\n## Habitat\n'), null);
  assert.equal(firstParagraph(''), null);
});

test('truncate: leaves text within budget untouched and adds no ellipsis', () => {
  assert.equal(truncate('short enough', 40), 'short enough');
  assert.equal(truncate('x'.repeat(40), 40), 'x'.repeat(40));
});

test('truncate: prefers a sentence boundary and does not mark it as truncated', () => {
  const text = 'A first sentence about a moth. A second sentence that runs past the budget entirely.';
  const result = truncate(text, 50);
  assert.equal(result, 'A first sentence about a moth.');
  assert.ok(!result.endsWith('…'), 'a complete sentence should not look cut off');
});

test('truncate: falls back to a word boundary when the sentence break is too early', () => {
  // The only sentence end sits at 4% of the budget — cutting there would throw
  // away almost the whole description.
  const text = 'Yes. ' + 'word '.repeat(40);
  const result = truncate(text, 120);
  assert.ok(result.length <= 121, `expected <= budget + ellipsis, got ${result.length}`);
  assert.ok(result.endsWith('…'), 'a word-boundary cut must be marked with an ellipsis');
  assert.ok(!result.includes('  '), 'the ellipsis must not follow trailing whitespace');
});

test('truncate: never splits a word', () => {
  const result = truncate('alpha bravo charlie delta echo foxtrot', 22);
  assert.ok(
    'alpha bravo charlie delta echo foxtrot'.startsWith(result.replace('…', '')),
    'truncation must be a prefix of the source',
  );
  assert.ok(!/\w…$/.test(result.replace(/\S+…$/, '')), 'must cut at a space, not mid-word');
  assert.equal(result, 'alpha bravo charlie…');
});

test('proseDescription: derives a within-budget description from a factsheet', () => {
  const markdown = readFileSync(resolve('src/content/species/abagrotis-apposita.md'), 'utf8');
  const description = proseDescription(markdown);
  assert.ok(description, 'the shipped factsheet must yield a description');
  assert.ok(
    description.startsWith('Abagrotis apposita is a mottled brick-red'),
    `unexpected description: ${description}`,
  );
  assert.ok(description.length <= MAX_DESCRIPTION_LENGTH);
  assert.ok(!description.includes('*'), 'Markdown emphasis must not survive into the meta tag');
});

test('proseDescription: every shipped factsheet yields a usable description', () => {
  // Guards against a factsheet whose prose opens with structure only — those fall
  // through to the taxonomy sentence, which is fine, but a *widespread* null would
  // mean firstParagraph has stopped recognising the house Markdown style.
  const slugs = ['abagrotis-apposita', 'abagrotis-baueri', 'abagrotis-brunneipennis'];
  for (const slug of slugs) {
    const path = resolve('src/content/species', `${slug}.md`);
    if (!existsSync(path)) continue;
    const description = proseDescription(readFileSync(path, 'utf8'));
    assert.ok(description, `${slug} must yield a prose description`);
    assert.ok(description.length <= MAX_DESCRIPTION_LENGTH, `${slug} description over budget`);
  }
});

test('speciesFallbackDescription: names the species, its family and what the page holds', () => {
  const description = speciesFallbackDescription({
    genus: 'Abagrotis',
    species_display: 'apposita',
    common_name: null,
    family: 'Noctuidae',
  });
  assert.match(description, /^Abagrotis apposita — a moth of the family Noctuidae/);
  assert.ok(description.length <= MAX_DESCRIPTION_LENGTH);
});

test('speciesFallbackDescription: includes the common name and omits an absent family', () => {
  const description = speciesFallbackDescription({
    genus: 'Hemileuca',
    species_display: 'eglanterina',
    common_name: 'Elegant Sheep Moth',
    family: null,
  });
  assert.match(description, /Hemileuca eglanterina \(Elegant Sheep Moth\) — a moth recorded in/);
  assert.ok(!description.includes('family'));
});

test('speciesDescription: prefers prose and falls back to taxonomy', () => {
  const sp = { genus: 'Abagrotis', species_display: 'apposita', family: 'Noctuidae' };
  assert.equal(speciesDescription(sp, 'A hand-written summary.'), 'A hand-written summary.');
  assert.match(speciesDescription(sp, null), /^Abagrotis apposita — a moth of the family/);
  assert.match(speciesDescription(sp, undefined), /^Abagrotis apposita — a moth of the family/);
});

test('speciesDescription: truncates over-long prose to the meta budget', () => {
  const sp = { genus: 'Abagrotis', species_display: 'apposita' };
  const description = speciesDescription(sp, 'word '.repeat(200));
  assert.ok(description.length <= MAX_DESCRIPTION_LENGTH + 1);
});

test('speciesSocialImage: prefers the high-res thumbnail, large enough and in a format every platform reads', () => {
  const url = speciesSocialImage(
    'abagrotis-apposita',
    { high_res_available: true, specimens: [{ tiles_path: 'photos/abagrotis-apposita/12345-D' }] },
    [{ filename: 'legacy.jpg' }],
    CDN,
  );
  // format=jpg is not cosmetic: Facebook, LinkedIn and WhatsApp are all unreliable
  // with a WebP og:image, and 1,155 of 1,253 species pages take this branch.
  assert.equal(url, `${CDN}/photos/abagrotis-apposita/12345-D_thumbnail.webp?width=1200&format=jpg`);
});

test('speciesSocialImage: falls back to the lead legacy photo, URL-encoded', () => {
  const url = speciesSocialImage(
    'abagrotis-apposita',
    undefined,
    [{ filename: 'A apposita (male) #1.jpg' }, { filename: 'second.jpg' }],
    CDN,
  );
  assert.equal(url, `${CDN}/abagrotis-apposita/A%20apposita%20(male)%20%231.jpg`);
});

test('speciesSocialImage: ignores a manifest entry that is not actually high-res', () => {
  const url = speciesSocialImage(
    'abagrotis-apposita',
    { high_res_available: false, specimens: [{ tiles_path: 'photos/x-y/1-D' }] },
    [{ filename: 'legacy.jpg' }],
    CDN,
  );
  assert.equal(url, `${CDN}/abagrotis-apposita/legacy.jpg`);
});

test('speciesSocialImage: returns "" when the species has no photos, so the layout uses the site card', () => {
  assert.equal(speciesSocialImage('abagrotis-apposita', undefined, [], CDN), '');
  assert.equal(speciesSocialImage('abagrotis-apposita', undefined, undefined, CDN), '');
  assert.equal(
    speciesSocialImage('abagrotis-apposita', { high_res_available: true, specimens: [] }, [], CDN),
    '',
  );
});

test('speciesSocialImageAlt: describes the photo, not the page', () => {
  assert.equal(
    speciesSocialImageAlt({ genus: 'Abagrotis', species_display: 'apposita' }),
    'Specimen photograph of Abagrotis apposita',
  );
});

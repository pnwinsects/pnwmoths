/**
 * Test script for redirect.html logic.
 * Run inside Docker: node scripts/test-redirect.js
 */
import { readFileSync } from 'node:fs';

// Load the redirect.html and extract the JS logic
const html = readFileSync('_site/redirect.html', 'utf8');

// Extract the SPECIES_SLUGS set from the HTML
const slugsMatch = html.match(/const SPECIES_SLUGS = new Set\((\[.*?\])\)/s);
if (!slugsMatch) { console.error('Could not find SPECIES_SLUGS in redirect.html'); process.exit(1); }
const SPECIES_SLUGS = new Set(JSON.parse(slugsMatch[1]));

// Extract the STATIC_MAP
const staticMapMatch = html.match(/const STATIC_MAP = (\{[\s\S]*?\});/);
if (!staticMapMatch) { console.error('Could not find STATIC_MAP'); process.exit(1); }
const STATIC_MAP = eval('(' + staticMapMatch[1] + ')');

// Extract the SYNONYMS map
const synonymsMatch = html.match(/const SYNONYMS = (\{[\s\S]*?\});/);
const SYNONYMS = synonymsMatch ? eval('(' + synonymsMatch[1] + ')') : {};

// Replicate the resolve function
function resolve(fromPath) {
  let path = fromPath.trim();
  if (!path.startsWith('/')) path = '/' + path;
  if (!path.endsWith('/')) path += '/';

  if (STATIC_MAP[path]) {
    return { target: STATIC_MAP[path], matched: true };
  }

  if (path.startsWith('/browse/')) {
    const segments = path.split('/').filter(Boolean);
    const last = segments[segments.length - 1];

    if (last.startsWith('family-') || last.startsWith('subfamily-') || last.startsWith('tribe-')) {
      return { target: '/browse/', matched: true };
    }

    if (SPECIES_SLUGS.has(last)) {
      return { target: '/species/' + last + '/', matched: true };
    }

    const normalized = last.replace(/[_\s]+/g, '-').toLowerCase();
    if (SPECIES_SLUGS.has(normalized)) {
      return { target: '/species/' + normalized + '/', matched: true };
    }

    // Check synonym map
    const synonym = SYNONYMS[last] || SYNONYMS[normalized];
    if (synonym && SPECIES_SLUGS.has(synonym)) {
      return { target: '/species/' + synonym + '/', matched: true };
    }

    if (!last.includes('-')) {
      return { target: '/browse/', matched: true };
    }

    return { target: '/browse/', matched: false };
  }

  if (path.startsWith('/photographic-plates/')) {
    return { target: '/plates/', matched: true };
  }

  if (path === '/') {
    return { target: '/', matched: true };
  }

  return { target: '/', matched: false };
}

// --- Test cases ---
const tests = [
  // Species matches
  ['/browse/family-noctuidae/subfamily-noctuinae/acronicta/acronicta-americana/', '/species/acronicta-americana/', true],
  ['/browse/family-erebidae/subfamily-arctiinae/apantesis/apantesis-ornata/', '/species/apantesis-ornata/', true],
  ['/browse/family-sphingidae/subfamily-sphinginae/sphinx/sphinx-drupiferarum/', '/species/sphinx-drupiferarum/', true],
  // Structural pages
  ['/browse/family-noctuidae/', '/browse/', true],
  ['/browse/family-noctuidae/subfamily-noctuinae/', '/browse/', true],
  ['/browse/family-notodontidae/subfamily-notodontinae/notodonta/', '/browse/', true],
  // Plates
  ['/photographic-plates/289/', '/plates/', true],
  ['/photographic-plates/', '/plates/', true],
  // Static pages
  ['/about-moths/glossary/', '/glossary/', true],
  ['/about-moths/faqs/', '/faqs/', true],
  ['/gsearch/', '/search/', true],
  ['/browse-all/', '/browse/', true],
  // Missing species (on old site, not on new)
  ['/browse/family-notodontidae/subfamily-heterocampinae/coelodasys/coelodasys-unicornis/', '/browse/', false],
  ['/browse/family-notodontidae/subfamily-heterocampinae/ianassa/ianassa-pallida/', '/browse/', false],
  // Synonym/reclassification
  ['/browse/family-noctuidae/subfamily-noctuinae/tribe-apameini/globia/globia-alameda/', '/species/capsula-alameda/', true],
  ['/browse/family-noctuidae/subfamily-noctuinae/tribe-apameini/globia/globia-oblonga/', '/species/capsula-oblonga/', true],
  // Homepage
  ['/', '/', true],
  // Unknown paths
  ['/some-random-path/', '/', false],
];

let passed = 0;
let failed = 0;

for (const [input, expectedTarget, expectedMatched] of tests) {
  const result = resolve(input);
  const ok = result.target === expectedTarget && result.matched === expectedMatched;
  if (ok) {
    passed++;
  } else {
    failed++;
    console.log(`FAIL: resolve("${input}")`);
    console.log(`  Expected: { target: "${expectedTarget}", matched: ${expectedMatched} }`);
    console.log(`  Got:      { target: "${result.target}", matched: ${result.matched} }`);
  }
}

console.log(`\n${passed} passed, ${failed} failed out of ${tests.length} tests`);

// --- Full coverage test: run all 1780 old URLs ---
const oldUrls = readFileSync('wwu-urls.txt', 'utf8').trim().split('\n');
let matchedCount = 0;
let missedCount = 0;
const missed = [];

for (const url of oldUrls) {
  const result = resolve(url.trim());
  if (result.matched) {
    matchedCount++;
  } else {
    missedCount++;
    missed.push({ from: url.trim(), to: result.target });
  }
}

console.log(`\nFull URL coverage: ${matchedCount} matched, ${missedCount} missed out of ${oldUrls.length} total`);
if (missed.length > 0) {
  console.log(`\nMissed URLs (redirected to backstop):`);
  for (const m of missed) {
    console.log(`  ${m.from} -> ${m.to}`);
  }
}

// --- Reverse analysis: species on new site with no inbound redirect ---
const oldSpeciesSlugs = new Set();
for (const url of oldUrls) {
  const parts = url.trim().split('/').filter(Boolean);
  if (parts[0] === 'browse' && parts.length >= 2) {
    const last = parts[parts.length - 1];
    if (last.includes('-') && !last.startsWith('family-') && !last.startsWith('subfamily-') && !last.startsWith('tribe-')) {
      oldSpeciesSlugs.add(last);
    }
  }
}

const newOnly = [...SPECIES_SLUGS].filter(s => !oldSpeciesSlugs.has(s)).sort();
console.log(`\nSpecies on new site with no old URL (${newOnly.length}):`);
for (const s of newOnly.slice(0, 30)) {
  console.log(`  /species/${s}/`);
}
if (newOnly.length > 30) console.log(`  ... and ${newOnly.length - 30} more`);

process.exit(failed > 0 ? 1 : 0);

import { parse } from 'node-html-parser';

/**
 * Escape all regex metacharacters in a term string.
 * Required for terms like '1A+2A', 'W-mark', 'CuA1'.
 * @param {string} str
 * @returns {string}
 */
export function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Escape characters that are special inside HTML attribute values.
 * Seven definitions in glossary.csv contain double quotes (Anterior, Patagium,
 * Posterior, Quadrifid, Scale, Subreniform spot, Trifid) — must escape before
 * embedding in title="..." or data-definition="...".
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Build a term map from glossary CSV rows, sorted longest-first to prevent
 * shorter terms from consuming matches that belong to longer terms
 * (e.g. 'wing' must not match before 'forewing').
 *
 * Uses lookbehind/lookahead instead of \b because \b fails for terms containing
 * metacharacters adjacent to word chars (e.g. '1A+2A').
 *
 * @param {Array<{term: string, definition: string, image_filename: string}>} rows
 * @param {string} cdnBaseUrl - CDN base URL (e.g. 'https://pnwmoths.b-cdn.net')
 * @returns {Array<{term: string, lower: string, definition: string, imageUrl: string, regex: RegExp}>}
 */
export function buildTermMap(rows, cdnBaseUrl) {
  const sorted = [...rows].sort((a, b) => b.term.length - a.term.length);
  return sorted.map(row => ({
    term: row.term,
    lower: row.term.toLowerCase(),
    definition: row.definition || '',
    imageUrl: row.image_filename
      ? `${cdnBaseUrl}/glossary/${encodeURIComponent(row.image_filename)}`
      : '',
    regex: new RegExp(
      `(?<![a-zA-Z0-9])${escapeRegex(row.term)}(?![a-zA-Z0-9])`,
      'gi'
    ),
  }));
}

/**
 * Walk text nodes inside 'main p, main li, main h2, main h3' and wrap the
 * first occurrence of each glossary term in an <abbr class="glossary-term">
 * element. Subsequent occurrences on the same page are left as plain text.
 *
 * IMPORTANT: seen Set is initialized here (not at module scope) — prevents
 * cross-page state pollution when Eleventy calls this for 1,348 species pages.
 *
 * @param {string} html - Full rendered HTML string for one page
 * @param {ReturnType<typeof buildTermMap>} termMap - Pre-built term map
 * @returns {string} Modified HTML string
 */
export function applyGlossaryTerms(html, termMap) {
  const root = parse(html);
  const seen = new Set(); // per-invocation — NEVER at module scope

  const elements = root.querySelectorAll('main p, main li, main h2, main h3');
  for (const el of elements) {
    // Skip taxonomy dl block and pagefind-ignored sections
    if (el.closest('dl') || el.closest('[data-pagefind-ignore]')) continue;

    // Collect text nodes before iterating (mutation invalidates live NodeList)
    const textNodes = [...el.childNodes].filter(n => n.nodeType === 3);
    for (const textNode of textNodes) {
      substituteTerms(textNode, termMap, seen);
    }
  }
  return root.toString();
}

/**
 * Replace the first unseen glossary term match in a single text node.
 * Only one substitution per text node per call; the outer loop handles
 * walking all text nodes.
 *
 * @param {import('node-html-parser').TextNode} textNode
 * @param {ReturnType<typeof buildTermMap>} terms
 * @param {Set<string>} seen - lower-cased terms already wrapped on this page
 */
function substituteTerms(textNode, terms, seen) {
  let rawText = textNode.rawText; // rawText preserves existing HTML entities

  for (const entry of terms) {
    if (seen.has(entry.lower)) continue;

    entry.regex.lastIndex = 0; // reset stateful gi regex before each exec
    const match = entry.regex.exec(rawText);
    if (!match) continue;

    seen.add(entry.lower);

    const before = rawText.slice(0, match.index);
    const matched = match[0]; // preserves original case from source text
    const after = rawText.slice(match.index + matched.length);

    const abbr =
      `<abbr class="glossary-term" ` +
      `title="${escapeHtml(entry.definition)}" ` +
      `data-definition="${escapeHtml(entry.definition)}" ` +
      `data-image-url="${escapeHtml(entry.imageUrl)}"` +
      `>${matched}</abbr>`;

    textNode.parentNode.exchangeChild(textNode, parse(before + abbr + after));
    break; // one substitution per text node per call
  }
}

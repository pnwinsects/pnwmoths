import { derivativeUrl } from './derivative-url.ts';
import { parse } from 'node-html-parser';
import type { TextNode } from 'node-html-parser';

export interface TermMapEntry {
  term: string;
  lower: string;
  definition: string;
  imageUrl: string;
  regex: RegExp;
}

export type GlossaryRow = {
  term: string;
  definition: string;
  image_filename?: string | null;
};

/**
 * Escape all regex metacharacters in a term string.
 * Required for terms like '1A+2A', 'W-mark', 'CuA1'.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Escape characters that are special inside HTML attribute values.
 * Seven definitions in glossary.csv contain double quotes (Anterior, Patagium,
 * Posterior, Quadrifid, Scale, Subreniform spot, Trifid) — must escape before
 * embedding in title="..." or data-definition="...".
 */
export function escapeHtml(str: string): string {
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
 */
export function buildTermMap(rows: GlossaryRow[], cdnBaseUrl: string): TermMapEntry[] {
  const sorted = [...rows].sort((a, b) => b.term.length - a.term.length);
  return sorted.map(row => ({
    term: row.term,
    lower: row.term.toLowerCase(),
    definition: row.definition || '',
    // The popover is max-width 260px, but this used to load the 1500x1800
    // original — the Optimizer's auto-WebP made it merely wasteful rather than
    // visibly slow. @376x450 covers the box with retina headroom (ADR 0022).
    imageUrl: row.image_filename
      ? derivativeUrl(cdnBaseUrl, `glossary/${row.image_filename}`, '376x450')
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
 */
export function applyGlossaryTerms(html: string, termMap: TermMapEntry[]): string {
  const root = parse(html);
  const seen = new Set<string>(); // per-invocation — NEVER at module scope

  const elements = root.querySelectorAll('main p, main li, main h2, main h3');
  for (const el of elements) {
    // Skip taxonomy dl block and pagefind-ignored sections
    if (el.closest('dl') || el.closest('[data-pagefind-ignore]')) continue;

    // Collect text nodes before iterating (mutation invalidates live NodeList)
    const textNodes = [...el.childNodes].filter(n => n.nodeType === 3);
    for (const textNode of textNodes) {
      substituteTerms(textNode as TextNode, termMap, seen);
    }
  }
  return root.toString();
}

/**
 * Replace all unseen glossary term matches in a single text node in one pass.
 * Advances a `pos` cursor through the raw text, finding the positionally-earliest
 * unseen term at each step and accumulating replacement HTML. One exchangeChild
 * call replaces the text node with the fully-substituted result.
 */
function substituteTerms(textNode: TextNode, terms: TermMapEntry[], seen: Set<string>): void {
  const rawText = textNode.rawText; // rawText preserves existing HTML entities
  let html = '';
  let pos = 0;
  let modified = false;

  while (pos <= rawText.length) {
    // Find the positionally-earliest unseen term match from current position.
    let earliest: { entry: TermMapEntry; match: RegExpExecArray } | null = null;

    for (const entry of terms) {
      if (seen.has(entry.lower)) continue;

      entry.regex.lastIndex = pos; // search from current position
      const match = entry.regex.exec(rawText);
      if (!match) continue;

      if (earliest === null || match.index < earliest.match.index) {
        earliest = { entry, match };
      }
    }

    if (!earliest) {
      // No more unseen terms — append remaining text and stop
      html += rawText.slice(pos);
      break;
    }

    const { entry, match } = earliest;
    html += rawText.slice(pos, match.index); // text before the match
    html +=
      `<abbr class="glossary-term" ` +
      `title="${escapeHtml(entry.definition)}" ` +
      `data-definition="${escapeHtml(entry.definition)}" ` +
      `data-image-url="${escapeHtml(entry.imageUrl)}"` +
      `>${match[0]}</abbr>`;
    seen.add(entry.lower);
    pos = match.index + match[0].length;
    modified = true;

    // Reset all regex lastIndex after each substitution to prevent stale state
    for (const e of terms) e.regex.lastIndex = 0;
  }

  if (modified) {
    if (!textNode.parentNode) return;
    textNode.parentNode.exchangeChild(textNode, parse(html));
  }
}

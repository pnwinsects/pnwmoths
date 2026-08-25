// src/_lib/social-meta.ts
// Description and share-image derivation for the sharing metadata in the <head>
// (issue #198). Pure functions only — the callers (eleventy.config.ts filters) own
// all filesystem access, so these stay trivially testable and safe to ship in the
// browser-facing _lib passthrough copy.
//
// The species factsheet prose is the best description we have — it opens with a
// one-sentence diagnosis written by a lepidopterist ("Abagrotis apposita is a
// mottled brick-red, medium-sized moth…"). We lift that first paragraph rather
// than hand-authoring 1,265 descriptions, and fall back to a taxonomy-derived
// sentence for the species that have no prose on file.

/** Upper bound on a meta description. Facebook truncates near 300, Google's SERP
 *  snippet near 160, and Bluesky's card near 200 — 200 is the useful middle. */
import { derivativeUrl, sourceUrl } from './derivative-url.ts';

export const MAX_DESCRIPTION_LENGTH = 200;

/** og:site_name, and the visible site name on the default share card. */
export const SITE_NAME = "Pacific Northwest Moths";

/** Description used for any page that does not set its own. */
export const SITE_DESCRIPTION =
  "Photographs, distribution maps, flight periods, and an interactive identification " +
  "key for the moths of Washington, Oregon, Idaho, Montana, and British Columbia.";

/** Alt text for the default share card (public/images/social-card.png). */
export const SITE_IMAGE_ALT =
  "Pacific Northwest Moths — a row of moth specimen photographs on black";

/**
 * Reduce inline Markdown to plain text suitable for a `content="…"` attribute.
 * Handles only what the species prose actually uses: emphasis, links, inline code,
 * images, and the occasional raw HTML tag. Block structure is the caller's problem
 * (see `firstParagraph`).
 */
export function stripMarkdown(markdown: string): string {
  return markdown
    // Images before links — ![alt](src) would otherwise leave a stray "!".
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Reference-style links: [text][ref] and bare footnote markers.
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    // Emphasis. Run the two-character forms first so **x** does not leave *x*.
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/(^|[\s(])_([^_]+)_(?=[\s.,;:)]|$)/g, "$1$2")
    // Unbalanced emphasis survives the pairs above. The legacy CMS left several
    // factsheets with stray markers around non-breaking spaces (`**Genus* *is a…`),
    // which renders wrong on the page and would put a literal "*" in the share card.
    // Nothing in the prose uses an asterisk for anything but emphasis.
    .replace(/\*+/g, "")
    .replace(/<[^>]+>/g, "")
    // Collapse all whitespace: the prose contains double spaces and hard wraps.
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * First substantive prose paragraph of a Markdown document — skipping headings,
 * blockquotes, lists, tables and anything too short to read as a sentence.
 * Returns null when the document has no such paragraph.
 */
export function firstParagraph(markdown: string): string | null {
  // Strip a YAML front-matter block if one is present. The shipped factsheets have
  // none, but prose arriving from elsewhere might.
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  for (const rawBlock of body.split(/\r?\n\s*\r?\n/)) {
    // A heading with no blank line after it shares a block with the prose beneath
    // it. Drop the heading lines rather than the paragraph they introduce —
    // otherwise a missing blank line silently costs the page its description.
    const trimmed = rawBlock.replace(/^(?:[ \t]*#{1,6}[^\n]*\r?\n)+/, "").trim();
    if (!trimmed) continue;
    // Headings, blockquotes, lists, tables, fences and HTML blocks are structure,
    // not description.
    if (/^([#>|]|[-*+]\s|\d+\.\s|```|<)/.test(trimmed)) continue;
    const text = stripMarkdown(trimmed);
    // A stub line like "None." is technically a paragraph but useless as a summary.
    if (text.length < 40) continue;
    return text;
  }
  return null;
}

/**
 * Trim `text` to at most `max` characters, preferring a sentence boundary and
 * falling back to a word boundary. Only the word-boundary cut gets an ellipsis —
 * a complete sentence should not look truncated.
 */
export function truncate(text: string, max: number = MAX_DESCRIPTION_LENGTH): string {
  if (text.length <= max) return text;
  // Last sentence terminator that fits and is followed by a space in the source.
  let sentenceEnd = -1;
  for (const match of text.matchAll(/[.!?](?=\s)/g)) {
    const index = match.index ?? -1;
    if (index >= max) break;
    sentenceEnd = index;
  }
  // Below 40% of the budget a "complete sentence" is really just a fragment
  // ("Adults are variable."), so prefer the longer word-boundary cut instead.
  if (sentenceEnd >= max * 0.4) return text.slice(0, sentenceEnd + 1);
  const lastSpace = text.lastIndexOf(" ", max);
  const cut = lastSpace > 0 ? lastSpace : max;
  return text.slice(0, cut).replace(/[\s,;:—-]+$/, "") + "…";
}

/**
 * Description derived from a factsheet's Markdown prose, or null when the file has
 * no usable paragraph.
 */
export function proseDescription(
  markdown: string,
  max: number = MAX_DESCRIPTION_LENGTH,
): string | null {
  const paragraph = firstParagraph(markdown);
  return paragraph === null ? null : truncate(paragraph, max);
}

/** The subset of a species row this module reads. */
export interface SpeciesLike {
  genus: string;
  species_display: string;
  common_name?: string | null;
  family?: string | null;
}

/**
 * Taxonomy-derived description for species with no prose on file. Deliberately
 * states what the page contains rather than inventing natural history we do not have.
 */
export function speciesFallbackDescription(sp: SpeciesLike): string {
  const name = `${sp.genus} ${sp.species_display}`;
  const common = sp.common_name ? ` (${sp.common_name})` : "";
  const family = sp.family ? ` of the family ${sp.family}` : "";
  return truncate(
    `${name}${common} — a moth${family} recorded in the Pacific Northwest. ` +
      `Specimen photographs, distribution map, and flight period.`,
  );
}

/** Meta description for a species factsheet: its prose if we have any, else taxonomy. */
export function speciesDescription(sp: SpeciesLike, prose: string | null | undefined): string {
  return prose ? truncate(prose) : speciesFallbackDescription(sp);
}

/** The subset of a `speciesPhotos` manifest entry this module reads. */
export interface HighResPhotoLike {
  high_res_available?: boolean;
  specimens?: { tiles_path: string }[];
}

/** The subset of an `images` row this module reads. */
export interface SpeciesImageLike {
  filename: string;
}

/**
 * Absolute CDN URL of the photo that best represents a species, or "" when the
 * species has none (callers fall back to the site card).
 *
 * Mirrors the branch order in src/species/species.njk: a high-res specimen wins,
 * otherwise the lead legacy photo (images rows arrive pre-sorted by weight).
 *
 * The high-res branch uses the pre-generated `@1200.jpg` derivative (ADR 0022).
 * JPEG rather than WebP is load-bearing, not cosmetic: the stored tile is WebP, and
 * WebP `og:image` is a coin flip off the major platforms — X documents support, but
 * Facebook documents only JPEG/PNG/GIF, and LinkedIn and WhatsApp are both
 * unreliable with it. 1200x800 at ~166KB sits inside every platform's ceiling.
 *
 * Having no query string is itself a fix. The old `?width=1200&format=jpg` URL was
 * correctly escaped as `&amp;` in the markup, but crawlers that fail to decode the
 * entity dropped `format=jpg` and got WebP back — 867 such requests in three days of
 * access log (#222). A static path has no `&` to misread. Legacy photos are already
 * JPEG, so the fallback stays an unmodified source.
 */
// One of seven display rules over data/images.csv — docs/reference/photo-display-rules.md.
export function speciesSocialImage(
  slug: string,
  highRes: HighResPhotoLike | undefined,
  images: SpeciesImageLike[] | undefined,
  cdnBaseUrl: string,
): string {
  const specimen = highRes?.high_res_available ? highRes.specimens?.[0] : undefined;
  if (specimen) return derivativeUrl(cdnBaseUrl, `${specimen.tiles_path}_thumbnail.webp`, '1200');
  const lead = images?.[0];
  if (lead) return sourceUrl(cdnBaseUrl, `${slug}/${lead.filename}`);
  return "";
}

/** Alt text for a species share image. Matches the on-page specimen alt text. */
export function speciesSocialImageAlt(sp: SpeciesLike): string {
  return `Specimen photograph of ${sp.genus} ${sp.species_display}`;
}

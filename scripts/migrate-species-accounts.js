/**
 * scripts/migrate-species-accounts.js
 *
 * Extracts species account text from the legacy Django CMS MySQL dump and
 * converts to Markdown files in src/content/species/{slug}.md.
 *
 * Chain:
 *   species_species.factsheet_id → cms_page.id
 *   cms_page_placeholders: page_id → placeholder_id
 *   cms_cmsplugin: placeholder_id → plugin_id (TextPlugin)
 *   cmsplugin_text: plugin_id → HTML body
 *
 * Usage:
 *   node scripts/migrate-species-accounts.js
 *
 * Override dump path:
 *   DUMP_PATH=/path/to/dump.sql node scripts/migrate-species-accounts.js
 *
 * Dry run (print slugs + markdown without writing):
 *   DRY_RUN=1 node scripts/migrate-species-accounts.js
 */

import { writeFileSync, existsSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseHtml } from 'node-html-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const DEFAULT_DUMP_PATH =
  '/Users/rainhead/dev/pnwinsects-app/pnwmoths_https/root/pnwmoths-mysqldump--20210201-123033.sql';
const DUMP_PATH = process.env.DUMP_PATH ?? DEFAULT_DUMP_PATH;
const DRY_RUN = process.env.DRY_RUN === '1';
const CONTENT_DIR = resolve(ROOT, 'src/content/species');

// ---------------------------------------------------------------------------
// Dump extraction
// ---------------------------------------------------------------------------

async function extractInsertLines(dumpPath, tableNames) {
  const tableSet = new Set(tableNames);
  const results = new Map();
  let inPnwmoths = false;

  const rl = createInterface({
    input: createReadStream(dumpPath, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line === 'USE `pnwmoths`;') { inPnwmoths = true; continue; }
    if (line === 'USE `pnwsawflies`;') break;
    if (!inPnwmoths) continue;

    if (line.startsWith('INSERT INTO `')) {
      const m = line.match(/^INSERT INTO `([^`]+)` VALUES /);
      if (m && tableSet.has(m[1])) {
        if (results.has(m[1])) {
          const valuesStart = line.indexOf(' VALUES ') + ' VALUES '.length;
          let prev = results.get(m[1]);
          if (prev.endsWith(';')) prev = prev.slice(0, -1);
          results.set(m[1], prev + ',' + line.slice(valuesStart));
        } else {
          results.set(m[1], line);
        }
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

/**
 * Parse species_species INSERT.
 * (id, genus, species, common_name|NULL, authority_id|NULL, noc_id|NULL, factsheet_id|NULL)
 * Returns Map<factsheet_page_id → slug>
 */
function parseSpeciesSpecies(line) {
  const map = new Map();
  const re = /\((\d+),'([^'\\]*)','([^'\\]*)',(?:'(?:[^'\\]|\\.)*'|NULL),(?:\d+|NULL),(?:'(?:[^'\\]|\\.)*'|NULL),(?:(\d+)|NULL)\)/g;
  for (const m of line.matchAll(re)) {
    if (m[4]) {
      const slug = `${m[2]}-${m[3]}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      map.set(m[4], slug);
    }
  }
  return map;
}

/**
 * Parse cms_page_placeholders INSERT: (id, page_id, placeholder_id)
 * Returns Map<page_id → Set<placeholder_id>>
 */
function parsePagePlaceholders(line) {
  const map = new Map();
  for (const m of line.matchAll(/\(\d+,(\d+),(\d+)\)/g)) {
    const pageId = m[1], phId = m[2];
    if (!map.has(pageId)) map.set(pageId, new Set());
    map.get(pageId).add(phId);
  }
  return map;
}

/**
 * Parse cms_cmsplugin INSERT: (id, placeholder_id|NULL, parent_id|NULL, ...)
 * Returns Map<placeholder_id → Set<plugin_id>> for all plugins with a placeholder.
 */
function parseCmsPlugins(line) {
  const map = new Map();
  // Only need id and placeholder_id (first two positional fields after VALUES)
  const re = /\((\d+),(\d+|NULL),/g;
  for (const m of line.matchAll(re)) {
    const pluginId = m[1], phId = m[2];
    if (phId !== 'NULL') {
      if (!map.has(phId)) map.set(phId, new Set());
      map.get(phId).add(pluginId);
    }
  }
  return map;
}

/**
 * Parse cmsplugin_text INSERT: (cmsplugin_ptr_id, body)
 * The body may contain escaped quotes and newlines.
 * Returns Map<plugin_id → html_body>
 */
function parsePluginText(line) {
  const map = new Map();
  const valuesStart = line.indexOf(' VALUES ') + ' VALUES '.length;
  const data = line.slice(valuesStart);

  let i = 0;
  while (i < data.length) {
    // Find opening paren
    while (i < data.length && data[i] !== '(') i++;
    if (i >= data.length) break;
    i++; // skip '('

    // Parse id
    let idStr = '';
    while (i < data.length && /\d/.test(data[i])) { idStr += data[i++]; }
    if (!idStr || data[i] !== ',') { continue; }
    i++; // skip ','

    // Parse quoted body
    if (data[i] !== "'") { continue; }
    i++; // skip opening quote
    let body = '';
    while (i < data.length) {
      if (data[i] === '\\') {
        i++;
        const ch = data[i++];
        if (ch === "'") body += "'";
        else if (ch === '\\') body += '\\';
        else if (ch === 'n') body += '\n';
        else if (ch === 'r') body += '\r';
        else body += ch;
      } else if (data[i] === "'") {
        i++; // skip closing quote
        break;
      } else {
        body += data[i++];
      }
    }
    // Skip closing paren
    while (i < data.length && data[i] !== ')') i++;
    i++; // skip ')'

    map.set(idStr, body);
    if (data[i] === ',') i++;
  }
  return map;
}

// ---------------------------------------------------------------------------
// Encoding fix: latin1-read bytes → UTF-8 string
// ---------------------------------------------------------------------------

/**
 * Re-decode a latin1-read string as UTF-8.
 * MySQL dumps are typically UTF-8 but Node reads them as latin1 byte-by-byte.
 * This converts the character codes back to bytes and decodes as UTF-8.
 */
function fixEncoding(str) {
  try {
    const bytes = Buffer.from(str, 'binary');
    return bytes.toString('utf8');
  } catch {
    return str; // fallback: return as-is
  }
}

// ---------------------------------------------------------------------------
// HTML → Markdown converter
// ---------------------------------------------------------------------------

function htmlToMarkdown(html) {
  const root = parseHtml(html);

  function nodeToMd(node) {
    if (node.nodeType === 3) { // text node
      return node.text;
    }
    const tag = node.rawTagName?.toLowerCase();
    const inner = () => node.childNodes.map(nodeToMd).join('');

    switch (tag) {
      case 'h1': return `# ${inner().trim()}\n\n`;
      case 'h2': return `## ${inner().trim()}\n\n`;
      case 'h3': return `### ${inner().trim()}\n\n`;
      case 'h4': return `#### ${inner().trim()}\n\n`;
      case 'h5': return `##### ${inner().trim()}\n\n`;
      case 'h6': return `###### ${inner().trim()}\n\n`;
      case 'p':  {
        const text = inner().trim();
        return text ? `${text}\n\n` : '';
      }
      case 'br': return '\n';
      case 'em':
      case 'i':  return `*${inner()}*`;
      case 'strong':
      case 'b':  return `**${inner()}**`;
      case 'a': {
        const href = node.getAttribute('href') ?? '';
        const text = inner();
        return href ? `[${text}](${href})` : text;
      }
      case 'ul': {
        const items = node.querySelectorAll(':scope > li').map(li => `- ${li.text.trim()}`);
        return items.length ? items.join('\n') + '\n\n' : '';
      }
      case 'ol': {
        const items = node.querySelectorAll(':scope > li').map((li, idx) => `${idx + 1}. ${li.text.trim()}`);
        return items.length ? items.join('\n') + '\n\n' : '';
      }
      case 'li': return ''; // handled by ul/ol
      default: return inner();
    }
  }

  let md = root.childNodes.map(nodeToMd).join('');

  // Remove leading h1 headings (species name belongs in page title, not content)
  md = md.replace(/^# .+\n\n?/m, '').trim();

  // Collapse excessive blank lines
  md = md.replace(/\n{3,}/g, '\n\n');

  return md.trim() + '\n';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Reading dump: ${DUMP_PATH}`);

  const lines = await extractInsertLines(DUMP_PATH, [
    'species_species',
    'cms_page_placeholders',
    'cms_cmsplugin',
    'cmsplugin_text',
  ]);

  const factsheetToSlug = lines.has('species_species')
    ? parseSpeciesSpecies(lines.get('species_species'))
    : new Map();

  const pageToPlaceholders = lines.has('cms_page_placeholders')
    ? parsePagePlaceholders(lines.get('cms_page_placeholders'))
    : new Map();

  const placeholderToPlugins = lines.has('cms_cmsplugin')
    ? parseCmsPlugins(lines.get('cms_cmsplugin'))
    : new Map();

  const pluginTexts = lines.has('cmsplugin_text')
    ? parsePluginText(lines.get('cmsplugin_text'))
    : new Map();

  console.log(`Species with factsheet pages: ${factsheetToSlug.size}`);
  console.log(`Text plugin entries: ${pluginTexts.size}`);

  let written = 0;
  let skipped = 0;

  // Walk: species → page → placeholders → plugins → text
  for (const [factsheetPageId, slug] of factsheetToSlug) {
    const placeholders = pageToPlaceholders.get(factsheetPageId);
    if (!placeholders || placeholders.size === 0) continue;

    const htmlParts = [];
    for (const phId of placeholders) {
      const plugins = placeholderToPlugins.get(phId);
      if (!plugins) continue;
      for (const pluginId of plugins) {
        const body = pluginTexts.get(pluginId);
        if (body && body.trim()) {
          htmlParts.push(fixEncoding(body));
        }
      }
    }

    if (htmlParts.length === 0) continue;

    const combinedHtml = htmlParts.join('\n');
    const markdown = htmlToMarkdown(combinedHtml);

    if (!markdown.trim()) continue;

    const outputPath = resolve(CONTENT_DIR, `${slug}.md`);

    if (existsSync(outputPath)) {
      console.log(`[exists] ${slug}`);
      skipped++;
      continue;
    }

    console.log(`[write] ${slug}`);
    if (DRY_RUN) {
      console.log('--- START ---');
      console.log(markdown.slice(0, 500));
      if (markdown.length > 500) console.log(`  ... (${markdown.length} chars total)`);
      console.log('--- END ---\n');
    } else {
      writeFileSync(outputPath, markdown, 'utf8');
    }
    written++;
  }

  console.log(`\nResult: ${written} to write, ${skipped} already exist`);
  if (DRY_RUN) console.log('(dry run — no files written)');
}

main().catch(err => { console.error(err); process.exit(1); });

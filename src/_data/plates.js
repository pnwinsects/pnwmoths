/**
 * Plate data — reads the Zoomify tile directories from the legacy app and
 * generates the metadata array used to build photographic plate pages.
 *
 * Source: /Users/rainhead/dev/pnwinsects-app/.../media/plates_z/
 * Each subdirectory is one plate and contains:
 *   ImageProperties.xml  — width/height for OpenSeadragon
 *   TileGroup0/          — 256px Zoomify tiles
 *
 * Override the source path with the PLATES_Z_SOURCE env var.
 */

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_SOURCE = '/Users/rainhead/dev/pnwinsects-app/pnwmoths_https/usr/local/www/pnwmoths/django/pnwmoths/static/media/plates_z';
const PLATES_Z_SOURCE = process.env.PLATES_Z_SOURCE ?? DEFAULT_SOURCE;

function parseDirName(dirName) {
  // Strip leading year prefix ("2021 ")
  let name = dirName.replace(/^2021\s+/i, '');
  // Strip trailing "NEW" annotation (with or without preceding space/paren)
  name = name.replace(/\s*new\s*$/i, '').trim();

  const match = name.match(/^PLATE\s+(\d+)\s+(.+)$/i);
  if (!match) return null;
  return { number: match[1], family: match[2].trim() };
}

function toSlug(number, family) {
  const familySlug = family
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  return `plate-${number}-${familySlug}`;
}

// Subfamily/tribe descriptions from the original pnwmoths.biol.wwu.edu plate index.
const DESCRIPTIONS = {
  "3":  "Hemileucinae",
  "4":  "Saturniinae I",
  "5":  "Saturniinae II",
  "6":  "Saturniinae III",
  "7":  "Sphinginae I",
  "8":  "Sphinginae II",
  "9":  "Smerinthinae I",
  "10": "Smerinthinae II",
  "11": "Macroglossinae",
  "12": "Pygaerinae & Notodontinae I",
  "13": "Notodontinae II, Phalerinae, Heterocampinae, & Dioptinae",
  "14": "Lymantriinae",
  "15": "Arctiinae I: Arctiini I",
  "16": "Arctiinae II: Arctiini II",
  "17": "Arctiinae III: Arctiini III",
  "18": "Arctiinae IV: Arctiini IV",
  "19": "Arctiinae V: Arctiini V",
  "20": "Herminiinae",
  "21": "Hypeninae",
  "22": "Rivulinae, Scoliopteryginae, Scolecocampinae, & Boletobiinae",
  "23": "Toxocampinae; Erebinae I: Thermesiinae & Catocalini I",
  "24": "Erebinae II: Catocalini II",
  "25": "Erebinae III: Catocalini III",
  "26": "Erebinae IV: Catocalini IV",
  "27": "Erebinae V: Melipotini I",
  "28": "Erebinae VI: Melipotini II & Euclidiini I",
  "29": "Erebinae VII: Euclidiini II & Omopterini",
  "30": "Plusiinae I",
  "31": "Plusiinae II",
  "32": "Plusiinae III",
  "33": "Eustrotiinae & Acontiinae",
  "34": "Pantheinae & Raphiinae",
  "35": "Acronictinae I",
  "36": "Acronictinae II",
  "37": "Metoponiinae & Cuculliinae I",
  "38": "Cuculliinae II",
  "39": "Amphipyrinae I",
  "40": "Amphipyrinae II & Oncocnemidinae I",
  "41": "Oncocnemidinae II",
  "42": "Oncocnemidinae III",
  "43": "Oncocnemidinae IV",
  "44": "Agaristinae, Condicinae, & Heliothinae I",
  "45": "Heliothinae II",
  "46": "Bryophilinae & Noctuinae I (Prodeniini & Elaphriini)",
  "47": "Noctuinae II: Caradrinini & Actinotiini",
  "48": "Noctuinae III: Phlogophorini & Apameini I",
  "49": "Noctuinae IV: Apameini II",
  "50": "Noctuinae V: Apameini III",
  "51": "Noctuinae VI: Apameini IV",
  "52": "Noctuinae VII: Apameini V",
  "53": "Noctuinae VIII: Apameini VI",
  "54": "Noctuinae IX: Apameini VII & Arzamini",
  "55": "Noctuinae X: Xylenini I",
  "56": "Noctuinae XI: Xylenini II",
  "57": "Noctuinae XII: Xylenini III",
  "58": "Noctuinae XIII: Xylenini IV",
  "59": "Noctuinae XIV: Xylenini V",
  "60": "Noctuinae XV: Xylenini VI",
  "61": "Noctuinae XVI: Xylenini VII",
  "62": "Noctuinae XVII: Xylenini VIII",
  "63": "Noctuinae XVIII: Xylenini IX & Orthosiini I",
  "64": "Noctuinae XIX: Orthosiini II",
  "65": "Noctuinae XX: Orthosiini III & Tholerini",
  "66": "Noctuinae XXI: Hadenini I",
  "67": "Noctuinae XXII: Hadenini II",
  "68": "Noctuinae XXIII: Hadenini III",
  "69": "Noctuinae XXIV: Hadenini IV",
  "70": "Noctuinae XXV: Leucaniini",
  "71": "Noctuinae XXVI: Eriopygini I",
  "72": "Noctuinae XXVII: Eriopygini II",
  "73": "Noctuinae XXVIII: Eriopygini III",
  "74": "Noctuinae XXIX: Eriopygini IV",
  "75": "Noctuinae XXX: Eriopygini V",
  "76": "Noctuinae XXXI: Noctuini I",
  "77": "Noctuinae XXXII: Noctuini II",
  "78": "Noctuinae XXXIII: Noctuini III",
  "79": "Noctuinae XXXIV: Noctuini IV",
  "80": "Noctuinae XXXV: Noctuini V",
  "81": "Noctuinae XXXVI: Noctuini VI",
  "82": "Noctuinae XXXVII: Noctuini VII",
  "83": "Noctuinae XXXVIII: Noctuini VIII",
  "84": "Noctuinae XXXIX: Noctuini IX",
  "85": "Noctuinae XL: Noctuini X",
  "86": "Noctuinae XLI: Noctuini XI",
  "87": "Noctuinae XLII: Noctuini XII",
  "88": "Noctuinae XLIII: Noctuini XIII",
  "89": "Noctuinae XLIV: Noctuini XIV",
  "90": "Noctuinae XLV: Noctuini XV",
  "91": "Noctuinae XLVI: Noctuini XVI",
  "92": "Noctuinae XLVII: Noctuini XVII",
  "93": "Noctuinae XLVIII: Noctuini XVIII",
  "94": "Noctuinae XLIX: Noctuini XIX",
  "95": "Noctuinae L: Noctuini XX",
  "96": "Noctuinae LI: Noctuini XXI",
};

async function readDimensions(dirPath) {
  const xml = await readFile(join(dirPath, 'ImageProperties.xml'), 'utf8');
  const wMatch = xml.match(/WIDTH="(\d+)"/);
  const hMatch = xml.match(/HEIGHT="(\d+)"/);
  return {
    width: wMatch ? parseInt(wMatch[1], 10) : 2400,
    height: hMatch ? parseInt(hMatch[1], 10) : 3000,
  };
}

export default async function () {
  if (!existsSync(PLATES_Z_SOURCE)) {
    console.warn(`[plates] Source not found: ${PLATES_Z_SOURCE} — skipping plate data`);
    return [];
  }

  const entries = await readdir(PLATES_Z_SOURCE, { withFileTypes: true });
  const dirs = entries.filter(e => e.isDirectory());

  // Collect all plates; when two dirs map to the same slug, prefer the "NEW" one
  // (e.g. "PLATE 49 ... NEW" supersedes "2021 PLATE 49 ...").
  const bySlug = new Map();
  for (const dir of dirs) {
    const parsed = parseDirName(dir.name);
    if (!parsed) {
      console.warn(`[plates] Could not parse directory name: ${dir.name}`);
      continue;
    }
    const { number, family } = parsed;
    const slug = toSlug(number, family);
    const isNew = /new\s*$/i.test(dir.name);
    const existing = bySlug.get(slug);

    if (!existing || isNew) {
      const dirPath = join(PLATES_Z_SOURCE, dir.name);
      const { width, height } = await readDimensions(dirPath);
      bySlug.set(slug, {
        number,
        family,
        title: `Plate ${number}: ${family.replace(/\s*\([^)]*\)\s*$/, '').trim()}`,
        description: DESCRIPTIONS[number] ?? null,
        slug,
        dirName: dir.name,
        width,
        height,
      });
    }
  }

  const plates = Array.from(bySlug.values());

  // Sort by numeric plate number (pad-insensitive)
  plates.sort((a, b) => {
    const n = parseInt(a.number, 10) - parseInt(b.number, 10);
    return n !== 0 ? n : a.family.localeCompare(b.family);
  });

  return plates;
}

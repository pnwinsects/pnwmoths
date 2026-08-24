// The advisory reports listed at /curation/ (issue #332).
//
// ONE manifest, two consumers: src/curation/index.njk renders it, and
// scripts/copy-curation-reports.ts copies the files it names into _site/curation/.
// They must not drift — a report listed but not copied is a 404 on the page, and a
// report copied but not listed is a file nobody knows exists. Both read this array,
// and `href` is DERIVED from `source` rather than restated, so the link and the copy
// destination are the same string by construction.
//
// Every report here is advisory: it reports a disagreement or a gap for a human to
// judge, and nothing in the build reads it back. That is why the page exists at all —
// a report nobody can reach has not been made.
//
// Adding a report: add an entry, and if its source is a repo file, that is all — the
// copy step picks it up. Keep `question` in the curator's terms, not the pipeline's.
import { basename } from 'node:path';

/** Who a report is addressed to. Drives the ordering and the two sections on the page. */
export type ReportAudience = 'curation' | 'engineering';

/** One downloadable file belonging to a report. */
export interface ReportFile {
  /**
   * Repo-relative path copied into `_site/curation/` by the build, or null when a
   * build step already writes the file into `_site/` under its own name.
   */
  source: string | null;
  /** Site-absolute path, before `pathPrefix`. Derived from `source` when there is one. */
  href: string;
  /** Filename shown as the link text. */
  label: string;
}

/** Background reading for a report — an ADR, a runbook, an issue. */
export interface ReportReference {
  label: string;
  /** Repo-relative path (rendered as a GitHub blob link) or an absolute URL. */
  url: string;
}

export interface CurationReport {
  /** Stable id; also the heading anchor on /curation/. */
  id: string;
  title: string;
  audience: ReportAudience;
  /** The single question this report answers, phrased as a question. */
  question: string;
  /** What one row is, and what to look at first. */
  body: string;
  /** What produces it, and how often. */
  regenerated: string;
  files: ReportFile[];
  see: ReportReference[];
}

/** A report file copied out of the repo into `_site/curation/`. */
function fromRepo(source: string): ReportFile {
  const name = basename(source);
  return { source, href: `/curation/${name}`, label: name };
}

/** A report file a build step already emits into `_site/`, linked where it lands. */
function alreadyEmitted(href: string): ReportFile {
  return { source: null, href, label: basename(href) };
}

/**
 * Curator-facing reports first, then engineering ones; within each group, most
 * likely to need an answer first. The page renders them in exactly this order.
 */
const reports: CurationReport[] = [
  {
    id: 'cdn-inventory',
    title: 'CDN inventory: objects nothing accounts for',
    audience: 'curation',
    question: 'Which photographs are on the CDN that the catalogue does not know about, and which catalogued photographs are not on the CDN?',
    body: 'One row per finding, in both directions. An unaccounted-for object is usually a photograph that was uploaded and never registered in <code>data/images.csv</code> — it exists, nothing shows it, and only the curator can say which species it belongs to. A missing object is the opposite: a row the site trusts, pointing at nothing. The <code>shape</code> column groups findings by kind; <code>detail</code> says what was expected.',
    regenerated: 'Manually, by a maintainer: <code>npm run cdn:inventory</code>. Needs the storage-zone password and the network, so it is not part of the build. Nothing in it is ever acted on automatically — no build reads it, and nothing deletes from the zone.',
    files: [fromRepo('data/cdn-inventory-report.csv')],
    see: [
      { label: 'ADR 0036 — CDN inventory by accountability', url: 'docs/adr/0036-cdn-inventory-by-accountability.md' },
      { label: 'Runbook: auditing the CDN', url: '_instructions/AUDITING_THE_CDN.md' },
      { label: 'Issue #277', url: 'https://github.com/pnwinsects/pnwmoths/issues/277' },
    ],
  },
  {
    id: 'cdn-duplicates',
    title: 'CDN duplicates: the same photograph stored twice',
    audience: 'curation',
    question: 'Which photographs exist under more than one path on the CDN, and is the copy still in use the right one?',
    body: 'Rows are grouped by SHA256, so every row in a group is byte-identical to the others — the same photograph, not two photographs of the same specimen. These accumulate because genus renames and slug fixes copy an image to its new home and never delete the old one. <code>accounted_by</code> says which copy the site actually uses; the rest are leftovers awaiting a ruling.',
    regenerated: 'Manually, alongside the inventory: <code>npm run cdn:inventory</code>.',
    files: [fromRepo('data/cdn-duplicates-report.csv')],
    see: [
      { label: 'ADR 0036 — CDN inventory by accountability', url: 'docs/adr/0036-cdn-inventory-by-accountability.md' },
      { label: 'ADR 0008 — deploys are additive and never delete', url: 'docs/adr/0008-deploy-bunny-additive.md' },
    ],
  },
  {
    id: 'species-audit',
    title: 'Species audit: what each species has, and whether it is published',
    audience: 'curation',
    question: 'For every species in the catalogue — does it have occurrence records, is its page published, and is it reachable through Identify?',
    body: 'One row per species in <code>data/species.csv</code>, with three flags reconciling four separate sources. <code>has_records</code> is true if any occurrence record joins to it; <code>visible</code> is true if its family is neither withheld nor blank and it is not on the deny-list; <code>in_key</code> is true if the identification key can reach it. The interesting rows are the mixed ones — a published species with no records, or a species with plenty of records that Identify cannot reach.',
    regenerated: 'Every build (<code>npm run build:species-audit</code>), from the committed data.',
    files: [alreadyEmitted('/species-audit.csv')],
    see: [
      { label: 'ADR 0015 — data-driven gating', url: 'docs/adr/0015-data-driven-gating.md' },
    ],
  },
  {
    id: 'key-coverage',
    title: 'Identification key coverage: key species with no page',
    audience: 'curation',
    question: 'Which species in the Lucid key have no species account on this site?',
    body: 'A JSON summary: how many of the key\'s binomials matched a species page, and the full list of those that did not, each with the slug that was tried and why the match failed. An unmatched binomial is excluded from Identify\'s results but its key data is kept, so adding the page is enough to bring it back — no key edit is needed. Most entries are names the site spells differently, or species the site does not yet carry.',
    regenerated: 'Every build (<code>npm run build:key</code>), from the committed key source.',
    files: [fromRepo('data/key-coverage-report.json')],
    see: [
      { label: 'ADR 0012 — Identify is a static key', url: 'docs/adr/0012-identify-static-key.md' },
    ],
  },
  {
    id: 'inat-sync',
    title: 'iNaturalist sync: observations that were not imported',
    audience: 'curation',
    question: 'Which observations in the PNWMoths iNaturalist project did the last sync decline to import, and why?',
    body: 'One row per observation the sync considered and did not admit, with its <code>outcome</code> and a link to the observation. Reasons include an identification the catalogue does not carry, a record already curated by hand, and coordinates the project obscures. Rewritten in full every run, so it always describes the most recent sync and nothing earlier.',
    regenerated: 'Manually, when the project is synced: <code>npm run inat:sync</code>.',
    files: [fromRepo('data/inat-sync-report.csv')],
    see: [
      { label: 'ADR 0026 — iNaturalist project sync', url: 'docs/adr/0026-inaturalist-project-sync.md' },
      { label: 'Runbook: syncing iNaturalist', url: '_instructions/SYNCING_INATURALIST.md' },
    ],
  },
  {
    id: 'records-district-audit',
    title: 'District audit: stated county against derived district',
    audience: 'engineering',
    question: 'Where does the county someone typed on a record disagree with the district its coordinates fall in?',
    body: 'One row per occurrence record, comparing the human-entered county (resolved to a district) against the district derived from the record\'s coordinates. Rows are sorted worst-first by tier: <code>far-mismatch</code>, then <code>adjacent-and-close</code>, then <code>outside-all-boundaries</code>, then <code>same</code>. A mismatch never fails the build — it is a disagreement between two fallible sources, not an error. The summary JSON carries the per-tier counts.',
    regenerated: 'Every build (<code>npm run build:records-district-audit</code>), from the committed records and the committed derived-district artifact.',
    files: [
      alreadyEmitted('/records-district-audit.csv'),
      alreadyEmitted('/records-district-audit-summary.json'),
    ],
    see: [
      { label: 'ADR 0014 — districts are derived offline and written back', url: 'docs/adr/0014-districts-offline-writeback.md' },
      { label: 'Runbook: assigning districts', url: '_instructions/ASSIGNING_DISTRICTS.md' },
    ],
  },
  {
    id: 'coord-fill',
    title: 'Coordinate district fill: what the last fill decided',
    audience: 'engineering',
    question: 'For each record whose district was filled from its coordinates, what was decided and how far off was it?',
    body: 'One row per record the fill examined, whatever the outcome — <code>assigned-contained</code>, <code>assigned-fallback</code>, <code>unassigned</code>, and the two no-coordinate cases. <code>district_id_before</code> and <code>district_id_after</code> show what changed; <code>distance_km</code> shows how far outside a boundary a fallback assignment had to reach. Curator-entered values are never overwritten, so a row with an unchanged <code>district_id</code> means the fill deferred.',
    regenerated: 'Manually, when records are added: <code>node scripts/fill-district-from-coords.ts</code>. Committed with the records it changed.',
    files: [fromRepo('data/coord-fill-report.csv')],
    see: [
      { label: 'Runbook: assigning districts', url: '_instructions/ASSIGNING_DISTRICTS.md' },
    ],
  },
  {
    id: 'legacy-rejoin',
    title: 'Legacy county rejoin: filling blank counties from the old site',
    audience: 'engineering',
    question: 'Which blank county fields did the legacy backfill fill, and from what?',
    body: 'One row per record the backfill examined — around 95,000 of them, so this is a large file. <code>county_before</code> and <code>county_after</code> show what was filled, and <code>outcome</code> says whether the legacy site could be matched at all. Only previously-blank counties were filled; anything a curator had entered was left alone.',
    regenerated: 'Manually, and rarely: <code>node scripts/backfill-legacy-county.ts</code>. In practice this is a historical record of a one-off backfill.',
    files: [fromRepo('data/legacy-rejoin-report.csv')],
    see: [
      { label: 'Runbook: assigning districts', url: '_instructions/ASSIGNING_DISTRICTS.md' },
    ],
  },
  {
    id: 'records-bad',
    title: 'Rejected records: rows that failed validation',
    audience: 'engineering',
    question: 'Which occurrence records were rejected outright, and can they be repaired?',
    body: 'Records that failed validation, in the same columns as <code>records.csv</code> so a repaired row can be moved straight back. These are not in the site\'s data and do not appear on any map or phenology chart.',
    regenerated: 'Written when validation rejects a row; kept in the repo so nothing is silently dropped.',
    files: [fromRepo('data/records-bad.csv')],
    see: [],
  },
  {
    id: 'records-bad-coords',
    title: 'Suspect coordinates: records outside the region',
    audience: 'engineering',
    question: 'Which records have coordinates that cannot be right?',
    body: 'Records whose coordinates fall outside the covered region (latitude 42–60, longitude −139 to −110). Most are transposed latitude and longitude and are recoverable by swapping the two — the pair is usually recognisable at a glance. Held out of the site until someone rules on them.',
    regenerated: 'Manually, by the recovery script: <code>node scripts/recover-clipped-bc-records.ts</code>.',
    files: [fromRepo('data/records-bad-coords.csv')],
    see: [],
  },
];

/** Every report, curator-facing first. Consumed by src/curation/index.njk. */
export const curationReports: CurationReport[] = reports;

/** One copy instruction: repo-relative source, `_site`-relative destination. */
export interface CopyInstruction {
  source: string;
  /** `_site`-relative, i.e. the `href` without its leading slash. */
  dest: string;
}

/**
 * The files scripts/copy-curation-reports.ts must place into `_site/`. Files a build
 * step already emits into `_site/` are excluded — they are linked where they land.
 */
export function copyPlan(): CopyInstruction[] {
  return reports
    .flatMap((report) => report.files)
    .filter((file): file is ReportFile & { source: string } => file.source !== null)
    .map((file) => ({ source: file.source, dest: file.href.replace(/^\//, '') }));
}

/** Eleventy global data: `curationReports` in templates. */
export default function (): CurationReport[] {
  return reports;
}

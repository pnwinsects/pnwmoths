# Task: Fix Broken Links From the Old Site

## What This Changes

- `src/_lib/legacy-redirects.ts` — the table that maps old pnwmoths.biol.wwu.edu URLs to pages on this site
- `data/species-redirects.csv` — used instead, when an old **species** page just needs to point at a species we renamed
- **No** uploads, **no** API keys, **no** analytics account. Everything here is an edit in the repo.

## Background

Links to the old WWU site are handled by `/redirect.html`, which looks the old address up in a
table and sends the visitor to the matching page here. When the table has no entry for an address,
the visitor gets dropped on the Browse page with "we couldn't find an exact match."

Those failures are counted every night from the CDN's own access logs and listed on the
[site analytics page](https://moths.pnwinsects.org/analytics/) under **Unmapped Legacy Links**.
That list is your to-do list: each row is an old address people are still following that nobody has
told the site about yet.

## Before You Start

You will need:
- **Node 24** — matches `.nvmrc`. Verify with `node --version`
- A text editor

## Steps

### 1. Read the list

Open https://moths.pnwinsects.org/analytics/ and scroll to **Unmapped Legacy Links**. Each row shows:

| Column | Meaning |
|---|---|
| Old URL | The address on the old site that people are asking for |
| Linked from | The site still sending people there, when it told us (blank means it didn't) |
| Hits | How many times it was requested in the period selected at the top of the page |

Work top-down: the highest hit count is the most people helped per edit.

There is a second table, **Top 404s**, listing addresses that fail outright. Those never reach the
redirect handler at all, and usually mean either an old address nobody has routed to
`/redirect.html`, or a page on this site someone is linking to incorrectly.

Nothing appears in either table until the nightly job has collected a day of logs. Empty tables mean
"nothing missed" — that's the goal state.

### 2. Work out where the old address should go

Open the old URL and decide what the visitor was after.

- A **species page** — find the species in `data/species.csv`. The address you want is
  `/species/{slug}/`, where the slug is the genus and species lowercased and joined with a hyphen
  (e.g. *Acronicta americana* → `acronicta-americana`).
- **Some other page** (glossary, contact, plates…) — find the equivalent page on this site and note
  its address.
- **Nothing meaningful** (a Django admin path, a bot probing for `/wp-login.php`) — leave it alone.
  Not every miss deserves a mapping, and adding junk to the table only makes it harder to read.

### 3a. If it's a species we renamed

Add a row to `data/species-redirects.csv`:

```csv
old_slug,new_slug,reason
eilema-bicolor,manulea-bicolor,eilema-bicolor->manulea-bicolor canonical genus migration (#155)
```

This is the better option whenever both halves are species slugs: it also builds a permanent
redirect page at `/species/{old_slug}/`, so the old address works directly, not only through
`/redirect.html`. See [CURATING_SPECIES_SYNONYMS.md](CURATING_SPECIES_SYNONYMS.md) for the wider
taxonomy-change workflow.

### 3b. If it's an old species name the old site used

Open `src/_lib/legacy-redirects.ts` and add an entry to `SYNONYMS`, old slug on the left:

```ts
export const SYNONYMS: Record<string, string> = {
  'capsula-subflava': 'globia-subflava',
};
```

### 3c. If it's any other page

Open `src/_lib/legacy-redirects.ts` and add an entry to `STATIC_MAP`. The key is the old path with
slashes at both ends; the value is the page here, **without** a leading slash and naming
`index.html` explicitly:

```ts
'/about-moths/moth-anatomy/': 'glossary/index.html',
```

### 4. Check your work

```sh
npm test
```

The tests in `src/_lib/legacy-redirects.test.ts` cover the mapping table. If you added something to
`data/species-redirects.csv`, `src/_data/speciesRedirects.test.ts` also checks that the old slug
isn't a live species and isn't already listed.

Then commit and push as usual. The change goes live with the next deploy, and the entry should
disappear from the analytics list within a day or two.

## Notes

- The list only covers the last few days at a time — the CDN keeps its logs for 72 hours, and the
  nightly job is what preserves them. Misses from before this was set up cannot be recovered.
- A miss doesn't mean the visitor saw an error page. They were sent to Browse, which is a poor
  answer but not a broken one.
- One address may appear in the list for a day or two after you fix it, until the older days scroll
  out of the selected period.

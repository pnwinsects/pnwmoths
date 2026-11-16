# 0060. The storage zone keeps a second copy of every file in New York

**Status:** Accepted (2026-11-16)
Refines [0008](0008-deploy-bunny-additive.md)

## Context

The whole site, the photographs and the image tiles live in one Bunny storage zone (`pnwmoths`, id 1475536), which kept its files in a single region, Los Angeles ([0008](0008-deploy-bunny-additive.md)). The CDN fetches from that zone any file it doesn't already have cached.

On 16 November 2026 Bunny's LA storage failed, and the site went down with it:

- **From about 03:00 UTC**, every file that wasn't already cached returned 503 with `errorcode: 118`, from every Bunny edge server we tried in North America, Europe and Asia. Only files cached earlier, such as `robots.txt`, still loaded. The pull zone's own hourly statistics show it fetching 20–40 MB an hour from storage the day before, 2.9 MB in the 03:00 hour and nothing after 04:00.
- **Hours later, after the 503s stopped,** about a quarter of files returned 502 with `errorcode: 100`, even when fetched straight from storage with the storage password. In a sample of 40 pages, 10 failed. The failures included `/browse/` and the search index's metadata file, so Browse and search were both down.

Nothing on our side caused it. The last deploy had run twelve hours earlier and only added six files, and the pull zone, the storage zone and the account balance were all in order. Bunny's support (ticket 445322) confirmed a problem at their LA storage location and recommended replicating the zone to at least one other region.

## Decision

The maintainer enabled replication to **New York (NY)** on 2026-11-16. LA stays the primary region. Uploads still write to LA, and Bunny copies each file to NY.

NY was chosen because most visitors are in North America, and a second US region keeps a nearby copy for them when LA fails.

## Consequences

- **A failure in one Bunny storage region should no longer take the site down.** Bunny's support recommended replication for exactly this purpose: with a second copy, a failure in one region need not take the files offline.
- **It can't be undone.** Bunny does not allow a replication region to be removed once added. Leaving it would mean moving all the files to a new storage zone.
- **Storage is billed twice, which costs very little.** The zone held about 6.8 GB in 684,843 files when replication was enabled, and NY stores and bills all of it again. At $0.01 per GB a month, the NY copy costs about $0.07 a month (see Bunny's [pricing page](https://bunny.net/pricing/)).
- **Nothing in the build or deploy changes.** `scripts/upload-site.ts` writes to the same storage zone, still additively, and Bunny handles the copy.

## Alternatives rejected

- **Do nothing.** The outage lasted most of a day, and nothing we could do from our side would have shortened it.
- **Move the zone to a different primary region.** That would mean moving every photograph and tile to a new storage zone, and the site would still depend on a single region.
- **A second CDN or host as a fallback.** That would mean two deploy targets and two sets of credentials, and DNS failover, for a small team's static site. Replication gets most of the benefit with one setting.

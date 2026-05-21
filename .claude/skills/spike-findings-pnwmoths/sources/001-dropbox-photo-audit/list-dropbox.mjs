#!/usr/bin/env node
// List the contents of a Dropbox shared-link folder via the Dropbox API.
// Writes {entries: [...]} to outputs/filenames.json. Image bytes are NOT downloaded.
//
// Auth: set DROPBOX_TOKEN in env to a Dropbox app access token with
// `files.metadata.read` scope. Generate one at https://www.dropbox.com/developers/apps
// → create app (Scoped access, Full Dropbox or App folder both work for shared_link use)
// → Permissions tab: enable `files.metadata.read` → Submit → Settings tab: Generate token.
//
// API surface used:
//   POST /2/files/list_folder        with shared_link parameter (non-recursive only)
//   POST /2/files/list_folder/continue with cursor for pagination

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SHARE_URL =
  "https://www.dropbox.com/scl/fo/uf3sg1efxau1fug4f6ibe/AARZETfHfpzlvILrd6KLWlc?rlkey=7m1pm3z0rnasb9i01a5ht0ppf&st=emehj9n2&dl=0";

const TOKEN = process.env.DROPBOX_TOKEN;
if (!TOKEN) {
  console.error("ERROR: set DROPBOX_TOKEN env var to a Dropbox app access token.");
  console.error("Create one at https://www.dropbox.com/developers/apps with files.metadata.read scope.");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "outputs", "filenames.json");

async function dbxCall(endpoint, body) {
  const res = await fetch(`https://api.dropboxapi.com${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${endpoint} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function listSharedFolder() {
  const entries = [];
  let firstPage = true;
  let cursor = null;
  let pages = 0;
  const startedAt = Date.now();

  while (true) {
    pages++;
    const data = firstPage
      ? await dbxCall("/2/files/list_folder", {
          path: "",
          shared_link: { url: SHARE_URL },
          recursive: false,
          limit: 2000,
          include_media_info: false,
          include_deleted: false,
          include_has_explicit_shared_members: false,
          include_mounted_folders: false,
          include_non_downloadable_files: true,
        })
      : await dbxCall("/2/files/list_folder/continue", { cursor });

    for (const e of data.entries) entries.push(e);
    process.stderr.write(`page ${pages}: +${data.entries.length} entries (total ${entries.length})\n`);

    if (!data.has_more) break;
    cursor = data.cursor;
    firstPage = false;
  }

  return { entries, pages, duration_ms: Date.now() - startedAt };
}

async function main() {
  console.error(`Listing shared folder: ${SHARE_URL}`);
  const result = await listSharedFolder();

  // Compact summary by file type
  const byTag = {};
  const byExt = {};
  for (const e of result.entries) {
    const tag = e[".tag"];
    byTag[tag] = (byTag[tag] || 0) + 1;
    if (tag === "file") {
      const m = (e.name || "").match(/\.([^.]+)$/);
      const ext = m ? m[1].toLowerCase() : "(none)";
      byExt[ext] = (byExt[ext] || 0) + 1;
    }
  }

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(
    OUT_PATH,
    JSON.stringify(
      {
        share_url: SHARE_URL,
        listed_at: new Date().toISOString(),
        pages: result.pages,
        duration_ms: result.duration_ms,
        total_entries: result.entries.length,
        by_tag: byTag,
        by_extension: byExt,
        entries: result.entries.map((e) => ({
          tag: e[".tag"],
          name: e.name,
          path_display: e.path_display ?? null,
          size: e.size ?? null,
          server_modified: e.server_modified ?? null,
          content_hash: e.content_hash ?? null,
        })),
      },
      null,
      2,
    ),
  );
  console.error(`\nWrote ${result.entries.length} entries (${result.pages} pages, ${result.duration_ms}ms) → ${OUT_PATH}`);
  console.error(`by tag:`, byTag);
  console.error(`by extension:`, byExt);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

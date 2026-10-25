// scripts/lib/duckdb-spatial.ts
// The one way the scripts load DuckDB's spatial extension.
//
// Five places used to run their own `INSTALL spatial; LOAD spatial;`, four of them
// from https://extensions.duckdb.org and one from DuckDB's default repository, which
// is plain http. DuckDB 1.5 let a copy installed from either satisfy both. DuckDB 2.0
// refuses to INSTALL an extension already installed from a different repository, so
// on a machine without the extension cached, whichever ran first broke the others:
// `npm test` failed 16 tests on a fresh laptop. CI was unaffected, because it fetches
// the extension with curl, which records no origin
// (.github/actions/install-duckdb-extensions).
//
// So: load it if it is installed, from wherever; install it only when it is not, and
// then from the default repository. Installing from an https:// address needs the
// httpfs extension first, and DuckDB cannot fetch httpfs over https without httpfs,
// so on an empty cache the https route fails outright.

/** The part of a DuckDB connection this needs. */
interface RunnableConnection {
  run(sql: string): Promise<unknown>;
}

/** Load the spatial extension, installing it from DuckDB's default repository first if it is missing. */
export async function loadSpatial(conn: RunnableConnection): Promise<void> {
  try {
    await conn.run('LOAD spatial;');
    return;
  } catch {
    // Not installed yet. Any other failure resurfaces from the LOAD below.
  }
  await conn.run('INSTALL spatial;');
  await conn.run('LOAD spatial;');
}

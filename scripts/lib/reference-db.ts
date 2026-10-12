// scripts/lib/reference-db.ts
// The one way maintainer scripts reach the legacy MySQL reference database (#399).
//
// The database runs in the Docker Compose stack of the `pnwinsects/pnwinsects-app`
// checkout (branch `docker-local-dev`) — the same stack the curator's offline copy of
// the legacy site runs on (ADR 0052). There is no local mysql client or driver in this
// project, so every query goes through `docker exec`.
//
// Compose names the container after the directory it is started from:
// `pnwinsects-app-db-1` from the app checkout, `pnwmoths-local-site-db-1` from the
// curator's unpacked bundle. The default is the first; set MYSQL_CONTAINER for the
// other. See docs/reference/data-provenance.md.
//
// Env overrides: MYSQL_CONTAINER, MYSQL_DB, MYSQL_USER, MYSQL_PASSWORD.
import { execFileSync } from 'node:child_process';

export const DEFAULT_CONTAINER = 'pnwinsects-app-db-1';

const CONTAINER: string = process.env['MYSQL_CONTAINER'] ?? DEFAULT_CONTAINER;
const DB: string = process.env['MYSQL_DB'] ?? 'pnwmoths';
const USER: string = process.env['MYSQL_USER'] ?? 'pnwmoths';
const PASSWORD: string = process.env['MYSQL_PASSWORD'] ?? 'pnwmoths';

/**
 * What to tell the maintainer when `docker exec` fails. A missing or stopped container
 * gets the checkout and the Compose command, because "No such container" alone says
 * nothing about where the database lives or what it is called.
 */
export function explainFailure(detail: string, container: string): string {
  const head = `Query against the reference database (container '${container}') failed:\n${detail}`;
  const start =
    `Start it from the pnwinsects/pnwinsects-app checkout (branch docker-local-dev):\n` +
    `  docker compose up -d db\n` +
    `That container is '${DEFAULT_CONTAINER}'. Started from the curator's bundle folder ` +
    `it is 'pnwmoths-local-site-db-1' instead; check \`docker ps\` and set ` +
    `MYSQL_CONTAINER to the name it shows. See docs/reference/data-provenance.md.`;
  if (/No such container/i.test(detail)) return `${head}\n\n${start}`;
  if (/is not running/i.test(detail)) return `${head}\n\nThe container exists but is stopped.\n${start}`;
  // Older CLIs say "Cannot connect to the Docker daemon"; current ones "failed to connect to the docker API".
  if (/Cannot connect to the Docker daemon|failed to connect to the docker API|docker\.sock/i.test(detail)) {
    return `${head}\n\nDocker itself is not running. Start Docker Desktop first.\n${start}`;
  }
  if (/ENOENT/.test(detail)) return `${head}\n\nThe \`docker\` command was not found. Install Docker Desktop.`;
  return head;
}

/**
 * Run `sql` against the reference database and return mysql's raw `--batch` output:
 * tab-separated, with mysql's escaping, and with a header row unless `columnNames` is
 * false. The SQL goes in on stdin. The password reaches mysql as MYSQL_PWD, which
 * `docker exec -e MYSQL_PWD` (name only) copies from this process's environment, so
 * the value is in no command line, the host's `docker` included. Callers pass fixed
 * literal SQL; no data value is interpolated.
 */
export function runReferenceSql(sql: string, { columnNames = true }: { columnNames?: boolean } = {}): string {
  try {
    return execFileSync(
      'docker',
      [
        'exec', '-i',
        '-e', 'MYSQL_PWD',
        CONTAINER,
        'mysql', `-u${USER}`, DB,
        '--batch',
        ...(columnNames ? [] : ['-N']),
      ],
      {
        input: sql,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, MYSQL_PWD: PASSWORD },
      },
    );
  } catch (err) {
    const e = err as { stderr?: string; message: string };
    throw new Error(explainFailure((e.stderr || e.message).trim(), CONTAINER));
  }
}

/** Decode mysql `--batch` escaping (\t \n \0 \\ within tab-separated fields). */
export function unescapeBatch(s: string): string {
  return s.replace(/\\(.)/g, (_m, c: string) =>
    c === 't' ? '\t' : c === 'n' ? '\n' : c === '0' ? '\0' : c);
}

/** Parse `--batch` output with a header row into one record per row. */
export function parseBatch(out: string): Record<string, string>[] {
  if (out.trim() === '') return [];
  const lines = out.replace(/\n$/, '').split('\n');
  const header = (lines[0] ?? '').split('\t');
  return lines.slice(1).map((line) => {
    const cells = line.split('\t').map(unescapeBatch);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
  });
}

/** Run `sql` and return its rows keyed by column name. */
export function queryReferenceDb(sql: string): Record<string, string>[] {
  return parseBatch(runReferenceSql(sql));
}

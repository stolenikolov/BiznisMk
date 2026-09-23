import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** The Postgres schema the e2e tests own. Never the one the app's own data lives in. */
export const E2E_SCHEMA = 'e2e';

/**
 * DATABASE_URL for the e2e run: E2E_DATABASE_URL when set, otherwise the
 * development database from .env with its schema switched to `e2e` — same
 * server, same role, none of the development rows.
 */
export function e2eDatabaseUrl(): string {
  const base = process.env.E2E_DATABASE_URL ?? readEnvFile().DATABASE_URL;
  if (!base) throw new Error('No database for the e2e tests: set E2E_DATABASE_URL or DATABASE_URL in backend/.env');

  const url = new URL(base);
  url.searchParams.set('schema', E2E_SCHEMA);
  return url.toString();
}

/** Refuses to go on unless a URL really points at the e2e schema. */
export function assertE2eDatabase(databaseUrl: string | undefined): void {
  if (!databaseUrl || new URL(databaseUrl).searchParams.get('schema') !== E2E_SCHEMA) {
    throw new Error(`The e2e tests only run against the "${E2E_SCHEMA}" schema`);
  }
}

function readEnvFile(): Record<string, string> {
  const text = readFileSync(resolve(import.meta.dirname, '../.env'), 'utf8');
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .map((line) => {
        const at = line.indexOf('=');
        return [line.slice(0, at), line.slice(at + 1).trim().replace(/^"(.*)"$/, '$1')];
      }),
  );
}

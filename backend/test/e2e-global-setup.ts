import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { assertE2eDatabase, e2eDatabaseUrl } from './e2e-database.js';

/**
 * Once per run: bring the e2e schema up to date with every migration, the
 * same way a deployment would. The schema is created on first use.
 */
export default function setup(): void {
  const databaseUrl = e2eDatabaseUrl();
  assertE2eDatabase(databaseUrl);

  execSync('npx prisma migrate deploy --config prisma7.config.ts', {
    cwd: resolve(import.meta.dirname, '..'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
}

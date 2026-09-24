// The backend's half of the Vercel build (see vercel.json at the repo root).
//
// 1. The Prisma client is generated, not committed.
// 2. Migrations are applied on production deploys only — a preview deploy
//    must never change the production database — and over Neon's direct
//    connection: migrations need a session the pooler does not give them.
// 3. nest build, which api/index.mjs imports from.
import { execSync } from 'node:child_process';

const run = (command, env = process.env) => execSync(command, { stdio: 'inherit', env });

run('prisma generate');

if (process.env.VERCEL_ENV === 'production') {
  const direct = process.env.DATABASE_URL_UNPOOLED;
  if (!direct) throw new Error('DATABASE_URL_UNPOOLED is not set: migrations need the direct Neon connection');
  run('prisma migrate deploy', { ...process.env, DATABASE_URL: direct });
} else {
  console.log(`Skipping migrations (VERCEL_ENV=${process.env.VERCEL_ENV ?? 'unset'})`);
}

run('nest build');

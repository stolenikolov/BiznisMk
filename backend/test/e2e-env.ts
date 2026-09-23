import { assertE2eDatabase, e2eDatabaseUrl } from './e2e-database.js';

// Runs in each test worker before any test file: the app reads its settings
// from process.env first and .env second, so this is what points it at the
// e2e schema.
process.env.DATABASE_URL = e2eDatabaseUrl();
process.env.NODE_ENV = 'test';
assertE2eDatabase(process.env.DATABASE_URL);

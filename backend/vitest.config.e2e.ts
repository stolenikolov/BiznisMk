import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // A schema of its own, migrated once; see test/e2e-database.ts.
    globalSetup: ['./test/e2e-global-setup.ts'],
    setupFiles: ['./test/e2e-env.ts'],
    // One database: files take turns rather than racing each other in it.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

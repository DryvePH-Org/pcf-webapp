import path from 'node:path';
import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Load local Supabase credentials for the integration suite. CI has no
// .env.local, so those tests skip via `describe.skipIf`.
if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local');
}

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    // Integration tests share one database (and one fund's settings), so run
    // files one after another.
    fileParallelism: false,
    include: ['tests/**/*.test.{ts,tsx}'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

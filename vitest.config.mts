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
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

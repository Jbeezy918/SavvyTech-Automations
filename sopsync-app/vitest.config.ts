import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Native modules (better-sqlite3, sharp, keytar) are exercised via thin,
    // swappable interfaces so the pure-logic suite runs on any platform/CI.
    coverage: { reporter: ['text', 'json-summary'] },
  },
  resolve: {
    alias: {
      '@shared': new URL('./src/shared', import.meta.url).pathname,
      '@main': new URL('./src/main', import.meta.url).pathname,
    },
  },
});

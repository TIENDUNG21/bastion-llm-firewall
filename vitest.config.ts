import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@bastion/core': src('./packages/core/src/index.ts'),
      '@bastion/express': src('./packages/express/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    maxWorkers: 4,
    testTimeout: 20_000,
  },
});

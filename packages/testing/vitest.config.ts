import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: __dirname,
    passWithNoTests: true,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      thresholds: { lines: 0, branches: 0, functions: 0, statements: 0 },
    },
  },
});

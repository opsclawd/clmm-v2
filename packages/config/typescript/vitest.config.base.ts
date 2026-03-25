import { defineConfig } from 'vitest/config';

export function createVitestConfig(root: string) {
  return defineConfig({
    test: {
      globals: true,
      root,
      passWithNoTests: true,
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      coverage: {
        provider: 'v8',
        thresholds: {
          lines: 0,
          branches: 0,
          functions: 0,
          statements: 0,
        },
      },
    },
  });
}

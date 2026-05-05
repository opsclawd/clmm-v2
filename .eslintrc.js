'use strict';

module.exports = {
  root: true,
  extends: ['./packages/config/eslint/index.js', './packages/config/eslint/boundary-rules.js'],
  parserOptions: {
    project: true,
    tsconfigRootDir: __dirname,
  },
  ignorePatterns: [
    '**/vitest.config.ts',
    '**/drizzle.config.ts',
    '**/nativewind.config.js',
    '**/metro.config.js',
    '**/tailwind.config.js',
    'packages/config/eslint/**',
  ],
  overrides: [
    {
      files: ['packages/application/src/**/*.test.ts'],
      parserOptions: {
        project: ['./packages/application/tsconfig.typecheck.json'],
      },
    },
    {
      files: ['packages/application/vitest.config.ts'],
      parserOptions: {
        project: ['./packages/application/tsconfig.typecheck.json'],
      },
    },
    {
      files: ['packages/adapters/src/**/*.test.ts'],
      parserOptions: {
        project: ['./packages/adapters/tsconfig.typecheck.json'],
      },
    },
  ],
};

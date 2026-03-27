'use strict';

module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended-type-checked',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unsafe-assignment': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    'no-console': 'warn',
  },
  overrides: [
    {
      files: ['packages/testing/src/**/*.{ts,tsx}'],
      rules: {
        '@typescript-eslint/require-await': 'off',
      },
    },
    {
      files: ['packages/adapters/src/**/*.{ts,tsx}'],
      rules: {
        '@typescript-eslint/require-await': 'off',
      },
    },
    {
      files: [
        'packages/adapters/src/inbound/**/*.{ts,tsx}',
        'packages/adapters/src/outbound/**/*.{ts,tsx}',
        'packages/adapters/src/**/*.test.ts',
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/no-unsafe-enum-comparison': 'off',
        '@typescript-eslint/no-unnecessary-type-assertion': 'off',
        '@typescript-eslint/no-redundant-type-constituents': 'off',
        '@typescript-eslint/restrict-template-expressions': 'off',
      },
    },
  ],
};

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
      files: ['packages/application/src/**/*.{ts,tsx}'],
      rules: {
        '@typescript-eslint/require-await': 'off',
      },
    },
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
  ],
};

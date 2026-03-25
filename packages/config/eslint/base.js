// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import-x';

/** @param {string} tsconfigPath - absolute path to the package's tsconfig.json */
export function createBaseConfig(tsconfigPath) {
  return tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
      plugins: {
        'import-x': importPlugin,
      },
      languageOptions: {
        parserOptions: {
          project: tsconfigPath,
          tsconfigRootDir: import.meta.dirname,
        },
      },
      rules: {
        // No any except at explicit boundaries
        '@typescript-eslint/no-explicit-any': 'error',
        // Enforce explicit return types on exported functions
        '@typescript-eslint/explicit-module-boundary-types': 'warn',
        // Disallow unused variables
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        // Import ordering
        'import-x/order': ['warn', { 'newlines-between': 'always' }],
        // Boundary rules added in Task 11
        // Banned-concept rules added in Task 12
      },
    },
  );
}

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
        // Boundary rules: block cross-layer adapter imports globally.
        // SDK-specific bans (Solana, NestJS, drizzle) are in react-native.js / enforced by dep-cruiser.
        'no-restricted-imports': ['error', {
          patterns: [
            // No layer should import concrete adapters except the composition root.
            { group: ['@clmm/adapters', '@clmm/adapters/*'], message: 'Do not import from @clmm/adapters outside the composition root. Use port interfaces.' },
          ],
        }],
        // Banned architectural concepts — any declaration using these names fails CI.
        // Covers: class, interface, type alias, enum.
        'no-restricted-syntax': ['error',
          {
            selector: 'ClassDeclaration[id.name=/^(Receipt|Attestation|Proof|ClaimVerification|OnChainHistory|CanonicalExecutionCertificate)/]',
            message: 'Banned concept: Receipt/Attestation/Proof/ClaimVerification/OnChainHistory/CanonicalExecutionCertificate are out of scope.',
          },
          {
            selector: 'TSInterfaceDeclaration[id.name=/^(Receipt|Attestation|Proof|ClaimVerification|OnChainHistory|CanonicalExecutionCertificate)/]',
            message: 'Banned concept: Receipt/Attestation/Proof/ClaimVerification/OnChainHistory/CanonicalExecutionCertificate are out of scope.',
          },
          {
            selector: 'TSTypeAliasDeclaration[id.name=/^(Receipt|Attestation|Proof|ClaimVerification|OnChainHistory|CanonicalExecutionCertificate)/]',
            message: 'Banned concept: Receipt/Attestation/Proof/ClaimVerification/OnChainHistory/CanonicalExecutionCertificate are out of scope.',
          },
          {
            selector: 'TSEnumDeclaration[id.name=/^(Receipt|Attestation|Proof|ClaimVerification|OnChainHistory|CanonicalExecutionCertificate)/]',
            message: 'Banned concept: Receipt/Attestation/Proof/ClaimVerification/OnChainHistory/CanonicalExecutionCertificate are out of scope.',
          },
        ],
      },
    },
  );
}

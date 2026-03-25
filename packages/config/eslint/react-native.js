// @ts-check
import { createBaseConfig } from './base.js';

/** @param {string} tsconfigPath */
export function createReactNativeConfig(tsconfigPath) {
  return [
    ...createBaseConfig(tsconfigPath),
    {
      rules: {
        // RN components often have implicit return types via JSX
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        // UI must not import adapters, Solana SDKs, or storage SDKs.
        // Full set listed here (not just additions) because no-restricted-imports does not merge.
        'no-restricted-imports': ['error', {
          patterns: [
            { group: ['@clmm/adapters', '@clmm/adapters/*'], message: 'UI must not import from adapters.' },
            { group: ['@clmm/adapters/src/inbound', '@clmm/adapters/src/inbound/*'], message: 'UI must not import adapter inbound handlers.' },
            { group: ['@solana/*'], message: 'Solana SDK not allowed in UI.' },
            { group: ['@orca-so/*'], message: 'Orca SDK not allowed in UI.' },
            { group: ['drizzle-orm', 'drizzle-orm/*'], message: 'Storage SDK not allowed in UI.' },
            { group: ['pg-boss'], message: 'Job queue not allowed in UI.' },
          ],
        }],
      },
    },
  ];
}

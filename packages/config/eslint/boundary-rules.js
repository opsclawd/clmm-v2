'use strict';

function restrictedPatterns(patterns) {
  return [
    'error',
    {
      patterns,
    },
  ];
}

module.exports = {
  overrides: [
    {
      files: ['packages/domain/src/**/*.{ts,tsx,js,jsx}'],
      rules: {
        'no-restricted-imports': restrictedPatterns([
          {
            group: ['@clmm/adapters', '@clmm/ui', '@solana/*', '@orca-so/*', 'react', 'react-native', 'expo*'],
            message: 'packages/domain must not import external SDKs or framework packages.',
          },
        ]),
      },
    },
    {
      files: ['packages/application/src/**/*.{ts,tsx,js,jsx}'],
      rules: {
        'no-restricted-imports': restrictedPatterns([
          {
            group: ['@clmm/adapters', '@solana/*', '@orca-so/*', 'react', 'react-native', 'expo*'],
            message: 'packages/application must not import adapters, SDKs, or framework packages.',
          },
        ]),
      },
    },
    {
      files: ['packages/ui/src/**/*.{ts,tsx,js,jsx}'],
      rules: {
        'no-restricted-imports': restrictedPatterns([
          {
            group: ['@clmm/adapters', '@solana/*', '@orca-so/*'],
            message: 'packages/ui must not import adapters or Solana SDK packages.',
          },
        ]),
      },
    },
    {
      files: ['apps/app/**/*.{ts,tsx,js,jsx}'],
      excludedFiles: ['apps/app/src/composition/index.ts'],
      rules: {
        'no-restricted-imports': restrictedPatterns([
          {
            group: ['@clmm/adapters'],
            message: 'apps/app may only import adapters through src/composition/index.ts.',
          },
        ]),
      },
    },
  ],
};

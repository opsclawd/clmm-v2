'use strict';

// Forbidden import patterns enforcing clean architecture boundaries.
// These replicate the dependency-cruiser rules as ESLint for IDE feedback.
module.exports = {
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          // domain must not import adapters, ui, or external SDKs
          {
            group: ['@clmm/adapters', '@clmm/ui', '@solana/*', '@orca-so/*', 'react', 'react-native', 'expo*'],
            message: 'packages/domain must not import external SDKs or framework packages.',
          },
        ],
      },
    ],
  },
};

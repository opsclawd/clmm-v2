/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-no-external',
      comment: 'packages/domain must not depend on anything outside itself — no npm packages, no sibling packages',
      severity: 'error',
      from: { path: '^packages/domain/src' },
      to: {
        pathNot: ['^packages/domain/src', '^node_modules/typescript/'],
      },
    },
    {
      name: 'application-no-infra',
      comment: 'packages/application must not import adapters, Solana SDKs, React, or Expo',
      severity: 'error',
      from: { path: '^packages/application/src' },
      to: {
        path: [
          '^packages/adapters',
          '@solana/',
          '@orca-so/',
          '^react$',
          '^react-native$',
          '^expo$',
          '^expo-',
          '@nestjs/',
          '^drizzle-orm',
          '^pg-boss',
        ].join('|'),
      },
    },
    {
      name: 'ui-no-adapters',
      comment: 'packages/ui must not import adapters, Solana SDKs, or storage SDKs',
      severity: 'error',
      from: { path: '^packages/ui/src' },
      to: {
        path: [
          '^packages/adapters',
          '@solana/',
          '@orca-so/',
          '^drizzle-orm',
          '^pg-boss',
        ].join('|'),
      },
    },
    {
      name: 'app-shell-one-composition-path',
      comment: 'Only apps/app/src/composition/client.ts may import from packages/adapters',
      severity: 'error',
      from: {
        path: '^apps/app',
        pathNot: '^apps/app/src/composition/client\\.ts',
      },
      to: { path: '^packages/adapters' },
    },
    {
      name: 'testing-public-apis-only',
      comment: 'packages/testing must not deep-import src/ internals of other packages',
      severity: 'error',
      from: { path: '^packages/testing/src' },
      to: {
        path: '^packages/[^/]+/src/(?!index\\.ts)',
        dependencyTypes: ['local'],
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    reporterOptions: {
      text: {
        highlightFocused: true,
      },
    },
  },
};

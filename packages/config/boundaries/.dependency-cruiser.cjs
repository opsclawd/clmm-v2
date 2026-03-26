'use strict';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-no-external-sdks',
      severity: 'error',
      comment: 'packages/domain must not import external SDKs',
      from: { path: 'packages/domain/src' },
      to: {
        path: [
          'node_modules/@solana',
          'node_modules/@orca-so',
          'node_modules/react',
          'node_modules/react-native',
          'node_modules/expo',
          'node_modules/@nestjs',
        ],
      },
    },
    {
      name: 'application-no-adapters',
      severity: 'error',
      comment: 'packages/application must not import adapters, Solana SDKs, React, React Native, or Expo',
      from: { path: 'packages/application/src' },
      to: {
        path: [
          'packages/adapters',
          'node_modules/@solana',
          'node_modules/@orca-so',
          'node_modules/react',
          'node_modules/react-native',
          'node_modules/expo',
        ],
      },
    },
    {
      name: 'ui-no-adapters',
      severity: 'error',
      comment: 'packages/ui must not import adapter modules or Solana SDKs',
      from: { path: 'packages/ui/src' },
      to: {
        path: [
          'packages/adapters',
          'node_modules/@solana',
          'node_modules/@orca-so',
        ],
      },
    },
    {
      name: 'app-no-direct-adapters',
      severity: 'error',
      comment: 'apps/app may only import adapters through the one approved composition bootstrap',
      from: {
        path: 'apps/app',
        pathNot: 'apps/app/src/composition',
      },
      to: { path: 'packages/adapters' },
    },
    {
      name: 'no-receipt-concepts',
      severity: 'error',
      comment: 'No on-chain receipt/attestation/proof subsystem permitted',
      from: { path: '(packages|apps)' },
      to: {
        path: [
          'Receipt',
          'Attestation',
          'Proof',
          'ClaimVerification',
          'OnChainHistory',
          'CanonicalExecutionCertificate',
        ],
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
  },
};

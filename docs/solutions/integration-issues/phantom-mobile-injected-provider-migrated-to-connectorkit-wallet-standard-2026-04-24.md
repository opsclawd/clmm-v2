---
title: Phantom mobile injected-provider migrated to ConnectorKit Wallet Standard
date: 2026-04-24
category: integration-issues
module: apps/app
problem_type: integration_issue
component: browser-wallet
symptoms:
  - Phantom mobile connect call hangs or silently fails with no rejection event
  - publicKey stays null after user approves in Phantom mobile
  - 4100 late-approval error fires inconsistently between desktop and mobile
  - connect event never reaches listener after mobile wallet approval
  - window.phantom.solana and window.solana exhibit divergent behavior across platforms
root_cause: incorrect_abstraction
resolution_type: architectural_change
severity: critical
tags: [phantom, mobile-wallet, injected-provider, wallet-standard, connectorkit, mwa, browser-wallet]
---

# Phantom mobile injected-provider migrated to ConnectorKit Wallet Standard

## Problem

The DIY injected-provider browser wallet path broke on Phantom mobile because it depended on implicit behavior from:

- `window.phantom.solana`
- `window.solana`
- `provider.connect()`
- `provider.on('connect')`
- `provider.publicKey`
- 4100 late approval behavior

Each patch addressed symptoms, not the contract failure. The integration accumulated multiple narrow fixes targeting specific Phantom desktop/mobile divergences without recognizing that the abstraction itself was wrong.

## Root cause

The app targeted wallet-specific injected-provider behavior directly instead of the maintained standards layer. Phantom desktop and Phantom mobile do not behave identically enough for this to be safe. Injected-provider contracts are wallet-internal implementation details, not stable public APIs. Wallet Standard and MWA exist precisely to normalize this surface.

## Failed approaches

- **Prefer `window.phantom.solana` over `window.solana`.** Both are Phantom-internal injection points. Neither is a stable contract, and their behavior diverges across mobile/desktop.
- **Wait for `connect` event after late approval.** Phantom mobile does not reliably emit the `connect` event after user approval. Waiting indefinitely blocks the UI; adding a timeout just masks the contract gap.
- **Poll `publicKey`.** Worked intermittently on some Phantom builds but not others. Polling an undocumented property is not a wallet integration strategy.
- **Treat 4100 as recoverable with local waiting.** Error 4100 (user rejected) fires at different lifecycle points on desktop vs mobile. Treating it as recoverable with a retry/timeout cycle addressed one device and broke another.
- **Patch more Phantom-specific behavior into app screens.** Each patch made the next one harder to reason about and spread wallet-internal knowledge further into UI code.

## Final approach

Use a ConnectorKit-first, Wallet Standard-aligned abstraction:

- **ConnectorKit handles MWA registration internally.** No manual `registerMwa`. Passing the `mobile` config prop to `ConnectorProvider` is sufficient. Double-registration produces duplicate wallet entries in the Wallet Standard registry.
- **Preserve native MWA path.** The existing Expo MWA flow is unchanged. ConnectorKit's MWA registration only activates in the web/platform-browser context.
- **Preserve server transaction DTO.** Base64 v0 wire format flows through unchanged. ConnectorKit's `TransactionSigner` accepts `Uint8Array` via the `SolanaTransaction` union, so `prepareTransactionForWallet()` passes raw bytes through to the wallet's `solana:signTransaction` feature and the signed `Uint8Array` result returns as-is.
- **Hide wallet library behind app-local hooks.** `useBrowserWalletConnect`, `useBrowserWalletSign`, `useBrowserWalletDisconnect`, `BrowserWalletProvider` are the only surfaces screens see. No ConnectorKit, Wallet Standard, wallet-adapter, or MWA types leak into screen code.
- **Add explicit wallet-browser fallback links.** Non-wallet mobile browsers (Safari without extension, social app in-app browsers) get a visible escape hatch instead of a silently broken connect button.

### Version pins

| Package | Version | Type | Role |
|---|---|---|---|
| `@solana/connector` | 0.2.4 | prod | Primary wallet connector |
| `@solana-mobile/wallet-standard-mobile` | 0.5.2 | prod | MWA registration (via ConnectorKit) |
| `@wallet-standard/base` | 11.0 | dev | Type definitions |
| `@solana/connector-debugger` | 0.1.1 | dev | Dev tooling |

`@solana/connector` depends on `@solana/kit@5.5.1` internally. `packages/adapters` uses `@solana/kit@6.5.0`. The two versions coexist without conflict; connector code uses its own kit instance and adapter code uses ours.

## Prevention

- Do not target injected wallet providers directly when Wallet Standard or MWA exists.
- Do not patch the same integration failure more than three times without questioning architecture.
- Keep wallet-library types out of screens. All wallet access flows through app-local hooks.
- Real-device mobile wallet E2E is mandatory before cleanup. Desktop emulation alone does not validate Phantom mobile behavior.
- Android Chrome/PWA support must be tested separately from wallet in-app browser support.

## Related Issues

- `docs/solutions/integration-issues/connectorkit-wallet-probe-metro-package-exports-hydration-failure-2026-04-24.md`
- `docs/solutions/integration-issues/phantom-webview-expo-router-navigation-silent-failure-2026-04-15.md`
- `docs/solutions/integration-issues/phantom-injected-v0-signtransaction-requires-versionedtransaction-2026-04-23.md`
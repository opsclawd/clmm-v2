---
title: Phantom mobile connect should prefer window.phantom.solana
date: 2026-04-24
category: integration-issues
module: apps/app
problem_type: integration_issue
component: wallet_connect
symptoms:
  - Phantom mobile browser shows "Connection Failed"
  - Error detail says "The requested method and/or account has not been authorized by the user"
  - User tapped the explicit browser wallet connect button on /connect
root_cause: wrong_provider_boundary
resolution_type: code_fix
severity: high
tags:
  - phantom
  - mobile-browser
  - browser-wallet
  - wallet-connect
  - injected-provider
---

# Phantom mobile connect should prefer window.phantom.solana

## Problem

Phantom documents the Solana provider as `window.phantom.solana`, with `window.solana` retained for legacy integrations. The app's browser wallet connect path only passed `window.solana` into the wallet helper.

In Phantom mobile browser, this can surface as an authorization failure when the user taps the explicit connect button:

```text
The requested method and/or account has not been authorized by the user.
```

## Solution

At the app browser-wallet boundary, read both injected shapes in one helper and prefer the Phantom-scoped Solana provider:

```typescript
readInjectedBrowserWalletWindow();
```

Provider selection should check `phantom.solana` first, then fall back to `solana` for other Solana wallet injections and legacy integrations. Every browser wallet lifecycle call must use the same helper:

- connect
- sign transaction
- disconnect

If connect uses the scoped Phantom provider but signing or disconnect reconstructs only `{ solana: window.solana }`, the app can switch provider surfaces mid-session and hit authorization failures after the wallet popup has already appeared.

The connect helper also needs Phantom-specific completion handling:

- If `provider.publicKey` is already populated, return it without calling `connect()`.
- If `connect()` rejects with Phantom unauthorized code `4100` while the wallet approval sheet still opens, do not wait in a spinner. Stop connecting, show explicit guidance to approve CLMM V2 in Phantom, and keep the Connect button available so the user can tap it again after approval.
- If the user rejects with code `4001`, fail immediately instead of waiting.

Capability and mobile WebView detection must also check `window.phantom.solana`, not only `window.solana`; otherwise scoped-only Phantom injection can hide the connect button or skip hard navigation.

## Prevention

- Keep Phantom-specific provider selection in `apps/app/src/platform/browserWallet.ts`.
- Do not use `window.solana` as the only Phantom detection path.
- Do not reconstruct the injected browser wallet window inline at route call sites.
- Add or preserve unit tests for already-connected `publicKey`, immediate `4100` retry guidance, scoped provider detection, and `window.phantom.solana` winning when both providers are present.

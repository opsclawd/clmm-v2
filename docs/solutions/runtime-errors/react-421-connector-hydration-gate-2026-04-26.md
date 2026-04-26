---
title: "React #421: Hydration state update from third-party connector initialization"
date: 2026-04-26
category: runtime-errors
module: wallet-boot
problem_type: runtime_error
component: tooling
severity: high
symptoms:
  - "React error #421: Cannot update a component while rendering a different component during SSR hydration"
  - "Error only appears in production static export, not local dev (client-side rendering)"
  - "useConnector must be used within ConnectorProvider crash when gating with children but no provider"
root_cause: async_timing
resolution_type: code_fix
related_components:
  - solana-connector
  - zustand-persist
  - expo-router-web
tags: [react, hydration, ssr, use-sync-external-store, connector, client-only-gate]
---

# React #421: Hydration state update from third-party connector initialization

## Problem

React error #421 fired during SSR hydration in an Expo Router app with `web.output: "static"`. `@solana/connector`'s `ConnectorClient` initializes during render (via `ConnectorProviderInternal`), triggering `StateManager.updateState()` and `StateManager.notifyImmediate()` through `useSyncExternalStore` during React's `hydrateRoot` render pass. This violates React 18's render purity constraint: no component may trigger a state update in another component during its render phase.

## Symptoms

- `Error: Cannot update a component while rendering a different component` in browser console during hydration
- Error only appears in production static export (`pnpm build` + serve), not in local dev (client-side rendering)
- If gating with `<>{children}</>` without provider, `useConnector must be used within ConnectorProvider` crash

## What Didn't Work

1. **`queueMicrotask` for Zustand `hasHydrated` setState** — Defers past the synchronous render, but `@solana/connector`'s `StateManager` has two independent trigger paths that bypass this fix (see Root Cause below).

2. **`requestAnimationFrame` instead of `queueMicrotask`** — More aggressive deferral (past layout/paint), but still doesn't address the connector's `StateManager.notifyImmediate()` which fires synchronously during render.

3. **Rendering `<>{children}</>` during the hydration gate** — Components inside children (e.g., route screens) call `useConnector()` which requires `ConnectorProvider` context, causing a different crash.

4. **Moving the gate to `_layout.tsx`** — Same problem as #3: rendering `<Stack>` without `<AppProvider>` means any route that calls `useConnector()` crashes.

## Solution

Add a client-only gate to `BrowserWalletProvider.web.tsx` that returns `null` on the first render, deferring the entire wallet provider tree until after hydration:

```typescript
// apps/app/src/platform/browserWallet/BrowserWalletProvider.web.tsx
import { useEffect, useState, type ReactNode } from 'react';
import { AppProvider, getDefaultConfig, getDefaultMobileConfig, useConnector } from '@solana/connector';
import { walletSessionStore } from '../../state/walletSessionStore';
import { WalletBootProvider } from '../../wallet-boot/WalletBootProvider.web';

const connectorConfig = getDefaultConfig({
  appName: 'CLMM V2',
  appUrl: 'https://clmm.v2.app',
  autoConnect: true,
  enableMobile: true,
  network: 'mainnet',
});

const mobileConfig = getDefaultMobileConfig({
  appName: 'CLMM V2',
  appUrl: 'https://clmm.v2.app',
  network: 'mainnet',
});

function BrowserWalletSessionSync() {
  const { isConnected, account } = useConnector();

  useEffect(() => {
    if (isConnected && account) {
      const store = walletSessionStore.getState();
      if (store.walletAddress === account && store.connectionKind === 'browser') return;
      store.markConnected({ walletAddress: account, connectionKind: 'browser' });
    }
  }, [isConnected, account]);

  return null;
}

export function BrowserWalletProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) {
    return null;
  }

  return (
    <AppProvider connectorConfig={connectorConfig} mobile={mobileConfig}>
      <BrowserWalletSessionSync />
      <WalletBootProvider>{children}</WalletBootProvider>
    </AppProvider>
  );
}
```

The `.web.tsx` suffix ensures this gate only applies to web — native (`.tsx` without `.web`) passes through unchanged.

## Why This Works

Three independent triggers caused #421, all originating from `@solana/connector`'s `ConnectorClient`:

1. **ConnectorClient constructor → `this.initialize()` → `WalletDetector.initialize()`**: When wallets (Phantom, Solflare) are registered in `window`, `updateState({wallets, connectors})` fires during the constructor, queuing a 16ms debounced `notify()` that fires during hydration.

2. **`autoConnect: true` → `setTimeout(attemptAutoConnect, 100)` → `updateState({...}, true)`**: The `immediate=true` flag calls `notifyImmediate()`, which synchronously invokes all `useSyncExternalStore` listeners. If wallet auto-restore succeeds, this runs ~100ms after mount — during or just after hydration.

3. **Zustand persist `onRehydrateStorage` → `setState({hasHydrated: true})`**: Previously addressed with `queueMicrotask`, but still within the hydration microtask batch.

The `return null` gate eliminates all three triggers by preventing the entire `AppProvider` (and its `ConnectorClient`) from mounting during hydration. No provider = no `useSyncExternalStore` subscriptions = no state notifications during render.

Returning `null` (rather than `<>{children}</>`) avoids the `useConnector must be used within ConnectorProvider` crash — no wallet context means no wallet hooks can run.

**Trade-off**: One-frame blank flash before the full app mounts. The wallet provider tree depends on `window.solana`, `localStorage`, and `useSyncExternalStore` — it cannot produce meaningful server-rendered content anyway.

## Prevention

- **Gate third-party providers that use `useSyncExternalStore` or initialize during render** — Any provider that creates client-side state during construction (wallet providers, analytics SDKs, feature flag libraries) should be wrapped in a client-only gate for SSR/hydration safety.

- **Return `null` during the gate, not `<>{children}</>`** — Rendering children without their required context providers causes context-missing crashes. The gate must suppress the entire subtree.

- **Test hydration errors in production builds** — SSR hydration errors are invisible in local dev (client-side rendering only). Always verify with `pnpm build && npx serve dist/`.

- **Use `.web.tsx` / `.native.tsx` platform suffixes** — The gate only needs to exist on web. Platform-specific files ensure native builds are unaffected.

## Related Issues

- [PR #47](https://github.com/opsclawd/clmm-v2/pull/47) — fix: defer wallet provider past hydration to eliminate React error #421
- [ConnectorKit Metro hydration failure](../integration-issues/connectorkit-wallet-probe-metro-package-exports-hydration-failure-2026-04-24.md) — Adjacent: same subsystem but a build-time bundling issue, not a runtime React rendering issue
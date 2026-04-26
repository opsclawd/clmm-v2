---
title: "React render-phase hardening and re-render optimization in wallet provider tree"
date: 2026-04-26
last_updated: 2026-04-26
category: runtime-errors
module: wallet-boot
problem_type: runtime_error
component: tooling
severity: high
symptoms:
  - "Render-phase ref mutations violating React purity rules"
  - "WalletBootProvider deriving incorrect boot status due to ref-not-state tracking"
  - "Unstable adapter object references causing cascading re-renders"
  - "Effect subscription churn from unnecessary useStore subscriptions"
  - "Missing effect dependencies causing stale closures"
root_cause: async_timing
resolution_type: code_fix
related_components:
  - zustand-persist
  - solana-connector
  - expo-router-web
tags: [react, render-phase, useeffect, usestate, useref, usememo, usecallback, zustand, re-render]
---

# React render-phase hardening and re-render optimization in wallet provider tree

## Problem

Multiple React rendering contract violations in the wallet provider tree: render-phase ref mutations, unstable object references from `useConnector()`, missing effect dependencies, and unnecessary `useStore` subscriptions causing cascading re-renders. These violations compound during SSR hydration (where React 18 strictly enforces render purity), contributing to React error #421 alongside the primary trigger addressed in PR #47 (connector `StateManager.notifyImmediate()` during hydration).

## Symptoms

- **Wallet boot status stuck or flickering**: `WalletBootProvider` deriving incorrect boot status because `hasSeenInflight` was tracked via `useRef` (no re-render on change)
- **Cascading unnecessary re-renders**: `useConnector()` returning a new object reference on every snapshot, propagating re-renders through all consumers
- **Unstable callback references**: `sign` in `useBrowserWalletSign` changing identity every render because `adapter` was a `useCallback` dependency
- **Effect subscription churn**: `connect.tsx` reconnecting `useStore` subscription and re-running mount effects unnecessarily
- **Stale closures**: `RequireWallet.tsx` missing `pathname`, `search`, `pathParamKeys`, `router` deps

## What Didn't Work

1. **`useRef` for `hasSeenInflight` with `useEffect`** — Suggested in a Codex PR review. Refs don't trigger re-renders, so the `useMemo` deriving `walletBootStatus` never recalculated when `hasSeenInflight` changed. Fixed by converting to `useState`.

2. **Leaving `setPlatformCapabilities` in `useStore` subscription** — It was only used inside a mount effect, so including it in the subscription callback caused the subscription itself to be recreated when the function identity changed. Fix: call `walletSessionStore.getState()` directly inside the effect.

3. **`queueMicrotask` alone for the primary hydration #421** — While deferring the Zustand `hasHydrated` setState past the synchronous render is correct, the primary hydration #421 trigger is `@solana/connector`'s `StateManager.notifyImmediate()` during `hydrateRoot`, which `queueMicrotask` doesn't address. That requires a client-only gate (PR #47).

4. **`requestAnimationFrame` instead of `queueMicrotask`** — More aggressive deferral but adds ~16ms visible delay. `queueMicrotask` is sufficient for the Zustand deferral; the connector trigger is handled separately.

5. **`autoConnect: false` as diagnostic** — `@solana/connector`'s autoConnect fires via `setTimeout(cb, 100)`, which runs after hydration completes. Not the root cause of the remaining #421, but worth monitoring.

## Solution

### 1. Convert render-phase useRef mutation to useState + useEffect

**File**: `apps/app/src/wallet-boot/WalletBootProvider.web.tsx`

```typescript
// BEFORE: ref mutation during render (side effect)
const hasSeenInflightRef = useRef(false);
if (walletStatus.status === 'connecting' || walletStatus.status === 'connected') {
  hasSeenInflightRef.current = true;
}

// AFTER: state update in effect, tracked in useMemo deps
const [hasSeenInflight, setSeenInflight] = useState(false);
useEffect(() => {
  if (walletStatus.status === 'connecting' || walletStatus.status === 'connected') {
    setSeenInflight(true);
  }
}, [walletStatus.status]);

// useMemo deps now include hasSeenInflight:
[hasHydrated, connectionKind, walletAddress, browserRestoreAddress, walletStatus, account, hasSeenInflight, restoreTimedOut],
```

### 2. Defer Zustand hydration setState past React render

**File**: `apps/app/src/state/walletSessionStore.ts`

```typescript
// BEFORE: setState fires during hydration render
onRehydrateStorage: () => (_state, _error) => {
  if (typeof window !== 'undefined') {
    store.setState({ hasHydrated: true });
  }
},

// AFTER: setState deferred past synchronous render via queueMicrotask
onRehydrateStorage: () => (_state, _error) => {
  if (typeof window !== 'undefined') {
    queueMicrotask(() => {
      store.setState({ hasHydrated: true });
    });
  }
},
```

### 3. Stabilize adapter return value with useMemo + useCallback

**File**: `apps/app/src/platform/browserWallet/connectorKitAdapter.web.ts`

```typescript
// BEFORE: useConnector() snapshot returned directly — new object every render
const snapshot = useConnector();
return { ...snapshot, signTransactionBytes };

// AFTER: stabilized with useMemo, individual properties as deps
return useMemo(() => ({
  connectors: snapshot.connectors,
  connectWallet: snapshot.connectWallet,
  disconnectWallet: snapshot.disconnectWallet,
  isConnected: snapshot.isConnected,
  isConnecting: snapshot.isConnecting,
  account: snapshot.account,
  walletError: snapshot.walletError,
  walletStatus: snapshot.walletStatus,
  signTransactionBytes,
}), [snapshot.connectors, snapshot.connectWallet, snapshot.disconnectWallet,
    snapshot.isConnected, snapshot.isConnecting, snapshot.account,
    snapshot.walletError, snapshot.walletStatus, signTransactionBytes]);
```

### 4. Ref pattern for stable callback with mutable dependency

**File**: `apps/app/src/platform/browserWallet/useBrowserWalletSign.ts`

```typescript
// BEFORE: adapter in useCallback deps — unstable
const sign = useCallback(async (payload) => {
  await adapter.signTransaction(payload);
}, [adapter]);

// AFTER: ref reads latest value at call time, callback has empty deps
const adapterRef = useRef(adapter);
useEffect(() => { adapterRef.current = adapter; }, [adapter]);
const sign = useCallback(async (serializedPayloadBase64: string) => {
  const current = adapterRef.current;
  if (!current.isConnected) throw new Error('No wallet account is connected');
  // ...
}, []);
```

### 5. Move adapter ref sync out of render phase

**Files**: `useBrowserWalletConnect.ts`, `useBrowserWalletDisconnect.ts`

```typescript
// BEFORE: ref sync during render
adapterRef.current = adapter;

// AFTER: ref sync in effect
useEffect(() => { adapterRef.current = adapter; }, [adapter]);
```

### 6. Remove subscription-only values from useStore callback

**File**: `apps/app/app/connect.tsx`

```typescript
// BEFORE: setPlatformCapabilities in subscription
const { setPlatformCapabilities } = useStore(walletSessionStore, (state) => ({
  setPlatformCapabilities: state.setPlatformCapabilities,
}));
useEffect(() => {
  setPlatformCapabilities(detectCapabilities());
}, [setPlatformCapabilities]);

// AFTER: direct store access, mount-only effect
useEffect(() => {
  walletSessionStore.getState().setPlatformCapabilities(detectCapabilities());
}, []);
```

### 7. Add missing effect dependencies

**File**: `apps/app/src/wallet-boot/RequireWallet.tsx`

```typescript
// BEFORE: missing deps
useEffect(() => { /* redirect logic */ }, [walletReady]);

// AFTER: exhaustive deps
useEffect(() => { /* redirect logic */ }, [walletReady, pathname, search, pathParamKeys, router]);
```

### 8. Eliminate wasted render on mount

**File**: `packages/ui/src/screens/PositionDetailScreen.tsx`

```typescript
// BEFORE: useState + useEffect causes one extra render per mount
const [mountedAt, setMountedAt] = useState(0);
useEffect(() => { setMountedAt(Date.now()); }, []);

// AFTER: useRef — no re-render needed, value is read imperatively
const mountedAtRef = useRef(Date.now());
```

## Why This Works

- **`useRef` → `useState`** for `hasSeenInflight`: React cannot track ref changes; only state changes trigger re-renders and `useMemo` recalculation.
- **`queueMicrotask` for Zustand `hasHydrated`**: Defers the setState past the synchronous render pass, preventing cross-component state updates during render.
- **`useMemo`/`useCallback` stabilization**: Prevents object identity churn from cascading re-renders through the component tree.
- **Ref pattern for mutable deps**: Reads latest value at call time without destabilizing callback identity.
- **Exhaustive effect deps**: Prevents stale closures and ensures React's rules of hooks are satisfied.
- **Direct store access for non-render values**: Avoids unnecessary subscription to values not used in render, preventing subscription churn.
- **`useRef(Date.now())` for mount-only values**: No re-render needed when the value is read imperatively.

**Note**: The primary hydration #421 trigger (`@solana/connector`'s `StateManager.notifyImmediate()` during `hydrateRoot`) requires a client-only gate in `BrowserWalletProvider.web.tsx` — see [PR #47](https://github.com/opsclawd/clmm-v2/pull/47) and the companion doc at `docs/solutions/runtime-errors/react-421-connector-hydration-gate-2026-04-26.md`.

## Prevention

- **Never mutate refs during render** — Use `useState` + `useEffect` when a derived value must trigger a re-render. Reserve `useRef` for values read imperatively (timer IDs, previous values for comparison).

- **Never call `setState` synchronously inside Zustand persist's `onRehydrateStorage`** — Always defer with `queueMicrotask` (or `requestAnimationFrame` if microtask isn't sufficient). The `hasHydrated` flag must not update during React's render phase.

- **Stabilize adapter return values at the boundary** — When a hook returns an object consumed by React components, wrap in `useMemo` with granular deps. When a callback depends on a frequently-changing value, use the ref pattern to keep the callback stable.

- **Use `useStore` subscriptions carefully** — Only subscribe to values that are actually used in render. Values needed only inside effects should be accessed via `store.getState()` to avoid subscription churn.

- **Declare exhaustive effect deps** — Use `eslint-plugin-react-hooks` `exhaustive-deps` rule to catch missing dependencies early.

## Related Issues

- [PR #46](https://github.com/opsclawd/clmm-v2/pull/46) — This PR: render-phase hardening and re-render optimization
- [PR #47](https://github.com/opsclawd/clmm-v2/pull/47) — Client-only gate for connector hydration #421
- [Connector hydration gate doc](../runtime-errors/react-421-connector-hydration-gate-2026-04-26.md) — Primary hydration #421 trigger and client-only gate fix
- [ConnectorKit Metro hydration failure](../runtime-errors/connectorkit-wallet-probe-metro-package-exports-hydration-failure-2026-04-24.md) — Adjacent: build-time bundling issue in the same subsystem
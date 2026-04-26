---
title: "React #421: Cannot update component during hydration render"
date: 2026-04-26
category: runtime-errors
module: wallet-boot
problem_type: runtime_error
component: tooling
severity: high
symptoms:
  - "React error #421: Cannot update a component while rendering a different component during SSR hydration"
  - "Zustand persist onRehydrateStorage fires setState during React hydrateRoot render pass"
  - "WalletBootProvider deriving incorrect boot status due to ref-not-state tracking"
  - "Unstable adapter object references causing cascading re-renders"
  - "Error only appears in production (static export + hydration), not local dev"
root_cause: async_timing
resolution_type: code_fix
related_components:
  - zustand-persist
  - solana-connector
  - expo-router-web
tags: [react, hydration, ssr, zustand, error-421, useeffect, usestate, useref, usememo]
---

# React #421: Cannot update component during hydration render

## Problem

React error #421 ("Cannot update a component while rendering a different component") fired during SSR hydration in an Expo Router app using `web.output: "static"`. Zustand persist's `onRehydrateStorage` callback triggered a synchronous `setState` inside React's `hydrateRoot` render pass, causing `WalletBootProvider` — which subscribes to `hasHydrated` via `useStore` — to receive a state update during another component's render phase. Secondary issues (render-phase ref mutations, unstable object references, missing effect deps) compounded the problem.

## Symptoms

- **Production-only console error**: `Error: Cannot update a component while rendering a different component` — invisible in local dev because dev uses client-side rendering without hydration
- **Wallet boot status stuck or flickering**: `WalletBootProvider` deriving incorrect boot status because `hasSeenInflight` was tracked via `useRef` (no re-render on change)
- **Cascading unnecessary re-renders**: `useConnector()` returning a new object reference on every Zustand snapshot, propagating re-renders through all consumers
- **Unstable callback references**: `sign` in `useBrowserWalletSign` changing identity every render because `adapter` was a `useCallback` dependency
- **Effect subscription churn**: `connect.tsx` reconnecting `useStore` subscription and re-running mount effects unnecessarily

## What Didn't Work

1. **`useRef` for `hasSeenInflight` with `useEffect`** — Suggested in a Codex PR review. Refs don't trigger re-renders, so the `useMemo` deriving `walletBootStatus` never recalculated when `hasSeenInflight` changed. Fixed by converting to `useState`.

2. **Leaving `setPlatformCapabilities` in `useStore` subscription** — It was only used inside a mount effect, so including it in the subscription callback caused the subscription itself to be recreated when the function identity changed. Fix: call `walletSessionStore.getState()` directly inside the effect.

3. **Assuming the error was a dev tool artifact** — The error only appeared in production builds (`pnpm export`), making it easy to dismiss during local development.

4. **`requestAnimationFrame` instead of `queueMicrotask`** — Considered as a more aggressive deferral for the Zustand `hasHydrated` setState. `requestAnimationFrame` delays by ~16ms (one paint cycle), which would visibly delay wallet state appearance. `queueMicrotask` defers just past the synchronous render pass with near-zero visual delay. Both work; `queueMicrotask` is preferred for UX unless further testing shows it still triggers #421.

5. **`autoConnect: false` as diagnostic** — `@solana/connector`'s autoConnect fires via `setTimeout(cb, 100)`, which runs after hydration completes. Not the root cause, but worth monitoring if #421 persists after the primary fix.

## Solution

### 1. Defer Zustand hydration setState past React render (primary fix)

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

### 2. Convert render-phase useRef mutation to useState + useEffect

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

### 5. Remove subscription-only values from useStore callback

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

### 6. Add missing effect dependencies

**File**: `apps/app/src/wallet-boot/RequireWallet.tsx`

```typescript
// BEFORE: missing deps
useEffect(() => { /* redirect logic */ }, [walletReady]);

// AFTER: exhaustive deps
useEffect(() => { /* redirect logic */ }, [walletReady, pathname, search, pathParamKeys, router]);
```

## Why This Works

React 18's concurrent renderer strictly enforces render purity: no component may trigger a state update in another component during its render phase. During `hydrateRoot`, Zustand persist's `onRehydrateStorage` fires synchronously, and its `setState` propagates to `WalletBootProvider` (which subscribes via `useStore`) — a cross-component state update during render. `queueMicrotask` defers this past the synchronous render pass, making it an asynchronous batched update instead.

The secondary fixes address React rendering contract violations that compounded the problem:

- **`useRef` → `useState`** for `hasSeenInflight`: React cannot track ref changes; only state changes trigger re-renders and `useMemo` recalculation.
- **`useMemo`/`useCallback` stabilization**: Prevents object identity churn from cascading re-renders through the component tree.
- **Ref pattern for mutable deps**: Reads latest value at call time without destabilizing callback identity.
- **Exhaustive effect deps**: Prevents stale closures and ensures React's rules of hooks are satisfied.
- **Direct store access for non-render values**: Avoids unnecessary subscription to values not used in render, preventing subscription churn.

## Prevention

- **Never call `setState` synchronously inside Zustand persist's `onRehydrateStorage`** — Always defer with `queueMicrotask` (or `requestAnimationFrame` if microtask isn't sufficient). The `hasHydrated` flag must not update during React's render phase.

- **Never mutate refs during render** — Use `useState` + `useEffect` when a derived value must trigger a re-render. Reserve `useRef` for values read imperatively (timer IDs, previous values for comparison).

- **Stabilize adapter return values at the boundary** — When a hook returns an object consumed by React components, wrap in `useMemo` with granular deps. When a callback depends on a frequently-changing value, use the ref pattern to keep the callback stable.

- **Test hydration errors in production builds** — SSR hydration errors don't appear in dev mode (client-side rendering only). Add a CI step or manual smoke test:
  ```bash
  pnpm export && npx serve dist/ && open http://localhost:3000
  ```
  Check the browser console for React error #421 during hydration.

- **Use `useStore` subscriptions carefully** — Only subscribe to values that are actually used in render. Values needed only inside effects should be accessed via `store.getState()` to avoid subscription churn.

## Related Issues

- [PR #46](https://github.com/opsclawd/clmm-v2/pull/46) — fix: resolve React error #421 hydration root cause
- [ConnectorKit Metro hydration failure](../runtime-errors/connectorkit-wallet-probe-metro-package-exports-hydration-failure-2026-04-24.md) — Adjacent: same subsystem (Expo web + Zustand + Solana wallet) but a **build-time** bundling issue, not a runtime React rendering issue
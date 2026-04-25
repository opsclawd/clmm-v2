# Phantom Mobile Hard-Navigation Recovery — Design

- **Status:** Proposed
- **Date:** 2026-04-25
- **Issue:** [opsclawd/clmm-v2#38](https://github.com/opsclawd/clmm-v2/issues/38)
- **Owner:** TBD
- **Reviewers:** TBD

## Problem

Phantom and Solflare mobile in-app WebViews require `window.location` hard navigation because Expo Router soft navigation fails inside wallet browsers (PRs #16 and #18). The current `walletSessionStore` strips browser-wallet identity from persisted state:

```ts
if (state.connectionKind === 'browser') {
  return {
    walletAddress: null,
    connectionKind: null,
    platformCapabilities: state.platformCapabilities,
  };
}
```

Every hard navigation therefore destroys the in-memory browser-wallet session. On reload, the app rehydrates as disconnected and protected routes redirect to `/connect`.

The bug surfaces beyond hard navigation: cold WebViews, slow storage, notification opens, manual reloads, and direct-open of protected routes all land in the same broken state.

## Goal

Make browser-wallet hard-navigation reloads recover correctly without changing Expo versions. Protected routes must distinguish "wallet boot still in progress" from "verified disconnected" and only redirect when the latter is true.

## Non-Goals

- Do not upgrade Expo.
- Do not remove `navigateRoute()`.
- Do not revert hard-navigation for Solana mobile WebViews.
- Do not introduce a second wallet restore mechanism. `@solana/connector`'s `autoConnect` is the single restore authority. Do not add an app-level `provider.connect({ onlyIfTrusted: true })` path.
- Do not add MWA (native) re-verification. Native sessions rehydrate as `connected` directly.
- Do not apply an app-level freshness TTL on the persisted browser candidate. Provider trust is the source of truth.
- Do not solve every wallet-adapter abstraction issue.

## Architecture Summary

Introduce a derived `WalletBootStatus` that is computed centrally and consumed by protected routes through a single wrapper component.

```
┌────────────────────────────────────────────────────────────────┐
│ BrowserWalletProvider                                          │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ AppProvider (@solana/connector, autoConnect: true)         │ │
│ │ ┌──────────────────────────┐ ┌───────────────────────────┐ │ │
│ │ │ BrowserWalletSessionSync │ │ WalletBootProvider        │ │ │
│ │ │  connector connected     │ │  - reads connector status │ │ │
│ │ │  + account →             │ │  - reads store hydration  │ │ │
│ │ │  markConnected()         │ │  - owns 1500ms watchdog   │ │ │
│ │ └──────────────────────────┘ │  - publishes WalletBoot   │ │ │
│ │                              │    Status via context     │ │ │
│ │                              └─────────┬─────────────────┘ │ │
│ │                                        │                   │ │
│ │                                  useWalletBootStatus()     │ │
│ │                                        │                   │ │
│ │                              <RequireWallet>               │ │
│ │                                  ├── BootScreen            │ │
│ │                                  ├── redirect /connect     │ │
│ │                                  └── render children       │ │
│ └────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

Single source of truth, single watchdog, no per-route boot logic.

## Components

### `WalletBootStatus` and `deriveWalletBootStatus`

```ts
type WalletBootStatus =
  | 'hydrating-storage'
  | 'checking-browser-wallet'
  | 'connected'
  | 'disconnected';

type DeriveInput = {
  hasHydrated: boolean;
  connectionKind: WalletConnectionKind | null;
  walletAddress: string | null;
  hasBrowserRestoreCandidate: boolean;
  connectorStatus: WalletStatus;       // from @solana/connector
  connectorAccount: string | null;
  restoreTimedOut: boolean;
};

function deriveWalletBootStatus(input: DeriveInput): WalletBootStatus {
  if (!input.hasHydrated) return 'hydrating-storage';

  if (input.connectionKind === 'native' && input.walletAddress != null) {
    return 'connected';
  }

  if (input.hasBrowserRestoreCandidate) {
    if (input.connectorStatus === 'connected' && input.connectorAccount != null) {
      return 'connected';
    }
    if (isConnectorSettledNotConnected(input.connectorStatus)) {
      return 'disconnected';
    }
    if (input.restoreTimedOut) return 'disconnected';
    return 'checking-browser-wallet';
  }

  return 'disconnected';
}
```

**Precedence ladder (exact order):**
1. Storage not hydrated → `hydrating-storage`
2. Native session present → `connected`
3. Browser restore candidate present:
   1. Connector `connected` + has account → `connected`
   2. Connector settled-not-connected → `disconnected`
   3. Watchdog fired → `disconnected`
   4. Otherwise → `checking-browser-wallet`
4. Default → `disconnected`

`hasBrowserRestoreCandidate` derives from `connectionKind === 'browser' && walletAddress != null`. The function is pure and unit-tested in isolation.

`isConnectorSettledNotConnected(status)` examines `WalletStatus` from `@solana/connector`. The exact value names need verification against the installed `@solana/connector` version before implementation. Until verified, treat any non-`connected` and non-`connecting`/`reconnecting` value as settled-not-connected.

### `WalletBootProvider`

A single component, mounted as a sibling to `BrowserWalletSessionSync` inside `BrowserWalletProvider.web.tsx`. Owns the connector subscription, store subscription, watchdog timer, and the React context that publishes `WalletBootStatus`.

```tsx
const WalletBootContext = createContext<WalletBootStatus>('hydrating-storage');

export function WalletBootProvider({ children }: { children: ReactNode }) {
  const { walletStatus, account } = useConnector();
  const hasHydrated    = useStore(walletSessionStore, s => s.hasHydrated);
  const connectionKind = useStore(walletSessionStore, s => s.connectionKind);
  const walletAddress  = useStore(walletSessionStore, s => s.walletAddress);

  const hasBrowserRestoreCandidate =
    connectionKind === 'browser' && walletAddress != null;

  const [restoreTimedOut, setRestoreTimedOut] = useState(false);

  useEffect(() => {
    if (!hasHydrated || !hasBrowserRestoreCandidate) {
      setRestoreTimedOut(false);
      return;
    }
    const t = setTimeout(() => setRestoreTimedOut(true), 1500);
    return () => clearTimeout(t);
  }, [hasHydrated, hasBrowserRestoreCandidate]);

  const status = deriveWalletBootStatus({
    hasHydrated,
    connectionKind,
    walletAddress,
    hasBrowserRestoreCandidate,
    connectorStatus: walletStatus,
    connectorAccount: account,
    restoreTimedOut,
  });

  return (
    <WalletBootContext.Provider value={status}>
      {children}
    </WalletBootContext.Provider>
  );
}

export function useWalletBootStatus(): WalletBootStatus {
  return useContext(WalletBootContext);
}
```

The watchdog timer starts when `hasHydrated && hasBrowserRestoreCandidate` and fires once after 1500ms. It is not the restore mechanism — `@solana/connector`'s `autoConnect` is. The timer only ensures the boot status can resolve to `disconnected` if the connector never reaches a settled signal.

### `BrowserWalletSessionSync` change

Today's behavior eagerly calls `disconnect()` when the connector reports `!isConnected` and the store has a browser address. With the new design the persisted browser address is a restore candidate, not proof of connection — so this eager disconnect would defeat the watchdog.

```ts
useEffect(() => {
  if (isConnected && account) {
    const store = walletSessionStore.getState();
    if (store.walletAddress === account && store.connectionKind === 'browser') return;
    store.markConnected({ walletAddress: account, connectionKind: 'browser' });
  }
  // No else-disconnect. The boot controller owns disconnect on settled
  // connector failure or watchdog. Explicit user disconnect goes through
  // the wallet/settings UI.
}, [isConnected, account]);
```

### `walletSessionStore` changes

`partialize` stops blanking browser identity:

```ts
partialize: (state) => ({
  walletAddress: state.walletAddress,
  connectionKind: state.connectionKind,
  platformCapabilities: state.platformCapabilities,
  lastConnectedAt: state.lastConnectedAt,
})
```

The `connectionKind === 'browser'` branch is deleted. Browser identity persists on the same terms as native.

New field: `lastConnectedAt: number | null` (epoch ms). Set inside `markConnected`. Telemetry/debug only — `deriveWalletBootStatus` must not read it. Cleared by `disconnect()`.

`walletBootStatus` is **never** stored. It is always derived.

**Migration:** existing users have persisted `{ walletAddress: null, connectionKind: null }`. After the change, on first reload they hit the `disconnected` branch (no restore candidate) and land on `/connect` once — same behavior as today. No migration code needed.

### `<RequireWallet>` wrapper

```tsx
export function RequireWallet({ children }: { children: ReactNode }) {
  const status = useWalletBootStatus();
  const router = useRouter();
  const pathname = usePathname();
  const search   = useGlobalSearchParams();

  useEffect(() => {
    if (status !== 'disconnected') return;
    const fullPath = buildReturnToPath(pathname, search);
    const target = `/connect?returnTo=${encodeURIComponent(fullPath)}`;
    navigateRoute({ router, path: target, method: 'push' });
  }, [status, pathname, search, router]);

  if (status === 'hydrating-storage' || status === 'checking-browser-wallet') {
    return <BootScreen status={status} />;
  }

  if (status === 'disconnected') {
    return null; // effect above handles navigation
  }

  return <>{children}</>;
}
```

`navigateRoute` is used (not `<Redirect>`) so the existing hard-navigation behavior on Solana mobile WebViews is preserved.

`buildReturnToPath(pathname, search)` colocated with `RequireWallet`: joins the current pathname and the current search querystring, **excluding any pre-existing `returnTo`** to prevent recursion.

Each protected route shrinks to:

```tsx
export default function PositionDetailRoute() {
  return (
    <RequireWallet>
      <PositionDetailRouteBody />
    </RequireWallet>
  );
}

function PositionDetailRouteBody() {
  const walletAddress = useStore(walletSessionStore, s => s.walletAddress);
  // existing body, no hydration/redirect checks
}
```

Applied to `/position/[id]`, `/preview/[triggerId]`, `/signing/[attemptId]`, `/execution/[attemptId]`. Tab routes (`(tabs)/positions`, etc.) are not wrapped — they are accessible to disconnected users today and remain so.

### `BootScreen`

Centered `ActivityIndicator` plus one neutral line of text on the existing `#0a0a0a` background. Copy:

- `'checking-browser-wallet'` → `Restoring wallet session…`
- `'hydrating-storage'` → `Loading…`

No new branding, no new design system work. Must not claim success or imply user action is needed.

### `parseReturnTo` utility

```ts
const FALLBACK = '/(tabs)/positions';
const MAX_LENGTH = 512;

export function parseReturnTo(raw: string | string[] | undefined): string {
  if (typeof raw !== 'string') return FALLBACK;
  if (raw.length === 0 || raw.length > MAX_LENGTH) return FALLBACK;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return FALLBACK;
  }

  if (!decoded.startsWith('/')) return FALLBACK;       // must be relative
  if (decoded.startsWith('//')) return FALLBACK;       // reject protocol-relative
  if (decoded.startsWith('/connect')) return FALLBACK; // prevent loop

  return decoded;
}
```

### `connect.tsx` changes

```tsx
const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
const returnTo = useMemo(() => parseReturnTo(params.returnTo), [params.returnTo]);
```

Each post-connect navigation in `handleSelectBrowserWallet`, `handleConnectDefaultBrowser`, and `handleConnectNative` swaps `'/(tabs)/positions'` for `returnTo`. The "Go Back" button keeps `router.back()` semantics. No other changes to `connect.tsx`.

### Native bundle

`BrowserWalletProvider.native.tsx` mounts a `WalletBootProvider` shell that ignores connector state. The derive function still works: `connectorStatus` can be passed as a constant `'disconnected'` and `restoreTimedOut: true`, and the precedence ladder gives `connected` for a persisted native session and `disconnected` otherwise.

## Module Layout

```
apps/app/src/state/
  deriveWalletBootStatus.ts        # pure function
  deriveWalletBootStatus.test.ts   # unit tests
  walletSessionStore.ts            # updated (partialize, lastConnectedAt)
apps/app/src/wallet-boot/
  WalletBootProvider.tsx           # context + watchdog
  useWalletBootStatus.ts           # read-only consumer hook
  BootScreen.tsx                   # spinner + neutral text
  RequireWallet.tsx                # protected-route wrapper
  buildReturnToPath.ts             # current path → return-to value
  parseReturnTo.ts                 # validation + decode utility
  parseReturnTo.test.ts            # unit tests
```

## Data Flow Scenarios

### Hard-nav reload, autoConnect succeeds

1. Pre-reload: store has `walletAddress: 'X', connectionKind: 'browser'` (now persisted under new `partialize`).
2. Page reloads. Storage rehydrates → `hasHydrated: true`. Connector starts in `connecting`.
3. `WalletBootProvider` derives `checking-browser-wallet`. Watchdog timer arms.
4. `<RequireWallet>` renders `<BootScreen />`. No redirect.
5. Connector reaches `connected` + account 'X'. `BrowserWalletSessionSync` notices the address matches and returns early (no-op).
6. `WalletBootProvider` derives `connected`.
7. `<RequireWallet>` renders children. Watchdog cleared on unmount.

### Hard-nav reload, autoConnect fails (settled)

1. Same setup; connector resolves to a settled-not-connected `walletStatus`.
2. `WalletBootProvider` derives `disconnected`.
3. `<RequireWallet>` effect fires `navigateRoute({ path: '/connect?returnTo=…', method: 'push' })`.
4. User reconnects on `/connect`; `handleConnect*` navigates to `returnTo`.

### Hard-nav reload, autoConnect never settles (watchdog)

1. Same setup; connector stays in `connecting` indefinitely.
2. After 1500ms, `restoreTimedOut: true`.
3. `WalletBootProvider` derives `disconnected`. Same flow as above.

### Notification deep-link while disconnected

1. Notification fires; `_layout.tsx` calls `navigateRoute({ path: '/preview/abc', method: 'push' })`.
2. `<RequireWallet>` on `/preview/abc` sees `disconnected`.
3. Redirects to `/connect?returnTo=%2Fpreview%2Fabc`.
4. After connect, lands on `/preview/abc`.

### Native rehydrate

1. Storage rehydrates with `connectionKind: 'native', walletAddress: 'Y'`.
2. `deriveWalletBootStatus` returns `connected` immediately.
3. `<RequireWallet>` renders children. No boot screen flash.

## Error Handling

- **`parseReturnTo` invalid input** → falls back to `/(tabs)/positions`.
- **Connector throws during autoConnect** → `walletStatus` resolves to a settled-not-connected value → boot status becomes `disconnected` → user redirected.
- **Storage rehydration error** → `onRehydrateStorage` still flips `hasHydrated: true` (existing behavior); persisted state is whatever survived → boot resolves through the normal ladder.
- **Watchdog fires before connector starts** → `restoreTimedOut: true` resolves to `disconnected`. If the connector later reports `connected` after redirect, `BrowserWalletSessionSync` fires `markConnected`; the user is already on `/connect` and the next interaction proceeds normally.

## Testing

### Unit

`deriveWalletBootStatus.test.ts` — every branch in the precedence ladder, including:
- `!hasHydrated` short-circuits regardless of other inputs.
- Native + walletAddress → `connected`.
- Browser candidate + connector `connected` + matching account → `connected`.
- Browser candidate + connector `connected` + null account → `checking-browser-wallet` (defensive).
- Browser candidate + connector `connecting`/`reconnecting` → `checking-browser-wallet`.
- Browser candidate + connector settled-not-connected → `disconnected`.
- Browser candidate + watchdog fired → `disconnected`.
- No candidate → `disconnected`.

`parseReturnTo.test.ts` — missing param, empty string, oversize, non-string array form, undecodable input, absolute URL, protocol-relative, `/connect`, `/connect?x=y`, valid `/positions/123`, valid `/preview/abc?triggerId=xyz`.

`walletSessionStore.test.ts` (extend existing):
- `partialize` persists browser identity (snapshot persisted shape).
- `markConnected` writes `lastConnectedAt`.
- `disconnect` clears `lastConnectedAt` and calls `clearStorage`.

### Integration

Test harness mounts `WalletBootProvider` with a mocked `useConnector()` and a fresh `walletSessionStore`. Scenarios:

- Hard-nav reload, autoConnect succeeds → never redirected.
- Hard-nav reload, autoConnect settled-fails → redirect to `/connect?returnTo=…`.
- Hard-nav reload, watchdog path → after 1500ms (fake timers) redirect to `/connect?returnTo=…`.
- Direct-open `/preview/abc?triggerId=xyz` while truly disconnected → redirect path is `/connect?returnTo=%2Fpreview%2Fabc%3FtriggerId%3Dxyz`.
- `returnTo` round-trip through `<ConnectRoute />` → post-connect `navigateRoute` is called with the parsed path.
- `BrowserWalletSessionSync` does **not** disconnect during boot — store still has `walletAddress` after first effect tick when connector reports `!isConnected`.
- Native session rehydrate → children render immediately, no boot screen.

### Manual / device verification (PR description checklist)

**Phantom mobile browser:**
- Connect from `/connect` → hard-nav to `/positions` → reload → stays on `/positions`.
- Direct-open `/position/:id` with prior session → boot screen → lands on position.
- Direct-open `/preview/:triggerId` with prior session → boot screen → lands on preview.
- Direct-open `/signing/:attemptId` with prior session → boot screen → lands on signing.
- Direct-open protected route while truly disconnected → `/connect?returnTo=…` → connect → returns to original.

**Desktop Chrome with Phantom extension:**
- Soft-nav still works (no hard reload).
- Refresh on a protected route restores via boot screen, no false redirect.
- Truly disconnected user lands on connect.

### Verification gates before declaring done

Per `AGENTS.md`:
- `pnpm typecheck`
- `pnpm lint`
- `pnpm boundaries`
- `pnpm test`
- Manual Phantom mobile verification on the deployed branch URL.

## Open Implementation Gates

Before coding starts, verify against the installed `@solana/connector` version:

1. The exact `WalletStatus` enum values, so `isConnectorSettledNotConnected` can list them precisely.
2. Whether `useConnector()` exposes a single "autoConnect settled" signal (e.g., `walletStatus === 'disconnected'` after the autoConnect attempt resolves). If so, the watchdog's role narrows to a backstop. If not, the 1500ms watchdog is the primary `checking-browser-wallet → disconnected` mechanism for unresponsive providers.

These do not change the design shape — only the body of one helper function.

## Definition of Done

The app survives a hard navigation in Phantom mobile browser after connect without falsely returning to `/connect`. Protected execution routes preserve user intent across reloads. No Expo upgrade. No second wallet restore mechanism. Acceptance criteria from issue #38 pass on device.

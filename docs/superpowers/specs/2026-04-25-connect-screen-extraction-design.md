# Connect Screen Extraction: App Shell to Packages/UI

**Date:** 2026-04-25  
**Issue:** https://github.com/opsclawd/clmm-v2/issues/37  
**PR context:** https://github.com/opsclawd/clmm-v2/pull/34#discussion_r3141513191

## Problem

`apps/app/app/connect.tsx` is a 519-line route file that owns wallet discovery state, fallback detection, deep-link handling, connection outcome rendering, and all connect screen UI. This violates the `AGENTS.md` and `repo-map.md` boundary rule:

> `apps/app` is an Expo shell and must not own screens or business logic.

The existing `WalletConnectScreen` in `packages/ui` is a simple presentation component (~415 lines) that accepts `onSelectWallet`, `platformCapabilities`, `connectionOutcome`, and `isConnecting`. It has zero knowledge of browser wallet discovery, fallback states, or deep links.

## Approach

**ViewModel-Driven Screen** (Approach A from brainstorm).

Extend `buildWalletConnectViewModel` to produce a richer view model that covers discovery state, fallback state, discovered wallets with icons, and outcome display. Replace `WalletConnectScreen` in `packages/ui` with a full implementation that renders all connect flow states. The route file becomes a thin shell that wires hooks, builds the view model, and passes it + callbacks to the screen.

## New Types

All new types live in `packages/ui/src/components/WalletConnectionUtils.ts` alongside existing types (`ConnectionOutcome`, `PlatformNotice`, `WalletOption`).

```ts
export type FallbackState =
  | 'none'
  | 'wallet-fallback'
  | 'desktop-no-wallet'
  | 'social-webview';

export type WalletDiscoveryState =
  | 'discovering'
  | 'ready'
  | 'timed-out';

export type DiscoveredWallet = {
  id: string;
  name: string;
  icon: string | null;
};

export type WalletConnectActions = {
  onSelectNative: () => void;
  onSelectDiscoveredWallet: (walletId: string) => void;
  onConnectDefaultBrowser: () => void;
  onOpenPhantom: () => void;
  onOpenSolflare: () => void;
  onOpenInBrowser: () => void;
  onGoBack: () => void;
};
```

These are plain data types with no browser API or adapter dependencies.

## Redesigned View Model

In `packages/ui/src/view-models/WalletConnectionViewModel.ts`:

```ts
export type WalletConnectViewModel = {
  screenState: 'loading' | 'social-webview' | 'standard';

  nativeWalletAvailable: boolean;

  discovery: WalletDiscoveryState;
  discoveredWallets: DiscoveredWallet[];

  fallback: FallbackState;
  socialEscapeAttempted: boolean;

  isConnecting: boolean;
  outcomeDisplay: ConnectionOutcomeDisplay | null;

  platformNotice: PlatformNotice | null;
};

export function buildWalletConnectViewModel(params: {
  platformCapabilities: PlatformCapabilityState | null;
  discovery: WalletDiscoveryState;
  discoveredWallets: DiscoveredWallet[];
  fallback: FallbackState;
  socialEscapeAttempted: boolean;
  isConnecting: boolean;
  connectionOutcome: ConnectionOutcome | null;
}): WalletConnectViewModel;
```

### `screenState` derivation

- `'loading'` when `platformCapabilities` is null
- `'social-webview'` when `fallback === 'social-webview'`
- `'standard'` for all other cases (including `fallback === 'none'`, `'wallet-fallback'`, `'desktop-no-wallet'`)

### `detectFallbackState` stays in `apps/app`

`detectFallbackState` uses `Platform.OS`, `isSocialAppWebView()`, and `navigator.userAgent` — all platform APIs that don't belong in `packages/ui`. The function stays in the route shell. The route shell computes the `FallbackState` and passes the result to the view model builder. The VM builder never touches platform APIs.

## WalletConnectScreen Component

In `packages/ui/src/screens/WalletConnectScreen.tsx`:

**Props:**
```ts
type Props = {
  vm: WalletConnectViewModel;
  actions: WalletConnectActions;
};
```

The screen is pure rendering from the view model. It renders sections based on `vm.screenState`, `vm.discovery`, `vm.fallback`, and `vm.outcomeDisplay`.

### Screen layout by state

| `vm.screenState` | Renders |
|---|---|
| `loading` | Spinner with `colors.safe` ActivityIndicator |
| `social-webview` | Warning banner + Open in Browser button + Phantom/Solflare deep links |
| `standard` | Hero animation + "Protect your Orca positions" title + subtitle + feature bullets + outcome banner + platform notice + native wallet button (if available) + browser wallet discovery section + fallback banners + connecting indicator + Go Back |

Note: PR #35 redesigned the connect screen with a hero animation (`HeroAnimation` component), feature bullets (`FeatureRow` component with Icon), and design system tokens (`colors.*`, `typography.*`). The extraction preserves all of these visual elements. Only the props and rendering logic change — the visual identity stays.

### Browser wallet discovery rendering

| `vm.discovery` | Renders |
|---|---|
| `discovering` | Spinner + "Detecting browser wallets..." |
| `ready` with 1 wallet | Named wallet button with icon |
| `ready` with 2+ wallets | Wallet picker list with icons |
| `timed-out` | Generic "Connect Browser Wallet" fallback button |

### Fallback rendering

| `vm.fallback` | Renders |
|---|---|
| `none` | Nothing extra |
| `wallet-fallback` | "No wallet extension detected" warning + Phantom/Solflare deep links |
| `desktop-no-wallet` | "No wallet extension detected" warning + install guidance |
| `social-webview` | Not rendered here (handled by `screenState`) |

### Outcome banner

Rendered from `vm.outcomeDisplay` with severity-based styling (existing `getConnectionOutcomeDisplay` logic).

## Route Shell

`apps/app/app/connect.tsx` becomes ~60-80 lines:

1. Call hooks: `useStore(walletSessionStore, ...)`, `useBrowserWalletConnect()`, capability fetch effect
2. Compute `WalletDiscoveryState` from `walletCount` and `discoveryTimedOut`
3. Compute `FallbackState` via `detectFallbackState()` (platform API calls stay in the shell)
4. Build view model: `buildWalletConnectViewModel({ ... })`
5. Define `WalletConnectActions` callbacks
6. Return `<WalletConnectScreen vm={vm} actions={actions} />`

The route owns no JSX beyond the screen component. All rendering decisions move to `packages/ui`.

## Dependency Boundaries

Per `repo-map.md`:
- `packages/ui` may import `packages/application/public` and its own UI code only
- `apps/app` may import `packages/ui`, `packages/application/public`, composition bootstrap

**New dependencies added to `packages/ui`:**
- `DiscoveredWallet`, `FallbackState`, `WalletDiscoveryState`, `WalletConnectActions` types (self-contained, no external deps)
- `PlatformCapabilityState` from `@clmm/application/public` (already imported)

**No new dependencies on:**
- `packages/adapters`
- Solana SDKs
- Browser APIs
- `apps/app/src/platform/browserWallet`

The route shell in `apps/app` maps `BrowserWalletOption[]` from the hook to `DiscoveredWallet[]` for the view model — a pure data transformation with no adapter dependency crossing.

## Testing Strategy

1. **`buildWalletConnectViewModel`** — unit tests in `packages/ui` with plain data inputs. Exhaustive coverage of `screenState`, `discovery`, and `fallback` combinations.
2. **`WalletConnectScreen`** — component tests with a view model fixture. Assert correct sections render per `screenState`/`discovery`/`fallback`. No mocks needed.
3. **Route shell** — integration test verifying hook composition produces the correct view model for each state. Light mocking of `useStore` and `useBrowserWalletConnect`.

The view model builder is the primary test surface — pure function, easy to test exhaustively.

## What Stays in `apps/app`

- `useBrowserWalletConnect()` hook call
- `useStore(walletSessionStore, ...)` subscriptions
- Platform capability fetch effect
- `detectFallbackState()` call (uses `Platform.OS`, `isSocialAppWebView`, `navigator.userAgent`)
- Deep-link helper calls (`buildPhantomBrowseUrl`, `buildSolflareBrowseUrl`, `openInExternalBrowser`)
- Navigation calls (`navigateRoute`, `router.back`)
- `mapWalletErrorToOutcome()` and `markOutcome` calls

## What Moves to `packages/ui`

- All render logic currently in `connect.tsx` render functions
- `WalletConnectScreen` component (replaces existing simple version)
- `buildWalletConnectViewModel` builder (extends existing)
- `DiscoveredWallet`, `FallbackState`, `WalletDiscoveryState`, `WalletConnectActions` types

## Files Changed

| File | Change |
|---|---|
| `packages/ui/src/components/WalletConnectionUtils.ts` | Add `FallbackState`, `WalletDiscoveryState`, `DiscoveredWallet`, `WalletConnectActions` types |
| `packages/ui/src/view-models/WalletConnectionViewModel.ts` | Extend `WalletConnectViewModel` type and builder with discovery/fallback/outcome fields |
| `packages/ui/src/screens/WalletConnectScreen.tsx` | Full rewrite — renders from view model + actions |
| `packages/ui/src/index.ts` | Export new types and updated screen |
| `apps/app/app/connect.tsx` | Strip to thin shell (~60-80 lines) |
| `packages/ui/src/screens/WalletConnectScreen.test.ts` | Update for new props, add discovery/fallback tests |
| New: `packages/ui/src/view-models/WalletConnectionViewModel.test.ts` | Unit tests for extended view model builder |

## Out of Scope

- Wallet settings screen extraction (separate concern)
- Sign-in/signing flow extraction (separate screen, separate issue)
- Changes to `packages/application` or `packages/domain`
- Changes to native wallet or deep-link logic (stays in `apps/app/src/platform`)
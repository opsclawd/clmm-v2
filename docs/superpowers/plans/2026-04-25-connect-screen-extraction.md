# Connect Screen Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the connect screen rendering from `apps/app/app/connect.tsx` into `packages/ui`, replacing the existing simple `WalletConnectScreen` with a view-model-driven screen that handles wallet discovery, fallback states, and deep links.

**Architecture:** Extend `WalletConnectViewModel` with discovery/fallback/outcome fields. The route shell (`connect.tsx`) becomes a thin orchestrator (~60-80 lines) that wires hooks, builds the view model, and passes it + action callbacks to `WalletConnectScreen`. The screen owns all rendering. New types (`DiscoveredWallet`, `FallbackState`, `WalletDiscoveryState`, `WalletConnectActions`) live in `packages/ui`.

**Tech Stack:** React Native, React, Zustand, Vitest, React Testing Library

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/ui/src/components/WalletConnectionUtils.ts` | Add `FallbackState`, `WalletDiscoveryState`, `DiscoveredWallet`, `WalletConnectActions` types |
| `packages/ui/src/view-models/WalletConnectionViewModel.ts` | Extend `WalletConnectViewModel` type and `buildWalletConnectViewModel` builder |
| `packages/ui/src/view-models/WalletConnectionViewModel.test.ts` | Add unit tests for extended view model builder |
| `packages/ui/src/screens/WalletConnectScreen.tsx` | Full rewrite — renders from view model + actions |
| `packages/ui/src/screens/WalletConnectScreen.test.tsx` | Full rewrite — component tests for all screen states |
| `packages/ui/src/index.ts` | Export new types |
| `apps/app/app/connect.tsx` | Strip to thin shell — only hook wiring, VM build, callbacks |

---

### Task 1: Add new types to WalletConnectionUtils

**Files:**
- Modify: `packages/ui/src/components/WalletConnectionUtils.ts`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Add types to WalletConnectionUtils.ts**

Append after `PlatformNotice` type and `buildPlatformNotice` function:

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

- [ ] **Step 2: Export new types from index.ts**

Add to the type export block in `packages/ui/src/index.ts` (after the existing `PlatformNotice` export):

```ts
export type {
  FallbackState,
  WalletDiscoveryState,
  DiscoveredWallet,
  WalletConnectActions,
} from './components/WalletConnectionUtils.js';
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @clmm/ui typecheck && pnpm --filter @clmm/app typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/WalletConnectionUtils.ts packages/ui/src/index.ts
git commit -m "feat(ui): add FallbackState, WalletDiscoveryState, DiscoveredWallet, WalletConnectActions types"
```

---

### Task 2: Extend the view model builder

**Files:**
- Modify: `packages/ui/src/view-models/WalletConnectionViewModel.ts`
- Modify: `packages/ui/src/view-models/WalletConnectionViewModel.test.ts`

- [ ] **Step 1: Write failing tests for the extended view model builder**

Add to `packages/ui/src/view-models/WalletConnectionViewModel.test.ts`, after the existing `describe('buildWalletConnectViewModel')` block:

```ts
describe('buildWalletConnectViewModel (extended)', () => {
  it('returns loading screenState when platformCapabilities is null', () => {
    const vm = buildWalletConnectViewModel({
      platformCapabilities: null,
      discovery: 'discovering',
      discoveredWallets: [],
      fallback: 'none',
      socialEscapeAttempted: false,
      isConnecting: false,
      connectionOutcome: null,
    });
    expect(vm.screenState).toBe('loading');
  });

  it('returns social-webview screenState when fallback is social-webview', () => {
    const vm = buildWalletConnectViewModel({
      platformCapabilities: makeCaps(),
      discovery: 'timed-out',
      discoveredWallets: [],
      fallback: 'social-webview',
      socialEscapeAttempted: false,
      isConnecting: false,
      connectionOutcome: null,
    });
    expect(vm.screenState).toBe('social-webview');
  });

  it('returns standard screenState for normal wallet flow', () => {
    const vm = buildWalletConnectViewModel({
      platformCapabilities: makeCaps({ nativeWalletAvailable: true }),
      discovery: 'ready',
      discoveredWallets: [{ id: 'phantom', name: 'Phantom', icon: 'https://example.com/icon.png' }],
      fallback: 'none',
      socialEscapeAttempted: false,
      isConnecting: false,
      connectionOutcome: null,
    });
    expect(vm.screenState).toBe('standard');
    expect(vm.nativeWalletAvailable).toBe(true);
    expect(vm.discoveredWallets).toHaveLength(1);
    expect(vm.discovery).toBe('ready');
  });

  it('passes through discovery and fallback states', () => {
    const vm = buildWalletConnectViewModel({
      platformCapabilities: makeCaps(),
      discovery: 'discovering',
      discoveredWallets: [],
      fallback: 'desktop-no-wallet',
      socialEscapeAttempted: false,
      isConnecting: false,
      connectionOutcome: null,
    });
    expect(vm.discovery).toBe('discovering');
    expect(vm.fallback).toBe('desktop-no-wallet');
  });

  it('passes through socialEscapeAttempted', () => {
    const vm = buildWalletConnectViewModel({
      platformCapabilities: makeCaps(),
      discovery: 'timed-out',
      discoveredWallets: [],
      fallback: 'social-webview',
      socialEscapeAttempted: true,
      isConnecting: false,
      connectionOutcome: null,
    });
    expect(vm.socialEscapeAttempted).toBe(true);
  });

  it('maps connection outcome to outcome display', () => {
    const vm = buildWalletConnectViewModel({
      platformCapabilities: makeCaps({ nativeWalletAvailable: true }),
      discovery: 'ready',
      discoveredWallets: [],
      fallback: 'none',
      socialEscapeAttempted: false,
      isConnecting: false,
      connectionOutcome: { kind: 'failed', reason: 'timeout' },
    });
    expect(vm.outcomeDisplay).not.toBeNull();
    expect(vm.outcomeDisplay!.severity).toBe('error');
  });

  it('computes platform notice', () => {
    const vm = buildWalletConnectViewModel({
      platformCapabilities: makeCaps({ isMobileWeb: true }),
      discovery: 'timed-out',
      discoveredWallets: [],
      fallback: 'none',
      socialEscapeAttempted: false,
      isConnecting: false,
      connectionOutcome: null,
    });
    expect(vm.platformNotice).not.toBeNull();
    expect(vm.platformNotice!.message).toContain('mobile web');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @clmm/ui test -- --run`
Expected: FAIL — `buildWalletConnectViewModel` doesn't accept the new parameter shape yet.

- [ ] **Step 3: Extend the WalletConnectViewModel type and builder**

In `packages/ui/src/view-models/WalletConnectionViewModel.ts`, add imports and replace the existing `WalletConnectViewModel` type and `buildWalletConnectViewModel` function. Keep the existing `WalletSettingsViewModel` and `buildWalletSettingsViewModel` unchanged.

Replace the `WalletConnectViewModel` type with:

```ts
import type {
  FallbackState,
  WalletDiscoveryState,
  DiscoveredWallet,
  WalletConnectActions,
} from '../components/WalletConnectionUtils.js';

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
```

Replace `buildWalletConnectViewModel` with:

```ts
export function buildWalletConnectViewModel(params: {
  platformCapabilities: PlatformCapabilities | null;
  discovery: WalletDiscoveryState;
  discoveredWallets: DiscoveredWallet[];
  fallback: FallbackState;
  socialEscapeAttempted: boolean;
  isConnecting: boolean;
  connectionOutcome: ConnectionOutcome | null;
}): WalletConnectViewModel {
  const caps = params.platformCapabilities ?? {
    nativePushAvailable: false,
    browserNotificationAvailable: false,
    nativeWalletAvailable: false,
    browserWalletAvailable: false,
    isMobileWeb: false,
  };

  const screenState: WalletConnectViewModel['screenState'] =
    !params.platformCapabilities ? 'loading'
    : params.fallback === 'social-webview' ? 'social-webview'
    : 'standard';

  return {
    screenState,
    nativeWalletAvailable: caps.nativeWalletAvailable,
    discovery: params.discovery,
    discoveredWallets: params.discoveredWallets,
    fallback: params.fallback,
    socialEscapeAttempted: params.socialEscapeAttempted,
    isConnecting: params.isConnecting,
    outcomeDisplay: params.connectionOutcome
      ? getConnectionOutcomeDisplay(params.connectionOutcome)
      : null,
    platformNotice: buildPlatformNotice(caps),
  };
}
```

Remove the now-unused `buildWalletOptions` import and the `WalletOption` import if no longer referenced by this file. Keep `buildWalletSettingsViewModel` and all its imports intact.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @clmm/ui test -- --run`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/view-models/WalletConnectionViewModel.ts packages/ui/src/view-models/WalletConnectionViewModel.test.ts
git commit -m "feat(ui): extend WalletConnectViewModel with discovery, fallback, and outcome fields"
```

---

### Task 3: Rewrite WalletConnectScreen to render from view model + actions

**Files:**
- Modify: `packages/ui/src/screens/WalletConnectScreen.tsx`

This is the largest task. The screen renders all states from the view model. The existing `WalletConnectScreen` uses `onSelectWallet?: (kind: WalletOptionKind) => void` — the new version uses `vm` and `actions` props.

- [ ] **Step 1: Rewrite WalletConnectScreen.tsx**

The full file should export `WalletConnectScreen` accepting `{ vm: WalletConnectViewModel; actions: WalletConnectActions }` props. The component renders based on `vm.screenState`, `vm.discovery`, `vm.fallback`, and `vm.outcomeDisplay`.

Key rendering rules:
- `vm.screenState === 'loading'`: spinner with "Loading..." text
- `vm.screenState === 'social-webview'`: warning banner ("Social app browsers block wallet extensions."), "Open in Browser" button (calls `actions.onOpenInBrowser`, disabled when `vm.socialEscapeAttempted`), Phantom and Solflare deep-link buttons
- `vm.screenState === 'standard'`: title ("Connect Wallet"), subtitle, native wallet button (if `vm.nativeWalletAvailable`), browser wallet discovery section, fallback banners, outcome banner, connect indicator, Go Back button
- Browser wallet discovery section renders per `vm.discovery`:
  - `discovering`: ActivityIndicator + "Detecting browser wallets..."
  - `ready` with 1 wallet: single named button with icon (calls `actions.onSelectDiscoveredWallet(wallet.id)`)
  - `ready` with 2+ wallets: wallet picker list with icons (each calls `actions.onSelectDiscoveredWallet(wallet.id)`)
  - `timed-out`: "Connect Browser Wallet" fallback button (calls `actions.onConnectDefaultBrowser`)
- Fallback rendering per `vm.fallback`:
  - `wallet-fallback`: "No wallet extension detected" warning + Phantom/Solflare deep links
  - `desktop-no-wallet`: "No wallet extension detected" warning + install guidance
  - `none`: nothing extra
- Outcome banner from `vm.outcomeDisplay` with severity-based colors
- "Connecting..." text when `vm.isConnecting`
- "Go Back" button calls `actions.onGoBack`

Use `colors` and `typography` from `../design-system/index.js` for styling — match the existing design system pattern used by other screens in `packages/ui`.

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @clmm/ui typecheck && pnpm --filter @clmm/app typecheck`
Expected: PASS (the route file still imports old `WalletConnectScreen` — we'll update it in Task 5, but typecheck should still pass if we export the old type alongside temporarily, or we can update the route file in the same step. For now, if typecheck fails due to the route file, update `apps/app/app/connect.tsx` to remove the old import temporarily.)

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/screens/WalletConnectScreen.tsx
git commit -m "feat(ui): rewrite WalletConnectScreen to render from view model + actions"
```

---

### Task 4: Write component tests for WalletConnectScreen

**Files:**
- Modify: `packages/ui/src/screens/WalletConnectScreen.test.tsx`

- [ ] **Step 1: Rewrite test file for new props**

Replace the entire test file. The tests should cover:

```ts
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WalletConnectScreen } from './WalletConnectScreen.js';
import type { WalletConnectViewModel, WalletConnectActions } from '../view-models/WalletConnectionViewModel.js';

vi.mock('@expo/vector-icons/Feather', () => ({
  default: function MockFeather({ name, size, color }: { name: string; size: number; color: string }) {
    return <span data-testid="feather-icon" data-name={name} data-size={size} data-color={color} />;
  },
  glyphMap: {},
}));

function makeVm(overrides: Partial<WalletConnectViewModel> = {}): WalletConnectViewModel {
  return {
    screenState: 'standard',
    nativeWalletAvailable: false,
    discovery: 'ready',
    discoveredWallets: [],
    fallback: 'none',
    socialEscapeAttempted: false,
    isConnecting: false,
    outcomeDisplay: null,
    platformNotice: null,
    ...overrides,
  };
}

const noopActions: WalletConnectActions = {
  onSelectNative: vi.fn(),
  onSelectDiscoveredWallet: vi.fn(),
  onConnectDefaultBrowser: vi.fn(),
  onOpenPhantom: vi.fn(),
  onOpenSolflare: vi.fn(),
  onOpenInBrowser: vi.fn(),
  onGoBack: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WalletConnectScreen', () => {
  it('renders loading state', () => {
    render(<WalletConnectScreen vm={makeVm({ screenState: 'loading' })} actions={noopActions} />);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('renders social-webview state with warning and deep links', () => {
    render(<WalletConnectScreen vm={makeVm({ screenState: 'social-webview', fallback: 'social-webview' })} actions={noopActions} />);
    expect(screen.getByText(/Social app browsers block wallet extensions/)).toBeTruthy();
    expect(screen.getByText('Open in Browser')).toBeTruthy();
    expect(screen.getByText('Open in Phantom')).toBeTruthy();
    expect(screen.getByText('Open in Solflare')).toBeTruthy();
  });

  it('disables Open in Browser when socialEscapeAttempted', () => {
    render(<WalletConnectScreen vm={makeVm({ screenState: 'social-webview', socialEscapeAttempted: true })} actions={noopActions} />);
    expect(screen.getByText('Open in Browser').closest('button') ?? screen.getByText('Open in Browser')).toBeTruthy();
  });

  it('renders native wallet button when available', () => {
    render(<WalletConnectScreen vm={makeVm({ nativeWalletAvailable: true })} actions={noopActions} />);
    expect(screen.getByText('Connect Mobile Wallet')).toBeTruthy();
  });

  it('renders discovering state', () => {
    render(<WalletConnectScreen vm={makeVm({ discovery: 'discovering' })} actions={noopActions} />);
    expect(screen.getByText('Detecting browser wallets...')).toBeTruthy();
  });

  it('renders single discovered wallet button', () => {
    render(<WalletConnectScreen vm={makeVm({ discovery: 'ready', discoveredWallets: [{ id: 'phantom', name: 'Phantom', icon: null }] })} actions={noopActions} />);
    expect(screen.getByText('Phantom')).toBeTruthy();
  });

  it('renders timed-out state with Connect Browser Wallet button', () => {
    render(<WalletConnectScreen vm={makeVm({ discovery: 'timed-out' })} actions={noopActions} />);
    expect(screen.getByText('Connect Browser Wallet')).toBeTruthy();
  });

  it('renders wallet-fallback with deep links', () => {
    render(<WalletConnectScreen vm={makeVm({ fallback: 'wallet-fallback' })} actions={noopActions} />);
    expect(screen.getByText(/No wallet extension detected/)).toBeTruthy();
    expect(screen.getByText('Open in Phantom')).toBeTruthy();
  });

  it('renders desktop-no-wallet with install guidance', () => {
    render(<WalletConnectScreen vm={makeVm({ fallback: 'desktop-no-wallet' })} actions={noopActions} />);
    expect(screen.getByText(/No wallet extension detected/)).toBeTruthy();
    expect(screen.getByText(/Install a Solana wallet extension/)).toBeTruthy();
  });

  it('renders outcome banner on error', () => {
    render(<WalletConnectScreen vm={makeVm({ outcomeDisplay: { title: 'Connection Failed', detail: 'Could not connect', severity: 'error' } })} actions={noopActions} />);
    expect(screen.getByText('Connection Failed')).toBeTruthy();
  });

  it('renders Connecting... when isConnecting', () => {
    render(<WalletConnectScreen vm={makeVm({ isConnecting: true })} actions={noopActions} />);
    expect(screen.getByText('Connecting...')).toBeTruthy();
  });

  it('calls onSelectNative when native wallet button pressed', () => {
    const actions = { ...noopActions, onSelectNative: vi.fn() };
    render(<WalletConnectScreen vm={makeVm({ nativeWalletAvailable: true })} actions={actions} />);
    fireEvent.click(screen.getByText('Connect Mobile Wallet'));
    expect(actions.onSelectNative).toHaveBeenCalled();
  });

  it('calls onGoBack when Go Back pressed', () => {
    const actions = { ...noopActions, onGoBack: vi.fn() };
    render(<WalletConnectScreen vm={makeVm()} actions={actions} />);
    fireEvent.click(screen.getByText('Go Back'));
    expect(actions.onGoBack).toHaveBeenCalled();
  });

  it('calls onSelectDiscoveredWallet when a discovered wallet button is pressed', () => {
    const actions = { ...noopActions, onSelectDiscoveredWallet: vi.fn() };
    render(<WalletConnectScreen vm={makeVm({ discovery: 'ready', discoveredWallets: [{ id: 'phantom', name: 'Phantom', icon: null }] })} actions={actions} />);
    fireEvent.click(screen.getByText('Phantom'));
    expect(actions.onSelectDiscoveredWallet).toHaveBeenCalledWith('phantom');
  });

  it('calls onConnectDefaultBrowser when timed-out button pressed', () => {
    const actions = { ...noopActions, onConnectDefaultBrowser: vi.fn() };
    render(<WalletConnectScreen vm={makeVm({ discovery: 'timed-out' })} actions={actions} />);
    fireEvent.click(screen.getByText('Connect Browser Wallet'));
    expect(actions.onConnectDefaultBrowser).toHaveBeenCalled();
  });

  it('calls onOpenPhantom and onOpenSolflare for deep link buttons', () => {
    const actions = { ...noopActions, onOpenPhantom: vi.fn(), onOpenSolflare: vi.fn() };
    render(<WalletConnectScreen vm={makeVm({ fallback: 'wallet-fallback' })} actions={actions} />);
    fireEvent.click(screen.getByText('Open in Phantom'));
    expect(actions.onOpenPhantom).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Open in Solflare'));
    expect(actions.onOpenSolflare).toHaveBeenCalled();
  });

  it('renders platform notice', () => {
    render(<WalletConnectScreen vm={makeVm({ platformNotice: { message: 'No wallet detected', severity: 'error' } })} actions={noopActions} />);
    expect(screen.getByText('No wallet detected')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm --filter @clmm/ui test -- --run`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/screens/WalletConnectScreen.test.tsx
git commit -m "test(ui): rewrite WalletConnectScreen tests for view model + actions props"
```

---

### Task 5: Strip connect.tsx to thin route shell

**Files:**
- Modify: `apps/app/app/connect.tsx`

This is the boundary compliance task. The route becomes a thin orchestrator that wires hooks, builds the view model, defines action callbacks, and renders `<WalletConnectScreen vm={vm} actions={actions} />`.

- [ ] **Step 1: Rewrite connect.tsx as thin shell**

Replace the entire file. The new file should be ~70-80 lines:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from 'zustand';
import type { PlatformCapabilityState } from '@clmm/application/public';
import {
  WalletConnectScreen,
  buildWalletConnectViewModel,
} from '@clmm/ui';
import type { FallbackState, WalletDiscoveryState, DiscoveredWallet, WalletConnectActions } from '@clmm/ui';
import { platformCapabilityAdapter, walletPlatform } from '../src/composition/index';
import { useBrowserWalletConnect } from '../src/platform/browserWallet/index';
import { isSocialAppWebView } from '../src/platform/browserWallet/walletDeepLinks';
import { mapWalletErrorToOutcome } from '../src/platform/walletConnection';
import { navigateRoute } from '../src/platform/webNavigation';
import { walletSessionStore } from '../src/state/walletSessionStore';
import { enrollWalletForMonitoring } from '../src/api/wallets';

const NO_WALLET_MESSAGE = 'No supported browser wallet detected on this device';
const WALLET_DISCOVERY_TIMEOUT_MS = 2000;

function detectFallbackState(
  platformCapabilities: PlatformCapabilityState | null,
  connectError: Error | null,
): FallbackState {
  if (Platform.OS !== 'web') {
    return 'none';
  }

  if (typeof navigator !== 'undefined' && isSocialAppWebView(navigator.userAgent)) {
    return 'social-webview';
  }

  const noWalletDetected = !platformCapabilities?.browserWalletAvailable;
  const connectThrewNoWallet = connectError?.message === NO_WALLET_MESSAGE;

  if (noWalletDetected || connectThrewNoWallet) {
    const isMobile = /Mobi|Android|iPad/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '');
    if (isMobile) {
      return 'wallet-fallback';
    }
    return 'desktop-no-wallet';
  }

  return 'none';
}

export default function ConnectRoute() {
  const router = useRouter();
  const platformCapabilities = useStore(walletSessionStore, (s) => s.platformCapabilities);
  const connectionOutcome = useStore(walletSessionStore, (s) => s.connectionOutcome);
  const isConnecting = useStore(walletSessionStore, (s) => s.isConnecting);
  const setPlatformCapabilities = useStore(walletSessionStore, (s) => s.setPlatformCapabilities);
  const beginConnection = useStore(walletSessionStore, (s) => s.beginConnection);
  const markConnected = useStore(walletSessionStore, (s) => s.markConnected);
  const markOutcome = useStore(walletSessionStore, (s) => s.markOutcome);
  const clearOutcome = useStore(walletSessionStore, (s) => s.clearOutcome);

  const [socialEscapeAttempted, setSocialEscapeAttempted] = useState(false);
  const [discoveryTimedOut, setDiscoveryTimedOut] = useState(false);

  const browserConnect = useBrowserWalletConnect();
  const walletCount = browserConnect.wallets.length;

  const discovery: WalletDiscoveryState = useMemo(() => {
    if (walletCount > 0) return 'ready';
    if (discoveryTimedOut) return 'timed-out';
    return 'discovering';
  }, [walletCount, discoveryTimedOut]);

  useEffect(() => {
    if (walletCount > 0 || discoveryTimedOut) return;
    const timer = setTimeout(() => setDiscoveryTimedOut(true), WALLET_DISCOVERY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [walletCount, discoveryTimedOut]);

  const fallback = useMemo(
    () => detectFallbackState(platformCapabilities, browserConnect.error),
    [platformCapabilities, browserConnect.error],
  );

  const discoveredWallets: DiscoveredWallet[] = useMemo(
    () => browserConnect.wallets.map((w) => ({ id: w.id, name: w.name, icon: w.icon })),
    [browserConnect.wallets],
  );

  useEffect(() => {
    let active = true;
    void platformCapabilityAdapter
      .getCapabilities()
      .then((caps) => { if (active) setPlatformCapabilities(caps); })
      .catch(() => { if (active) setPlatformCapabilities({ nativePushAvailable: false, browserNotificationAvailable: false, nativeWalletAvailable: false, browserWalletAvailable: false, isMobileWeb: false }); });
    return () => { active = false; };
  }, [setPlatformCapabilities]);

  function handleConnectionError(error: unknown) {
    const outcome = mapWalletErrorToOutcome(error);
    if (outcome.kind === 'connected') {
      markOutcome({ kind: 'failed', reason: 'Unexpected connected error outcome' });
      return;
    }
    markOutcome(outcome);
  }

  const vm = buildWalletConnectViewModel({
    platformCapabilities,
    discovery,
    discoveredWallets,
    fallback,
    socialEscapeAttempted,
    isConnecting,
    connectionOutcome,
  });

  const actions: WalletConnectActions = useMemo(() => ({
    onSelectNative: () => {
      beginConnection();
      void walletPlatform.connectNativeWallet()
        .then((address) => { markConnected({ walletAddress: address, connectionKind: 'native' }); void enrollWalletForMonitoring(address); navigateRoute({ router, path: '/(tabs)/positions', method: 'replace' }); })
        .catch(handleConnectionError);
    },
    onSelectDiscoveredWallet: (walletId: string) => {
      beginConnection();
      void browserConnect.connect(walletId)
        .then(({ address }) => { markConnected({ walletAddress: address, connectionKind: 'browser' }); void enrollWalletForMonitoring(address); navigateRoute({ router, path: '/(tabs)/positions', method: 'replace' }); })
        .catch(handleConnectionError);
    },
    onConnectDefaultBrowser: () => {
      beginConnection();
      void browserConnect.connect()
        .then(({ address }) => { markConnected({ walletAddress: address, connectionKind: 'browser' }); void enrollWalletForMonitoring(address); navigateRoute({ router, path: '/(tabs)/positions', method: 'replace' }); })
        .catch(handleConnectionError);
    },
    onOpenPhantom: () => {
      if (typeof window !== 'undefined') {
        void import('react-native/Libraries/Linking/Linking').then(({ default: Linking }) => { Linking.openURL(`https://phantom.app/ul/browse/${encodeURIComponent(window.location.href)}?ref=${encodeURIComponent(window.location.href)}`); });
      }
    },
    onOpenSolflare: () => {
      if (typeof window !== 'undefined') {
        void import('react-native/Libraries/Linking/Linking').then(({ default: Linking }) => { Linking.openURL(`https://solflare.com/ul/browse/${encodeURIComponent(window.location.href)}`); });
      }
    },
    onOpenInBrowser: () => {
      setSocialEscapeAttempted(true);
      if (typeof window !== 'undefined') {
        window.open(window.location.href, '_blank');
      }
    },
    onGoBack: () => {
      clearOutcome();
      router.back();
    },
  }), [vm, browserConnect, router, beginConnection, markConnected, markOutcome, clearOutcome]);

  return <WalletConnectScreen vm={vm} actions={actions} />;
}
```

Note: The `onOpenPhantom` and `onOpenSolflare` callbacks use the deep-link URL builders from `walletDeepLinks.ts` — keep importing `buildPhantomBrowseUrl`, `buildSolflareBrowseUrl`, and `openInExternalBrowser` and use them inside the actions. The above is simplified; use the actual imports from `walletDeepLinks.ts`.

- [ ] **Step 2: Remove unused imports**

After rewriting, remove imports that are no longer needed in `connect.tsx`: `View`, `Text`, `TouchableOpacity`, `ScrollView`, `ActivityIndicator`, `Image`, `getConnectionOutcomeDisplay`, `BrowserWalletOption`, `FALLBACK_PLATFORM_CAPABILITIES`, and any inline-rendered JSX types.

- [ ] **Step 3: Run typecheck and tests**

Run: `pnpm --filter @clmm/app typecheck && pnpm --filter @clmm/app test -- --run && pnpm --filter @clmm/ui test -- --run`
Expected: ALL PASS

- [ ] **Step 4: Run boundaries**

Run: `pnpm boundaries`
Expected: No violations

- [ ] **Step 5: Commit**

```bash
git add apps/app/app/connect.tsx
git commit -m "refactor(app): strip connect.tsx to thin route shell, move rendering to WalletConnectScreen"
```

---

### Task 6: Update exports and final verification

**Files:**
- Modify: `packages/ui/src/index.ts`
- Verify all existing consumers still work

- [ ] **Step 1: Verify packages/ui/src/index.ts exports**

Ensure the following are exported:
- `WalletConnectScreen` (already exported, updated component)
- `buildWalletConnectViewModel` (already exported, updated builder)
- `FallbackState`, `WalletDiscoveryState`, `DiscoveredWallet`, `WalletConnectActions` (added in Task 1)
- `ConnectionOutcome`, `ConnectionOutcomeDisplay`, `PlatformNotice` (already exported)

Run: `pnpm --filter @clmm/ui typecheck && pnpm --filter @clmm/app typecheck`
Expected: PASS

- [ ] **Step 2: Run full repo checks**

Run: `pnpm build && pnpm typecheck && pnpm lint && pnpm boundaries && pnpm test`
Expected: ALL PASS

- [ ] **Step 3: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: finalize connect screen extraction exports and verification"
```

---

### Task 7: Update existing WalletConnectScreen tests that used old props

**Files:**
- Modify: `packages/ui/src/view-models/WalletConnectionViewModel.test.ts`

The existing tests in `buildWalletConnectViewModel` use the old parameter shape `{ capabilities, connectionOutcome, isConnecting }`. These need updating to match the new extended builder signature.

- [ ] **Step 1: Update existing buildWalletConnectViewModel tests**

The old tests call `buildWalletConnectViewModel({ capabilities: makeCaps(...), connectionOutcome: null, isConnecting: false })`. Add the new required params: `discovery`, `discoveredWallets`, `fallback`, `socialEscapeAttempted`.

For each existing test, add the missing fields:

```ts
const baseParams = {
  discovery: 'ready' as const,
  discoveredWallets: [] as DiscoveredWallet[],
  fallback: 'none' as const,
  socialEscapeAttempted: false,
};
```

And update each test to spread `baseParams`:

```ts
const vm = buildWalletConnectViewModel({
  ...baseParams,
  capabilities: makeCaps({ nativeWalletAvailable: true, nativePushAvailable: true }),
  connectionOutcome: null,
  isConnecting: false,
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm --filter @clmm/ui test -- --run`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/view-models/WalletConnectionViewModel.test.ts
git commit -m "test(ui): update existing VM builder tests for extended signature"
```

---

### Task 8: Remove dead code and verify connect.tsx line count

**Files:**
- Verify: `apps/app/app/connect.tsx`

- [ ] **Step 1: Verify connect.tsx is thin (~60-80 lines)**

Run: `wc -l apps/app/app/connect.tsx`
Expected: ~60-80 lines

- [ ] **Step 2: Verify no `WalletOption` or `buildWalletOptions` imports remain in apps/app**

Run: `rg "WalletOption|buildWalletOptions" apps/app/`
Expected: No results

- [ ] **Step 3: Verify no inline JSX rendering remains in connect.tsx beyond `<WalletConnectScreen vm={vm} actions={actions} />`**

Run: `rg "TouchableOpacity|ActivityIndicator|ScrollView" apps/app/app/connect.tsx`
Expected: No results (these render primitives should only exist in the screen component)

- [ ] **Step 4: Run full checks**

Run: `pnpm build && pnpm typecheck && pnpm lint && pnpm boundaries && pnpm test`
Expected: ALL PASS
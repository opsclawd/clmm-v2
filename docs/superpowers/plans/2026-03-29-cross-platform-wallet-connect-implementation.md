# Cross-Platform Wallet Connect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make wallet connection work end-to-end from the Positions screen on web and native by wiring app-shell state, route handlers, platform capability loading, and browser/native connect bridges.

**Architecture:** Keep `packages/ui` presentational and move all wallet session, navigation, and platform logic into `apps/app`. Add a small Zustand wallet session store, replace thin route re-exports with real route components, and introduce app-shell web/native wallet bridges that normalize connection outcomes into the existing UI prop contract.

**Tech Stack:** Expo Router, React Native, Zustand, Vitest, `@clmm/ui`, `@clmm/application/public`, `@clmm/adapters`, `@solana/wallet-adapter-react`, `@solana/wallet-adapter-wallets`, Mobile Wallet Adapter

---

## File Map

### Create

- `apps/app/src/state/walletSessionStore.ts` — Zustand store for wallet address, connection kind, outcome, capabilities, and connection lifecycle actions.
- `apps/app/src/state/walletSessionStore.test.ts` — node-environment tests for wallet session transitions.
- `apps/app/src/platform/browserWallet.ts` — browser wallet bridge that detects provider availability, connects, disconnects, and normalizes outcomes.
- `apps/app/src/platform/browserWallet.test.ts` — tests for browser wallet outcome mapping and provider selection helpers.
- `apps/app/src/platform/nativeWallet.ts` — native wallet connect bridge for authorization/address capture and normalized outcomes.
- `apps/app/src/platform/walletConnection.ts` — app-shell pure helpers that map platform/bridge results into store updates.
- `apps/app/src/platform/walletConnection.test.ts` — tests for normalized connection handling.
- `apps/app/vitest.config.ts` — app-local Vitest config using node environment for `src/**/*.test.ts`.

### Modify

- `apps/app/package.json` — add app-side browser wallet dependencies and `test` script.
- `apps/app/src/composition/index.ts` — export any app-safe helpers needed to load capabilities and construct native/browser bridge dependencies without leaking adapters into route files.
- `apps/app/src/platform/index.ts` — export new platform wallet bridge modules if the file already serves as the platform barrel.
- `apps/app/app/(tabs)/positions.tsx` — replace re-export with route component that reads wallet session store and navigates to `/connect`.
- `apps/app/app/connect.tsx` — replace re-export with route component that loads capabilities, starts connect flow, and returns to Positions on success.
- `apps/app/app/(tabs)/wallet.tsx` — replace re-export with route component that reads wallet session store and wires reconnect/switch/disconnect.
- `apps/app/app/_layout.tsx` — add any required provider wrappers for browser wallet adapter context on web while keeping existing query client setup.

### Verify Existing Files Still Fit

- `packages/ui/src/screens/PositionsListScreen.tsx`
- `packages/ui/src/screens/WalletConnectScreen.tsx`
- `packages/ui/src/screens/WalletSettingsScreen.tsx`

These should remain presentational. Only change them if a proven prop mismatch blocks the app-shell wiring.

---

### Task 1: Add App Test Harness And Browser Wallet Dependencies

**Files:**
- Create: `apps/app/vitest.config.ts`
- Modify: `apps/app/package.json`
- Test: `apps/app/src/state/walletSessionStore.test.ts` (placeholder file created in Task 2)

- [ ] **Step 1: Add the app Vitest config**

Create `apps/app/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
    },
  },
});
```

- [ ] **Step 2: Add app test script and browser wallet dependencies**

Update `apps/app/package.json` scripts and dependencies:

```json
{
  "scripts": {
    "dev": "expo start",
    "dev:web": "expo start --web",
    "build": "expo export",
    "typecheck": "tsc --noEmit",
    "lint": "eslint app src --ext .ts,.tsx",
    "test": "vitest run --config vitest.config.ts"
  },
  "dependencies": {
    "@clmm/application": "workspace:*",
    "@clmm/ui": "workspace:*",
    "@solana/wallet-adapter-base": "^0.9.27",
    "@solana/wallet-adapter-react": "^0.15.39",
    "@solana/wallet-adapter-wallets": "^0.19.37",
    "@tanstack/react-query": "^5.0.0",
    "expo": "~52.0.49",
    "expo-linking": "~6.3.0",
    "expo-notifications": "~0.28.0",
    "expo-router": "~4.0.22",
    "nativewind": "^4.0.0",
    "react": "18.3.1",
    "react-native": "0.76.9",
    "react-native-reanimated": "~3.16.1",
    "react-native-safe-area-context": "4.12.0",
    "react-native-screens": "~4.4.0",
    "react-native-web": "~0.19.13",
    "tailwindcss": "^3.0.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@clmm/adapters": "workspace:*",
    "@clmm/config": "workspace:*",
    "@types/react": "~18.3.1",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 3: Install dependencies**

Run:

```bash
pnpm install --filter @clmm/app...
```

Expected: lockfile updates and install completes without version resolution errors.

- [ ] **Step 4: Verify app test runner boots**

Run:

```bash
pnpm --filter @clmm/app test
```

Expected: PASS with `No test files found` or `0 passed` and exit code 0.

- [ ] **Step 5: Commit**

```bash
git add apps/app/package.json apps/app/vitest.config.ts pnpm-lock.yaml
git commit -m "chore(app): add wallet connect test harness and browser wallet deps"
```

### Task 2: Add Wallet Session Store With TDD

**Files:**
- Create: `apps/app/src/state/walletSessionStore.ts`
- Create: `apps/app/src/state/walletSessionStore.test.ts`

- [ ] **Step 1: Write the failing store tests**

Create `apps/app/src/state/walletSessionStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { PlatformCapabilityState } from '@clmm/application/public';
import {
  createWalletSessionStore,
  type WalletConnectionKind,
} from './walletSessionStore.js';

const caps: PlatformCapabilityState = {
  nativePushAvailable: false,
  browserNotificationAvailable: true,
  nativeWalletAvailable: false,
  browserWalletAvailable: true,
  isMobileWeb: false,
};

describe('walletSessionStore', () => {
  beforeEach(() => {
    // Each test creates a fresh store instance.
  });

  it('loads platform capabilities into state', () => {
    const store = createWalletSessionStore();

    store.getState().setPlatformCapabilities(caps);

    expect(store.getState().platformCapabilities).toEqual(caps);
  });

  it('marks a successful connection with address and kind', () => {
    const store = createWalletSessionStore();

    store.getState().markConnected({
      walletAddress: 'DemoWallet1111111111111111111111111111111111',
      connectionKind: 'browser',
    });

    expect(store.getState().walletAddress).toBe('DemoWallet1111111111111111111111111111111111');
    expect(store.getState().connectionKind).toBe('browser');
    expect(store.getState().connectionOutcome).toEqual({ kind: 'connected' });
    expect(store.getState().isConnecting).toBe(false);
  });

  it.each([
    [{ kind: 'cancelled' }],
    [{ kind: 'interrupted' }],
    [{ kind: 'failed', reason: 'boom' }],
  ] as const)('stores non-success outcomes: %j', (outcome) => {
    const store = createWalletSessionStore();

    store.getState().beginConnection();
    store.getState().markOutcome(outcome);

    expect(store.getState().connectionOutcome).toEqual(outcome);
    expect(store.getState().isConnecting).toBe(false);
    expect(store.getState().walletAddress).toBeNull();
    expect(store.getState().connectionKind).toBeNull();
  });

  it('disconnect clears address, kind, and connecting state', () => {
    const store = createWalletSessionStore();

    store.getState().markConnected({
      walletAddress: 'DemoWallet1111111111111111111111111111111111',
      connectionKind: 'browser',
    });
    store.getState().disconnect();

    expect(store.getState().walletAddress).toBeNull();
    expect(store.getState().connectionKind).toBeNull();
    expect(store.getState().isConnecting).toBe(false);
  });

  it('clears stale outcome without dropping connected session', () => {
    const store = createWalletSessionStore();

    store.getState().markConnected({
      walletAddress: 'DemoWallet1111111111111111111111111111111111',
      connectionKind: 'browser' satisfies WalletConnectionKind,
    });
    store.getState().clearOutcome();

    expect(store.getState().walletAddress).toBe('DemoWallet1111111111111111111111111111111111');
    expect(store.getState().connectionOutcome).toBeNull();
  });
});
```

- [ ] **Step 2: Run the store test to verify it fails**

Run:

```bash
pnpm --filter @clmm/app test -- src/state/walletSessionStore.test.ts
```

Expected: FAIL because `walletSessionStore.ts` does not exist yet.

- [ ] **Step 3: Write the minimal wallet session store**

Create `apps/app/src/state/walletSessionStore.ts`:

```ts
import { createStore } from 'zustand/vanilla';
import type { PlatformCapabilityState } from '@clmm/application/public';
import type { ConnectionOutcome } from '@clmm/ui';

export type WalletConnectionKind = 'native' | 'browser';

export type WalletSessionState = {
  walletAddress: string | null;
  connectionKind: WalletConnectionKind | null;
  connectionOutcome: ConnectionOutcome | null;
  platformCapabilities: PlatformCapabilityState | null;
  isConnecting: boolean;
  setPlatformCapabilities: (capabilities: PlatformCapabilityState) => void;
  beginConnection: () => void;
  markConnected: (params: {
    walletAddress: string;
    connectionKind: WalletConnectionKind;
  }) => void;
  markOutcome: (outcome: ConnectionOutcome) => void;
  disconnect: () => void;
  clearOutcome: () => void;
};

export function createWalletSessionStore() {
  return createStore<WalletSessionState>((set) => ({
    walletAddress: null,
    connectionKind: null,
    connectionOutcome: null,
    platformCapabilities: null,
    isConnecting: false,
    setPlatformCapabilities: (platformCapabilities) => set({ platformCapabilities }),
    beginConnection: () => set({ isConnecting: true, connectionOutcome: null }),
    markConnected: ({ walletAddress, connectionKind }) =>
      set({
        walletAddress,
        connectionKind,
        connectionOutcome: { kind: 'connected' },
        isConnecting: false,
      }),
    markOutcome: (connectionOutcome) =>
      set({
        connectionOutcome,
        isConnecting: false,
        walletAddress: null,
        connectionKind: null,
      }),
    disconnect: () =>
      set({
        walletAddress: null,
        connectionKind: null,
        connectionOutcome: null,
        isConnecting: false,
      }),
    clearOutcome: () => set({ connectionOutcome: null }),
  }));
}

export const walletSessionStore = createWalletSessionStore();
```

- [ ] **Step 4: Run the store test to verify it passes**

Run:

```bash
pnpm --filter @clmm/app test -- src/state/walletSessionStore.test.ts
```

Expected: PASS with all wallet session store tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/state/walletSessionStore.ts apps/app/src/state/walletSessionStore.test.ts
git commit -m "feat(app): add wallet session store"
```

### Task 3: Add Pure Wallet Connection Result Mapping Helpers With TDD

**Files:**
- Create: `apps/app/src/platform/walletConnection.ts`
- Create: `apps/app/src/platform/walletConnection.test.ts`

- [ ] **Step 1: Write failing tests for bridge result normalization**

Create `apps/app/src/platform/walletConnection.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  mapWalletErrorToOutcome,
  normalizeSuccessfulConnection,
} from './walletConnection.js';

describe('walletConnection helpers', () => {
  it('maps user rejected errors to cancelled', () => {
    expect(mapWalletErrorToOutcome(new Error('User rejected the request'))).toEqual({ kind: 'cancelled' });
  });

  it('maps interruption-style errors to interrupted', () => {
    expect(mapWalletErrorToOutcome(new Error('Connection interrupted during handoff'))).toEqual({ kind: 'interrupted' });
  });

  it('maps unknown errors to failed with reason', () => {
    expect(mapWalletErrorToOutcome(new Error('Provider exploded'))).toEqual({
      kind: 'failed',
      reason: 'Provider exploded',
    });
  });

  it('normalizes successful browser connection payloads', () => {
    expect(
      normalizeSuccessfulConnection({
        address: 'DemoWallet1111111111111111111111111111111111',
        connectionKind: 'browser',
      }),
    ).toEqual({
      walletAddress: 'DemoWallet1111111111111111111111111111111111',
      connectionKind: 'browser',
    });
  });
});
```

- [ ] **Step 2: Run the helper test to verify it fails**

Run:

```bash
pnpm --filter @clmm/app test -- src/platform/walletConnection.test.ts
```

Expected: FAIL because `walletConnection.ts` does not exist yet.

- [ ] **Step 3: Write the minimal helper implementation**

Create `apps/app/src/platform/walletConnection.ts`:

```ts
import type { ConnectionOutcome } from '@clmm/ui';
import type { WalletConnectionKind } from '../state/walletSessionStore.js';

export function mapWalletErrorToOutcome(error: unknown): ConnectionOutcome {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes('User rejected') ||
    message.includes('declined') ||
    message.includes('cancelled') ||
    message.includes('canceled')
  ) {
    return { kind: 'cancelled' };
  }

  if (
    message.includes('interrupted') ||
    message.includes('timeout') ||
    message.includes('closed')
  ) {
    return { kind: 'interrupted' };
  }

  return {
    kind: 'failed',
    reason: message,
  };
}

export function normalizeSuccessfulConnection(params: {
  address: string;
  connectionKind: WalletConnectionKind;
}) {
  return {
    walletAddress: params.address,
    connectionKind: params.connectionKind,
  };
}
```

- [ ] **Step 4: Run the helper test to verify it passes**

Run:

```bash
pnpm --filter @clmm/app test -- src/platform/walletConnection.test.ts
```

Expected: PASS with all mapping tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/platform/walletConnection.ts apps/app/src/platform/walletConnection.test.ts
git commit -m "feat(app): add wallet connection outcome helpers"
```

### Task 4: Add Browser Wallet Bridge With TDD

**Files:**
- Create: `apps/app/src/platform/browserWallet.ts`
- Create: `apps/app/src/platform/browserWallet.test.ts`
- Modify: `apps/app/src/platform/index.ts`

- [ ] **Step 1: Write failing tests for browser wallet bridge helpers**

Create `apps/app/src/platform/browserWallet.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  getInjectedBrowserProvider,
  normalizeBrowserWalletAddress,
} from './browserWallet.js';

describe('browserWallet helpers', () => {
  it('returns null when no browser wallet provider exists', () => {
    expect(getInjectedBrowserProvider(undefined)).toBeNull();
  });

  it('prefers phantom provider when available', () => {
    const provider = { isPhantom: true, connect: async () => ({ publicKey: { toBase58: () => 'abc' } }) };

    expect(getInjectedBrowserProvider({ solana: provider })).toBe(provider);
  });

  it('normalizes a provider public key into base58 address text', () => {
    expect(
      normalizeBrowserWalletAddress({
        toBase58: () => 'DemoWallet1111111111111111111111111111111111',
      }),
    ).toBe('DemoWallet1111111111111111111111111111111111');
  });
});
```

- [ ] **Step 2: Run the browser wallet helper test to verify it fails**

Run:

```bash
pnpm --filter @clmm/app test -- src/platform/browserWallet.test.ts
```

Expected: FAIL because `browserWallet.ts` does not exist yet.

- [ ] **Step 3: Write the browser wallet bridge**

Create `apps/app/src/platform/browserWallet.ts`:

```ts
export type BrowserWalletPublicKey = {
  toBase58(): string;
};

export type BrowserWalletProvider = {
  isPhantom?: boolean;
  publicKey?: BrowserWalletPublicKey | null;
  connect(): Promise<{ publicKey?: BrowserWalletPublicKey | null }>;
  disconnect?(): Promise<void>;
};

export type BrowserWalletWindow = {
  solana?: BrowserWalletProvider;
};

export function getInjectedBrowserProvider(browserWindow: BrowserWalletWindow | undefined): BrowserWalletProvider | null {
  return browserWindow?.solana ?? null;
}

export function normalizeBrowserWalletAddress(publicKey: BrowserWalletPublicKey | null | undefined): string {
  if (!publicKey) {
    throw new Error('Wallet provider did not return a public key');
  }

  return publicKey.toBase58();
}

export async function connectBrowserWallet(browserWindow: BrowserWalletWindow | undefined): Promise<string> {
  const provider = getInjectedBrowserProvider(browserWindow);

  if (!provider) {
    throw new Error('No supported browser wallet detected on this device');
  }

  const result = await provider.connect();
  return normalizeBrowserWalletAddress(result.publicKey ?? provider.publicKey ?? null);
}

export async function disconnectBrowserWallet(browserWindow: BrowserWalletWindow | undefined): Promise<void> {
  const provider = getInjectedBrowserProvider(browserWindow);
  await provider?.disconnect?.();
}
```

- [ ] **Step 4: Export the browser wallet bridge from the platform barrel if needed**

If `apps/app/src/platform/index.ts` is a barrel, add:

```ts
export * from './browserWallet.js';
export * from './walletConnection.js';
```

Preserve existing exports.

- [ ] **Step 5: Run the browser wallet helper test to verify it passes**

Run:

```bash
pnpm --filter @clmm/app test -- src/platform/browserWallet.test.ts
```

Expected: PASS with all browser wallet helper tests green.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/platform/browserWallet.ts apps/app/src/platform/browserWallet.test.ts apps/app/src/platform/index.ts
git commit -m "feat(app): add browser wallet connection bridge"
```

### Task 5: Add Native Wallet Connect Bridge

**Files:**
- Create: `apps/app/src/platform/nativeWallet.ts`
- Modify: `apps/app/src/composition/index.ts`

- [ ] **Step 1: Add a minimal native connect bridge module**

Create `apps/app/src/platform/nativeWallet.ts`:

```ts
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-kit';
import type { Chain } from '@solana-mobile/mobile-wallet-adapter-protocol';

const APP_IDENTITY = {
  name: 'CLMM V2',
  uri: 'https://clmm.v2.app',
  icon: 'favicon.ico',
};

export async function connectNativeWallet(cluster: string = 'solana:mainnet'): Promise<string> {
  const authorization = await transact(async (wallet) => {
    return wallet.authorize({
      identity: APP_IDENTITY,
      chain: cluster as Chain,
    });
  });

  const account = authorization.accounts[0];
  if (!account) {
    throw new Error('Native wallet did not return an authorized account');
  }

  return account.address;
}
```

- [ ] **Step 2: Extend composition exports if the route needs app-safe helpers**

If route files should avoid importing platform modules directly, update `apps/app/src/composition/index.ts` to export an app-safe helper:

```ts
import { connectNativeWallet } from '../platform/nativeWallet.js';

export const walletPlatform = {
  connectNativeWallet,
};
```

Keep the existing approved composition entrypoint comment intact.

- [ ] **Step 3: Typecheck the app to validate native bridge imports**

Run:

```bash
pnpm --filter @clmm/app typecheck
```

Expected: PASS, or FAIL only if later route/store tasks are still pending.

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/platform/nativeWallet.ts apps/app/src/composition/index.ts
git commit -m "feat(app): add native wallet connect bridge"
```

### Task 6: Add Wallet Adapter Providers To App Layout

**Files:**
- Modify: `apps/app/app/_layout.tsx`

- [ ] **Step 1: Wrap the app in wallet adapter providers for web**

Update `apps/app/app/_layout.tsx` to keep the query provider and add wallet providers:

```tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { useMemo } from 'react';
import { queryClient } from '../src/composition/queryClient';

const SOLANA_RPC_ENDPOINT = 'https://api.mainnet-beta.solana.com';

export default function RootLayout() {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionProvider endpoint={SOLANA_RPC_ENDPOINT}>
        <WalletProvider wallets={wallets} autoConnect={false}>
          <Stack screenOptions={{ headerShown: false }} />
        </WalletProvider>
      </ConnectionProvider>
    </QueryClientProvider>
  );
}
```

If Expo web build requires conditional construction, keep the provider shape but guard wallet instantiation with `Platform.OS === 'web'`.

- [ ] **Step 2: Typecheck the layout change**

Run:

```bash
pnpm --filter @clmm/app typecheck
```

Expected: PASS, or only known pending failures from route wiring work.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/_layout.tsx
git commit -m "feat(app): add browser wallet providers to root layout"
```

### Task 7: Replace Positions And Wallet Routes With Real App-Shell Wiring

**Files:**
- Modify: `apps/app/app/(tabs)/positions.tsx`
- Modify: `apps/app/app/(tabs)/wallet.tsx`

- [ ] **Step 1: Replace the Positions route re-export with a real route component**

Update `apps/app/app/(tabs)/positions.tsx`:

```tsx
import { useRouter } from 'expo-router';
import { PositionsListScreen } from '@clmm/ui';
import { useStore } from 'zustand';
import { walletSessionStore } from '../../src/state/walletSessionStore.js';

export default function PositionsRoute() {
  const router = useRouter();
  const walletAddress = useStore(walletSessionStore, (state) => state.walletAddress);
  const platformCapabilities = useStore(walletSessionStore, (state) => state.platformCapabilities);

  return (
    <PositionsListScreen
      walletAddress={walletAddress}
      platformCapabilities={platformCapabilities}
      onConnectWallet={() => router.push('/connect')}
    />
  );
}
```

- [ ] **Step 2: Replace the Wallet route re-export with a real route component**

Update `apps/app/app/(tabs)/wallet.tsx`:

```tsx
import { useRouter } from 'expo-router';
import { WalletSettingsScreen } from '@clmm/ui';
import { useStore } from 'zustand';
import { walletSessionStore } from '../../src/state/walletSessionStore.js';

export default function WalletRoute() {
  const router = useRouter();
  const walletAddress = useStore(walletSessionStore, (state) => state.walletAddress);
  const connectionKind = useStore(walletSessionStore, (state) => state.connectionKind);
  const platformCapabilities = useStore(walletSessionStore, (state) => state.platformCapabilities);
  const disconnect = useStore(walletSessionStore, (state) => state.disconnect);
  const clearOutcome = useStore(walletSessionStore, (state) => state.clearOutcome);

  function handleReconnect() {
    clearOutcome();
    router.push('/connect');
  }

  function handleSwitchWallet() {
    disconnect();
    router.push('/connect');
  }

  return (
    <WalletSettingsScreen
      walletAddress={walletAddress}
      connectionKind={connectionKind}
      platformCapabilities={platformCapabilities}
      onReconnect={handleReconnect}
      onSwitchWallet={handleSwitchWallet}
      onDisconnect={disconnect}
    />
  );
}
```

- [ ] **Step 3: Typecheck the route wiring**

Run:

```bash
pnpm --filter @clmm/app typecheck
```

Expected: PASS, or only pending connect-route-related failures.

- [ ] **Step 4: Commit**

```bash
git add apps/app/app/(tabs)/positions.tsx apps/app/app/(tabs)/wallet.tsx
git commit -m "feat(app): wire positions and wallet routes to wallet session"
```

### Task 8: Implement The `/connect` Route End-To-End

**Files:**
- Modify: `apps/app/app/connect.tsx`
- Modify: `apps/app/src/composition/index.ts` (if capability helper export is needed)

- [ ] **Step 1: Replace the connect route re-export with a real route component**

Update `apps/app/app/connect.tsx`:

```tsx
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Platform } from 'react-native';
import { WalletConnectScreen } from '@clmm/ui';
import { useStore } from 'zustand';
import { platformCapabilityAdapter, walletPlatform } from '../src/composition/index.js';
import { connectBrowserWallet } from '../src/platform/browserWallet.js';
import { mapWalletErrorToOutcome } from '../src/platform/walletConnection.js';
import { walletSessionStore } from '../src/state/walletSessionStore.js';

export default function ConnectRoute() {
  const router = useRouter();
  const platformCapabilities = useStore(walletSessionStore, (state) => state.platformCapabilities);
  const connectionOutcome = useStore(walletSessionStore, (state) => state.connectionOutcome);
  const isConnecting = useStore(walletSessionStore, (state) => state.isConnecting);
  const setPlatformCapabilities = useStore(walletSessionStore, (state) => state.setPlatformCapabilities);
  const beginConnection = useStore(walletSessionStore, (state) => state.beginConnection);
  const markConnected = useStore(walletSessionStore, (state) => state.markConnected);
  const markOutcome = useStore(walletSessionStore, (state) => state.markOutcome);
  const clearOutcome = useStore(walletSessionStore, (state) => state.clearOutcome);

  useEffect(() => {
    let active = true;

    void platformCapabilityAdapter.getCapabilities().then((caps) => {
      if (active) {
        setPlatformCapabilities(caps);
      }
    }).catch((error) => {
      if (active) {
        markOutcome(mapWalletErrorToOutcome(error));
      }
    });

    return () => {
      active = false;
    };
  }, [markOutcome, setPlatformCapabilities]);

  async function handleSelectWallet(kind: 'native' | 'browser') {
    beginConnection();

    try {
      const walletAddress = kind === 'browser' || Platform.OS === 'web'
        ? await connectBrowserWallet(typeof window !== 'undefined' ? window : undefined)
        : await walletPlatform.connectNativeWallet();

      markConnected({ walletAddress, connectionKind: kind });
      router.replace('/(tabs)/positions');
    } catch (error) {
      markOutcome(mapWalletErrorToOutcome(error));
    }
  }

  return (
    <WalletConnectScreen
      platformCapabilities={platformCapabilities}
      connectionOutcome={connectionOutcome}
      isConnecting={isConnecting}
      onSelectWallet={handleSelectWallet}
      onGoBack={() => {
        clearOutcome();
        router.back();
      }}
    />
  );
}
```

- [ ] **Step 2: Export native connect helper from composition if the route uses it**

If not already done in Task 5, add:

```ts
export const walletPlatform = {
  connectNativeWallet,
};
```

- [ ] **Step 3: Run app tests and typecheck for the full route flow**

Run:

```bash
pnpm --filter @clmm/app test
pnpm --filter @clmm/app typecheck
```

Expected: PASS on app tests and typecheck.

- [ ] **Step 4: Commit**

```bash
git add apps/app/app/connect.tsx apps/app/src/composition/index.ts
git commit -m "feat(app): wire connect route to real wallet session flow"
```

### Task 9: Full Verification

**Files:**
- Verify only

- [ ] **Step 1: Run app tests**

Run:

```bash
pnpm --filter @clmm/app test
```

Expected: PASS for `walletSessionStore.test.ts`, `walletConnection.test.ts`, and `browserWallet.test.ts`.

- [ ] **Step 2: Run existing UI tests**

Run:

```bash
pnpm --dir packages/ui test
```

Expected: PASS with all existing UI tests green.

- [ ] **Step 3: Run app and workspace typecheck**

Run:

```bash
pnpm --filter @clmm/app typecheck
pnpm typecheck
```

Expected: PASS with no new type errors.

- [ ] **Step 4: Run manual web verification**

Run:

```bash
pnpm dev:web
```

Manual checklist:

- Open the Positions tab while disconnected.
- Press `Connect Wallet` and confirm navigation to `/connect`.
- Confirm `/connect` renders wallet options instead of a spinner.
- Connect with the browser wallet extension.
- Confirm automatic return to Positions.
- Confirm Positions shows connected state.
- Confirm Wallet/Settings shows connected summary.
- Confirm Disconnect clears the session and returns both screens to disconnected state.

Expected: All manual checks pass.

- [ ] **Step 5: Commit final verification notes if code changed during fixups**

If verification required no code changes, skip commit.
If verification required changes, commit them with a focused message.

## Spec Coverage Check

- Positions button routing: Task 7
- `/connect` spinner resolved by capability loading: Task 8
- Shared app-local wallet session state: Task 2
- Web wallet bridge: Task 4 + Task 6 + Task 8
- Native wallet connect path: Task 5 + Task 8
- Return to Positions after success: Task 8
- Connected state visible in Positions and Wallet/Settings: Task 7 + Task 8
- Keep UI presentational and preserve boundaries: enforced throughout file map and task structure

## Placeholder Scan

- No `TBD` / `TODO` markers in tasks
- Every task includes exact file paths
- Every code-writing step includes concrete code blocks
- Every verification step includes concrete commands

## Type Consistency Check

- Wallet connection kind stays `'native' | 'browser'` across store, routes, and UI props
- Connection outcomes use the existing `ConnectionOutcome` type from `@clmm/ui`
- Platform capabilities use `PlatformCapabilityState` from `@clmm/application/public`

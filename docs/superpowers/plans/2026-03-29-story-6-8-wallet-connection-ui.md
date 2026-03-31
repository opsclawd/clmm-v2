# Story 6.8: Wire Wallet Connection Entry, Supported Wallet States, And Resume Handoff

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a clear wallet connection flow with platform-aware wallet options, distinguished connection outcomes, connected wallet summary on settings screen, and disconnected/empty-state handling on positions screen.

**Architecture:** Pure Utils + ViewModel pattern (no React rendering in tests). All wallet connection logic lives in `WalletConnectionUtils.ts` (pure functions). ViewModels consume utils to build screen-ready data. Screen components render ViewModels. Route files in `apps/app` are thin re-exports. UI imports only from `@clmm/application/public` — never from domain or adapters.

**Tech Stack:** TypeScript strict, Vitest (node environment), React Native, `@clmm/application/public` DTOs/types, `@clmm/ui` design system (colors, typography).

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `packages/ui/src/components/WalletConnectionUtils.ts` | Pure functions: `buildWalletOptions`, `getConnectionOutcomeDisplay`, `buildConnectedWalletSummary`, `buildPlatformNotice`, `truncateAddress` |
| Create | `packages/ui/src/components/WalletConnection.test.ts` | Tests for all WalletConnectionUtils functions |
| Create | `packages/ui/src/view-models/WalletConnectionViewModel.ts` | `buildWalletConnectViewModel`, `buildWalletSettingsViewModel` |
| Create | `packages/ui/src/view-models/WalletConnectionViewModel.test.ts` | Tests for ViewModel builders |
| Create | `packages/ui/src/components/ConnectWalletEntry.tsx` | Inline component shown on Positions screen when disconnected |
| Create | `packages/ui/src/screens/WalletConnectScreen.tsx` | Full wallet selection screen with platform-aware options + connection outcomes |
| Modify | `packages/ui/src/screens/WalletSettingsScreen.tsx` | Replace stub with connected summary + reconnect/switch/disconnect actions |
| Modify | `packages/ui/src/screens/PositionsListScreen.tsx` | Add `walletAddress` + `onConnectWallet` props; handle disconnected vs connected-empty states |
| Modify | `packages/ui/src/index.ts` | Export new components, view-models, utils |
| Create | `apps/app/app/connect.tsx` | Route file for wallet connect screen (thin re-export) |

---

## Task 1: WalletConnectionUtils — Pure Functions

**Files:**
- Create: `packages/ui/src/components/WalletConnectionUtils.ts`
- Create: `packages/ui/src/components/WalletConnection.test.ts`

### Step 1.1: Write truncateAddress tests

- [ ] Create test file with `truncateAddress` tests:

```ts
// packages/ui/src/components/WalletConnection.test.ts
import { describe, it, expect } from 'vitest';
import { truncateAddress } from './WalletConnectionUtils.js';

describe('truncateAddress', () => {
  it('truncates a long Solana address to first 4 and last 4 characters', () => {
    const addr = 'DRpbCBMxVnDK7maPMoGQfFRMKVfGE5sBPr7butNRo1Fs';
    expect(truncateAddress(addr)).toBe('DRpb...o1Fs');
  });

  it('returns short addresses unchanged', () => {
    expect(truncateAddress('abcd1234')).toBe('abcd1234');
  });

  it('returns empty string for empty input', () => {
    expect(truncateAddress('')).toBe('');
  });
});
```

- [ ] Run test to verify it fails:

Run: `pnpm vitest run packages/ui/src/components/WalletConnection.test.ts`
Expected: FAIL — `truncateAddress` not found

### Step 1.2: Implement truncateAddress

- [ ] Create utils file with `truncateAddress`:

```ts
// packages/ui/src/components/WalletConnectionUtils.ts

export function truncateAddress(address: string): string {
  if (address.length <= 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}
```

- [ ] Run test to verify it passes:

Run: `pnpm vitest run packages/ui/src/components/WalletConnection.test.ts`
Expected: PASS (3 tests)

### Step 1.3: Write buildWalletOptions tests

- [ ] Add `buildWalletOptions` tests to existing test file:

```ts
// Append to packages/ui/src/components/WalletConnection.test.ts

import { buildWalletOptions } from './WalletConnectionUtils.js';
import type { PlatformCapabilities } from './DegradedCapabilityBannerUtils.js';

function makeCaps(overrides: Partial<PlatformCapabilities> = {}): PlatformCapabilities {
  return {
    nativePushAvailable: false,
    browserNotificationAvailable: false,
    nativeWalletAvailable: false,
    browserWalletAvailable: false,
    isMobileWeb: false,
    ...overrides,
  };
}

describe('buildWalletOptions', () => {
  it('returns native wallet option when nativeWalletAvailable is true', () => {
    const options = buildWalletOptions(makeCaps({ nativeWalletAvailable: true }));
    expect(options).toHaveLength(1);
    expect(options[0]!.kind).toBe('native');
    expect(options[0]!.label).toBe('Connect Mobile Wallet');
    expect(options[0]!.description).toContain('mobile wallet');
  });

  it('returns browser wallet option when browserWalletAvailable is true', () => {
    const options = buildWalletOptions(makeCaps({ browserWalletAvailable: true }));
    expect(options).toHaveLength(1);
    expect(options[0]!.kind).toBe('browser');
    expect(options[0]!.label).toBe('Connect Browser Wallet');
  });

  it('returns both options when both are available', () => {
    const options = buildWalletOptions(makeCaps({
      nativeWalletAvailable: true,
      browserWalletAvailable: true,
    }));
    expect(options).toHaveLength(2);
    expect(options.map(o => o.kind)).toEqual(['native', 'browser']);
  });

  it('returns empty array when no wallet is available', () => {
    const options = buildWalletOptions(makeCaps());
    expect(options).toHaveLength(0);
  });
});
```

- [ ] Run test to verify it fails:

Run: `pnpm vitest run packages/ui/src/components/WalletConnection.test.ts`
Expected: FAIL — `buildWalletOptions` not exported

### Step 1.4: Implement buildWalletOptions

- [ ] Add to `WalletConnectionUtils.ts`:

```ts
// Append to packages/ui/src/components/WalletConnectionUtils.ts

import type { PlatformCapabilities } from './DegradedCapabilityBannerUtils.js';

export type WalletOptionKind = 'native' | 'browser';

export type WalletOption = {
  kind: WalletOptionKind;
  label: string;
  description: string;
};

export function buildWalletOptions(caps: PlatformCapabilities): WalletOption[] {
  const options: WalletOption[] = [];

  if (caps.nativeWalletAvailable) {
    options.push({
      kind: 'native',
      label: 'Connect Mobile Wallet',
      description: 'Sign transactions with your mobile wallet app.',
    });
  }

  if (caps.browserWalletAvailable) {
    options.push({
      kind: 'browser',
      label: 'Connect Browser Wallet',
      description: 'Sign transactions with your browser wallet extension. You can review positions and execute exits from desktop.',
    });
  }

  return options;
}
```

- [ ] Run test to verify it passes:

Run: `pnpm vitest run packages/ui/src/components/WalletConnection.test.ts`
Expected: PASS (7 tests)

### Step 1.5: Write getConnectionOutcomeDisplay tests

- [ ] Add `getConnectionOutcomeDisplay` tests to existing test file:

```ts
// Append to packages/ui/src/components/WalletConnection.test.ts

import { getConnectionOutcomeDisplay } from './WalletConnectionUtils.js';

describe('getConnectionOutcomeDisplay', () => {
  it('maps connected outcome to success display', () => {
    const display = getConnectionOutcomeDisplay({ kind: 'connected' });
    expect(display.title).toBe('Wallet Connected');
    expect(display.severity).toBe('success');
  });

  it('maps failed outcome to error display', () => {
    const display = getConnectionOutcomeDisplay({ kind: 'failed', reason: 'timeout' });
    expect(display.title).toBe('Connection Failed');
    expect(display.severity).toBe('error');
    expect(display.detail).toContain('timeout');
  });

  it('maps cancelled outcome to info display', () => {
    const display = getConnectionOutcomeDisplay({ kind: 'cancelled' });
    expect(display.title).toBe('Connection Cancelled');
    expect(display.severity).toBe('info');
  });

  it('maps interrupted outcome to warning display', () => {
    const display = getConnectionOutcomeDisplay({ kind: 'interrupted' });
    expect(display.title).toBe('Connection Interrupted');
    expect(display.severity).toBe('warning');
    expect(display.detail).toContain('returned');
  });
});
```

- [ ] Run test to verify it fails:

Run: `pnpm vitest run packages/ui/src/components/WalletConnection.test.ts`
Expected: FAIL — `getConnectionOutcomeDisplay` not exported

### Step 1.6: Implement getConnectionOutcomeDisplay

- [ ] Add to `WalletConnectionUtils.ts`:

```ts
// Append to packages/ui/src/components/WalletConnectionUtils.ts

export type ConnectionOutcome =
  | { kind: 'connected' }
  | { kind: 'failed'; reason: string }
  | { kind: 'cancelled' }
  | { kind: 'interrupted' };

export type ConnectionOutcomeDisplay = {
  title: string;
  detail: string;
  severity: 'success' | 'error' | 'info' | 'warning';
};

export function getConnectionOutcomeDisplay(outcome: ConnectionOutcome): ConnectionOutcomeDisplay {
  switch (outcome.kind) {
    case 'connected':
      return {
        title: 'Wallet Connected',
        detail: 'Your wallet is connected. Viewing supported positions.',
        severity: 'success',
      };
    case 'failed':
      return {
        title: 'Connection Failed',
        detail: `Could not connect to wallet: ${outcome.reason}. Please try again.`,
        severity: 'error',
      };
    case 'cancelled':
      return {
        title: 'Connection Cancelled',
        detail: 'You cancelled the wallet connection. Connect when you are ready.',
        severity: 'info',
      };
    case 'interrupted':
      return {
        title: 'Connection Interrupted',
        detail: 'The connection was interrupted before completing. You have returned to the app — please try connecting again.',
        severity: 'warning',
      };
    default: {
      const _exhaustive: never = outcome;
      return _exhaustive;
    }
  }
}
```

- [ ] Run test to verify it passes:

Run: `pnpm vitest run packages/ui/src/components/WalletConnection.test.ts`
Expected: PASS (11 tests)

### Step 1.7: Write buildConnectedWalletSummary tests

- [ ] Add `buildConnectedWalletSummary` tests to existing test file:

```ts
// Append to packages/ui/src/components/WalletConnection.test.ts

import { buildConnectedWalletSummary } from './WalletConnectionUtils.js';

describe('buildConnectedWalletSummary', () => {
  it('builds summary with truncated address and connection kind label', () => {
    const summary = buildConnectedWalletSummary({
      walletAddress: 'DRpbCBMxVnDK7maPMoGQfFRMKVfGE5sBPr7butNRo1Fs',
      connectionKind: 'native',
    });
    expect(summary.displayAddress).toBe('DRpb...o1Fs');
    expect(summary.connectionLabel).toBe('Mobile Wallet');
  });

  it('uses browser label for browser connection', () => {
    const summary = buildConnectedWalletSummary({
      walletAddress: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop',
      connectionKind: 'browser',
    });
    expect(summary.connectionLabel).toBe('Browser Wallet');
  });
});
```

- [ ] Run test to verify it fails:

Run: `pnpm vitest run packages/ui/src/components/WalletConnection.test.ts`
Expected: FAIL — `buildConnectedWalletSummary` not exported

### Step 1.8: Implement buildConnectedWalletSummary

- [ ] Add to `WalletConnectionUtils.ts`:

```ts
// Append to packages/ui/src/components/WalletConnectionUtils.ts

export type ConnectedWalletSummary = {
  displayAddress: string;
  connectionLabel: string;
};

export function buildConnectedWalletSummary(params: {
  walletAddress: string;
  connectionKind: WalletOptionKind;
}): ConnectedWalletSummary {
  return {
    displayAddress: truncateAddress(params.walletAddress),
    connectionLabel: params.connectionKind === 'native'
      ? 'Mobile Wallet'
      : 'Browser Wallet',
  };
}
```

- [ ] Run test to verify it passes:

Run: `pnpm vitest run packages/ui/src/components/WalletConnection.test.ts`
Expected: PASS (13 tests)

### Step 1.9: Write buildPlatformNotice tests

- [ ] Add `buildPlatformNotice` tests to existing test file:

```ts
// Append to packages/ui/src/components/WalletConnection.test.ts

import { buildPlatformNotice } from './WalletConnectionUtils.js';

describe('buildPlatformNotice', () => {
  it('returns degraded notice for mobile web with no wallet support', () => {
    const notice = buildPlatformNotice(makeCaps({ isMobileWeb: true }));
    expect(notice).not.toBeNull();
    expect(notice!.message).toContain('mobile web');
    expect(notice!.severity).toBe('warning');
  });

  it('returns degraded notice when no wallet is available on any platform', () => {
    const notice = buildPlatformNotice(makeCaps());
    expect(notice).not.toBeNull();
    expect(notice!.message).toContain('No supported wallet');
  });

  it('returns null when at least one wallet option is available', () => {
    const notice = buildPlatformNotice(makeCaps({ nativeWalletAvailable: true }));
    expect(notice).toBeNull();
  });

  it('returns null when browser wallet is available', () => {
    const notice = buildPlatformNotice(makeCaps({ browserWalletAvailable: true }));
    expect(notice).toBeNull();
  });
});
```

- [ ] Run test to verify it fails:

Run: `pnpm vitest run packages/ui/src/components/WalletConnection.test.ts`
Expected: FAIL — `buildPlatformNotice` not exported

### Step 1.10: Implement buildPlatformNotice

- [ ] Add to `WalletConnectionUtils.ts`:

```ts
// Append to packages/ui/src/components/WalletConnectionUtils.ts

export type PlatformNotice = {
  message: string;
  severity: 'warning' | 'error';
};

export function buildPlatformNotice(caps: PlatformCapabilities): PlatformNotice | null {
  const hasAnyWallet = caps.nativeWalletAvailable || caps.browserWalletAvailable;

  if (hasAnyWallet) return null;

  if (caps.isMobileWeb) {
    return {
      message: 'You are on mobile web. Wallet signing is not available in this browser. You can view positions and alerts, but cannot execute exits. Use the native app or a desktop browser with a wallet extension for full functionality.',
      severity: 'warning',
    };
  }

  return {
    message: 'No supported wallet detected on this device. Install a compatible Solana wallet to connect.',
    severity: 'error',
  };
}
```

- [ ] Run test to verify it passes:

Run: `pnpm vitest run packages/ui/src/components/WalletConnection.test.ts`
Expected: PASS (17 tests)

### Step 1.11: Commit

- [ ] Commit:

```bash
git add packages/ui/src/components/WalletConnectionUtils.ts packages/ui/src/components/WalletConnection.test.ts
git commit -m "feat(ui): add WalletConnectionUtils pure functions with tests

Implements truncateAddress, buildWalletOptions, getConnectionOutcomeDisplay,
buildConnectedWalletSummary, and buildPlatformNotice for Story 6.8."
```

---

## Task 2: WalletConnectionViewModel — Screen-Ready Builders

**Files:**
- Create: `packages/ui/src/view-models/WalletConnectionViewModel.ts`
- Create: `packages/ui/src/view-models/WalletConnectionViewModel.test.ts`

### Step 2.1: Write buildWalletConnectViewModel tests

- [ ] Create test file:

```ts
// packages/ui/src/view-models/WalletConnectionViewModel.test.ts
import { describe, it, expect } from 'vitest';
import { buildWalletConnectViewModel } from './WalletConnectionViewModel.js';
import type { PlatformCapabilities } from '../components/DegradedCapabilityBannerUtils.js';
import type { ConnectionOutcome } from '../components/WalletConnectionUtils.js';

function makeCaps(overrides: Partial<PlatformCapabilities> = {}): PlatformCapabilities {
  return {
    nativePushAvailable: false,
    browserNotificationAvailable: false,
    nativeWalletAvailable: false,
    browserWalletAvailable: false,
    isMobileWeb: false,
    ...overrides,
  };
}

describe('buildWalletConnectViewModel', () => {
  it('shows native wallet option on React Native mobile', () => {
    const vm = buildWalletConnectViewModel({
      capabilities: makeCaps({ nativeWalletAvailable: true, nativePushAvailable: true }),
      connectionOutcome: null,
      isConnecting: false,
    });
    expect(vm.walletOptions).toHaveLength(1);
    expect(vm.walletOptions[0]!.kind).toBe('native');
    expect(vm.platformNotice).toBeNull();
    expect(vm.outcomeDisplay).toBeNull();
    expect(vm.isConnecting).toBe(false);
  });

  it('shows browser wallet option on desktop PWA', () => {
    const vm = buildWalletConnectViewModel({
      capabilities: makeCaps({ browserWalletAvailable: true, browserNotificationAvailable: true }),
      connectionOutcome: null,
      isConnecting: false,
    });
    expect(vm.walletOptions).toHaveLength(1);
    expect(vm.walletOptions[0]!.kind).toBe('browser');
  });

  it('shows degraded notice for mobile web', () => {
    const vm = buildWalletConnectViewModel({
      capabilities: makeCaps({ isMobileWeb: true }),
      connectionOutcome: null,
      isConnecting: false,
    });
    expect(vm.walletOptions).toHaveLength(0);
    expect(vm.platformNotice).not.toBeNull();
    expect(vm.platformNotice!.message).toContain('mobile web');
  });

  it('includes connection outcome display when outcome provided', () => {
    const outcome: ConnectionOutcome = { kind: 'failed', reason: 'timeout' };
    const vm = buildWalletConnectViewModel({
      capabilities: makeCaps({ nativeWalletAvailable: true }),
      connectionOutcome: outcome,
      isConnecting: false,
    });
    expect(vm.outcomeDisplay).not.toBeNull();
    expect(vm.outcomeDisplay!.severity).toBe('error');
    expect(vm.outcomeDisplay!.title).toBe('Connection Failed');
  });

  it('passes through isConnecting state', () => {
    const vm = buildWalletConnectViewModel({
      capabilities: makeCaps({ nativeWalletAvailable: true }),
      connectionOutcome: null,
      isConnecting: true,
    });
    expect(vm.isConnecting).toBe(true);
  });
});
```

- [ ] Run test to verify it fails:

Run: `pnpm vitest run packages/ui/src/view-models/WalletConnectionViewModel.test.ts`
Expected: FAIL — module not found

### Step 2.2: Implement buildWalletConnectViewModel

- [ ] Create view-model file:

```ts
// packages/ui/src/view-models/WalletConnectionViewModel.ts
import type { PlatformCapabilities } from '../components/DegradedCapabilityBannerUtils.js';
import {
  buildWalletOptions,
  getConnectionOutcomeDisplay,
  buildConnectedWalletSummary,
  buildPlatformNotice,
} from '../components/WalletConnectionUtils.js';
import type {
  WalletOption,
  ConnectionOutcome,
  ConnectionOutcomeDisplay,
  PlatformNotice,
  ConnectedWalletSummary,
  WalletOptionKind,
} from '../components/WalletConnectionUtils.js';

// --- Wallet Connect Screen ViewModel ---

export type WalletConnectViewModel = {
  walletOptions: WalletOption[];
  platformNotice: PlatformNotice | null;
  outcomeDisplay: ConnectionOutcomeDisplay | null;
  isConnecting: boolean;
};

export function buildWalletConnectViewModel(params: {
  capabilities: PlatformCapabilities;
  connectionOutcome: ConnectionOutcome | null;
  isConnecting: boolean;
}): WalletConnectViewModel {
  return {
    walletOptions: buildWalletOptions(params.capabilities),
    platformNotice: buildPlatformNotice(params.capabilities),
    outcomeDisplay: params.connectionOutcome
      ? getConnectionOutcomeDisplay(params.connectionOutcome)
      : null,
    isConnecting: params.isConnecting,
  };
}

// --- Wallet Settings Screen ViewModel ---

export type WalletSettingsViewModel = {
  connected: boolean;
  walletSummary: ConnectedWalletSummary | null;
  platformNotice: PlatformNotice | null;
};

export function buildWalletSettingsViewModel(params: {
  walletAddress: string | null;
  connectionKind: WalletOptionKind | null;
  capabilities: PlatformCapabilities;
}): WalletSettingsViewModel {
  const connected = params.walletAddress !== null && params.connectionKind !== null;

  return {
    connected,
    walletSummary: connected
      ? buildConnectedWalletSummary({
          walletAddress: params.walletAddress!,
          connectionKind: params.connectionKind!,
        })
      : null,
    platformNotice: buildPlatformNotice(params.capabilities),
  };
}
```

- [ ] Run test to verify it passes:

Run: `pnpm vitest run packages/ui/src/view-models/WalletConnectionViewModel.test.ts`
Expected: PASS (5 tests)

### Step 2.3: Write buildWalletSettingsViewModel tests

- [ ] Add to existing test file:

```ts
// Append to packages/ui/src/view-models/WalletConnectionViewModel.test.ts

import { buildWalletSettingsViewModel } from './WalletConnectionViewModel.js';

describe('buildWalletSettingsViewModel', () => {
  it('returns connected summary when wallet address and kind are provided', () => {
    const vm = buildWalletSettingsViewModel({
      walletAddress: 'DRpbCBMxVnDK7maPMoGQfFRMKVfGE5sBPr7butNRo1Fs',
      connectionKind: 'native',
      capabilities: makeCaps({ nativeWalletAvailable: true }),
    });
    expect(vm.connected).toBe(true);
    expect(vm.walletSummary).not.toBeNull();
    expect(vm.walletSummary!.displayAddress).toBe('DRpb...o1Fs');
    expect(vm.walletSummary!.connectionLabel).toBe('Mobile Wallet');
    expect(vm.platformNotice).toBeNull();
  });

  it('returns disconnected state when walletAddress is null', () => {
    const vm = buildWalletSettingsViewModel({
      walletAddress: null,
      connectionKind: null,
      capabilities: makeCaps({ nativeWalletAvailable: true }),
    });
    expect(vm.connected).toBe(false);
    expect(vm.walletSummary).toBeNull();
  });

  it('includes platform notice for degraded platforms', () => {
    const vm = buildWalletSettingsViewModel({
      walletAddress: 'DRpbCBMxVnDK7maPMoGQfFRMKVfGE5sBPr7butNRo1Fs',
      connectionKind: 'native',
      capabilities: makeCaps({ isMobileWeb: true }),
    });
    expect(vm.connected).toBe(true);
    expect(vm.platformNotice).not.toBeNull();
  });
});
```

- [ ] Run test to verify it passes:

Run: `pnpm vitest run packages/ui/src/view-models/WalletConnectionViewModel.test.ts`
Expected: PASS (8 tests)

### Step 2.4: Commit

- [ ] Commit:

```bash
git add packages/ui/src/view-models/WalletConnectionViewModel.ts packages/ui/src/view-models/WalletConnectionViewModel.test.ts
git commit -m "feat(ui): add WalletConnectionViewModel builders with tests

buildWalletConnectViewModel for wallet selection screen,
buildWalletSettingsViewModel for settings screen. Story 6.8."
```

---

## Task 3: ConnectWalletEntry Component

**Files:**
- Create: `packages/ui/src/components/ConnectWalletEntry.tsx`

This is a small presentational component shown on the Positions screen when the user is not connected. No tests needed (no pure logic — it is a render-only component following the codebase convention of testing Utils, not React renders).

### Step 3.1: Create ConnectWalletEntry component

- [ ] Create the component:

```tsx
// packages/ui/src/components/ConnectWalletEntry.tsx
import { View, Text, TouchableOpacity } from 'react-native';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';

type Props = {
  onConnectWallet?: () => void;
};

export function ConnectWalletEntry({ onConnectWallet }: Props) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
      <Text style={{
        color: colors.text,
        fontSize: typography.fontSize.lg,
        fontWeight: typography.fontWeight.semibold,
        textAlign: 'center',
      }}>
        Connect your wallet to get started
      </Text>
      <Text style={{
        color: colors.textSecondary,
        fontSize: typography.fontSize.base,
        textAlign: 'center',
        marginTop: 8,
        lineHeight: typography.fontSize.base * typography.lineHeight.normal,
      }}>
        CLMM monitors your Orca concentrated liquidity positions and helps you exit when they go out of range.
      </Text>
      <TouchableOpacity
        onPress={onConnectWallet}
        style={{
          marginTop: 24,
          paddingVertical: 14,
          paddingHorizontal: 32,
          backgroundColor: colors.primary,
          borderRadius: 8,
        }}
      >
        <Text style={{
          color: colors.background,
          fontSize: typography.fontSize.base,
          fontWeight: typography.fontWeight.bold,
          textAlign: 'center',
        }}>
          Connect Wallet
        </Text>
      </TouchableOpacity>
    </View>
  );
}
```

### Step 3.2: Commit

- [ ] Commit:

```bash
git add packages/ui/src/components/ConnectWalletEntry.tsx
git commit -m "feat(ui): add ConnectWalletEntry component

Disconnected-state entry point with connect button and product explanation.
Story 6.8."
```

---

## Task 4: WalletConnectScreen — Full Wallet Selection Screen

**Files:**
- Create: `packages/ui/src/screens/WalletConnectScreen.tsx`

This screen shows platform-aware wallet options, connection outcome feedback, connecting spinner state, and platform degradation notices. All logic is in the ViewModel — the screen only renders.

### Step 4.1: Create WalletConnectScreen

- [ ] Create the screen:

```tsx
// packages/ui/src/screens/WalletConnectScreen.tsx
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import { buildWalletConnectViewModel } from '../view-models/WalletConnectionViewModel.js';
import type { PlatformCapabilities } from '../components/DegradedCapabilityBannerUtils.js';
import type { ConnectionOutcome, WalletOptionKind } from '../components/WalletConnectionUtils.js';

type Props = {
  platformCapabilities?: PlatformCapabilities | null;
  connectionOutcome?: ConnectionOutcome | null;
  isConnecting?: boolean;
  onSelectWallet?: (kind: WalletOptionKind) => void;
  onGoBack?: () => void;
};

const severityColors: Record<string, string> = {
  success: colors.primary,
  error: colors.danger,
  warning: colors.warning,
  info: colors.textSecondary,
};

export function WalletConnectScreen({
  platformCapabilities,
  connectionOutcome,
  isConnecting,
  onSelectWallet,
  onGoBack,
}: Props) {
  if (!platformCapabilities) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const vm = buildWalletConnectViewModel({
    capabilities: platformCapabilities,
    connectionOutcome: connectionOutcome ?? null,
    isConnecting: isConnecting ?? false,
  });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{
        color: colors.text,
        fontSize: typography.fontSize.xl,
        fontWeight: typography.fontWeight.bold,
      }}>
        Connect Wallet
      </Text>
      <Text style={{
        color: colors.textSecondary,
        fontSize: typography.fontSize.base,
        marginTop: 8,
      }}>
        Choose a wallet to connect. Only supported wallet options for this device are shown.
      </Text>

      {vm.platformNotice ? (
        <View style={{
          marginTop: 16,
          padding: 12,
          backgroundColor: vm.platformNotice.severity === 'warning' ? '#422006' : '#450a0a',
          borderRadius: 8,
          borderWidth: 1,
          borderColor: vm.platformNotice.severity === 'warning' ? colors.warning : colors.danger,
        }}>
          <Text style={{
            color: vm.platformNotice.severity === 'warning' ? colors.warning : colors.danger,
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.medium,
          }}>
            {vm.platformNotice.message}
          </Text>
        </View>
      ) : null}

      {vm.outcomeDisplay ? (
        <View style={{
          marginTop: 16,
          padding: 12,
          backgroundColor: colors.surface,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: severityColors[vm.outcomeDisplay.severity] ?? colors.border,
        }}>
          <Text style={{
            color: severityColors[vm.outcomeDisplay.severity] ?? colors.text,
            fontSize: typography.fontSize.base,
            fontWeight: typography.fontWeight.semibold,
          }}>
            {vm.outcomeDisplay.title}
          </Text>
          <Text style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.sm,
            marginTop: 4,
          }}>
            {vm.outcomeDisplay.detail}
          </Text>
        </View>
      ) : null}

      {vm.isConnecting ? (
        <View style={{ marginTop: 32, alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textSecondary, marginTop: 12, fontSize: typography.fontSize.base }}>
            Connecting...
          </Text>
        </View>
      ) : (
        <View style={{ marginTop: 24 }}>
          {vm.walletOptions.map((option) => (
            <TouchableOpacity
              key={option.kind}
              onPress={() => onSelectWallet?.(option.kind)}
              style={{
                padding: 16,
                backgroundColor: colors.surface,
                borderRadius: 8,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{
                color: colors.text,
                fontSize: typography.fontSize.base,
                fontWeight: typography.fontWeight.semibold,
              }}>
                {option.label}
              </Text>
              <Text style={{
                color: colors.textSecondary,
                fontSize: typography.fontSize.sm,
                marginTop: 4,
              }}>
                {option.description}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {onGoBack ? (
        <TouchableOpacity
          onPress={onGoBack}
          style={{ marginTop: 16, alignSelf: 'center', padding: 8 }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
            Go Back
          </Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}
```

### Step 4.2: Commit

- [ ] Commit:

```bash
git add packages/ui/src/screens/WalletConnectScreen.tsx
git commit -m "feat(ui): add WalletConnectScreen with platform-aware options

Shows supported wallet options, platform degradation notices,
connection outcomes, and connecting state. Story 6.8."
```

---

## Task 5: Update WalletSettingsScreen — Replace Stub

**Files:**
- Modify: `packages/ui/src/screens/WalletSettingsScreen.tsx` (replace entire file)

### Step 5.1: Replace WalletSettingsScreen stub

- [ ] Replace the entire file:

```tsx
// packages/ui/src/screens/WalletSettingsScreen.tsx
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import { buildWalletSettingsViewModel } from '../view-models/WalletConnectionViewModel.js';
import { DegradedCapabilityBanner } from '../components/DegradedCapabilityBanner.js';
import type { PlatformCapabilities } from '../components/DegradedCapabilityBannerUtils.js';
import type { WalletOptionKind } from '../components/WalletConnectionUtils.js';

type Props = {
  walletAddress?: string | null;
  connectionKind?: WalletOptionKind | null;
  platformCapabilities?: PlatformCapabilities | null;
  onReconnect?: () => void;
  onSwitchWallet?: () => void;
  onDisconnect?: () => void;
};

export function WalletSettingsScreen({
  walletAddress,
  connectionKind,
  platformCapabilities,
  onReconnect,
  onSwitchWallet,
  onDisconnect,
}: Props) {
  const caps = platformCapabilities ?? {
    nativePushAvailable: false,
    browserNotificationAvailable: false,
    nativeWalletAvailable: false,
    browserWalletAvailable: false,
    isMobileWeb: false,
  };

  const vm = buildWalletSettingsViewModel({
    walletAddress: walletAddress ?? null,
    connectionKind: connectionKind ?? null,
    capabilities: caps,
  });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{
        color: colors.text,
        fontSize: typography.fontSize.xl,
        fontWeight: typography.fontWeight.bold,
      }}>
        Wallet / Settings
      </Text>

      <DegradedCapabilityBanner capabilities={platformCapabilities} />

      {vm.connected && vm.walletSummary ? (
        <View style={{ marginTop: 16 }}>
          <View style={{
            padding: 16,
            backgroundColor: colors.surface,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
          }}>
            <Text style={{
              color: colors.textSecondary,
              fontSize: typography.fontSize.sm,
            }}>
              Connected via {vm.walletSummary.connectionLabel}
            </Text>
            <Text style={{
              color: colors.text,
              fontSize: typography.fontSize.lg,
              fontWeight: typography.fontWeight.semibold,
              marginTop: 4,
            }}>
              {vm.walletSummary.displayAddress}
            </Text>
          </View>

          <View style={{ marginTop: 16, gap: 8 }}>
            <TouchableOpacity
              onPress={onReconnect}
              style={{
                padding: 14,
                backgroundColor: colors.surface,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{
                color: colors.text,
                fontSize: typography.fontSize.base,
                fontWeight: typography.fontWeight.medium,
                textAlign: 'center',
              }}>
                Reconnect
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onSwitchWallet}
              style={{
                padding: 14,
                backgroundColor: colors.surface,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{
                color: colors.text,
                fontSize: typography.fontSize.base,
                fontWeight: typography.fontWeight.medium,
                textAlign: 'center',
              }}>
                Switch Wallet
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onDisconnect}
              style={{
                padding: 14,
                backgroundColor: 'transparent',
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.danger,
              }}
            >
              <Text style={{
                color: colors.danger,
                fontSize: typography.fontSize.base,
                fontWeight: typography.fontWeight.medium,
                textAlign: 'center',
              }}>
                Disconnect
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={{ marginTop: 16 }}>
          <Text style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.base,
          }}>
            No wallet connected.
          </Text>
          {vm.platformNotice ? (
            <View style={{
              marginTop: 12,
              padding: 12,
              backgroundColor: vm.platformNotice.severity === 'warning' ? '#422006' : '#450a0a',
              borderRadius: 8,
              borderWidth: 1,
              borderColor: vm.platformNotice.severity === 'warning' ? colors.warning : colors.danger,
            }}>
              <Text style={{
                color: vm.platformNotice.severity === 'warning' ? colors.warning : colors.danger,
                fontSize: typography.fontSize.sm,
                fontWeight: typography.fontWeight.medium,
              }}>
                {vm.platformNotice.message}
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}
```

### Step 5.2: Run existing tests to verify nothing broke

- [ ] Run all UI tests:

Run: `pnpm vitest run --project ui` or `pnpm vitest run` from `packages/ui`
Expected: All existing tests PASS

### Step 5.3: Commit

- [ ] Commit:

```bash
git add packages/ui/src/screens/WalletSettingsScreen.tsx
git commit -m "feat(ui): replace WalletSettingsScreen stub with full implementation

Shows connected wallet summary with truncated address, connection type,
and reconnect/switch/disconnect actions. Shows degraded capability
notices for unsupported platforms. Story 6.8."
```

---

## Task 6: Update PositionsListScreen — Disconnected & Empty States

**Files:**
- Modify: `packages/ui/src/screens/PositionsListScreen.tsx`

The existing screen shows a generic "Connect wallet" message when positions are empty. We need to distinguish three states:
1. **Disconnected** — no `walletAddress` → show `ConnectWalletEntry`
2. **Connected, no positions** — `walletAddress` present but positions array empty → dedicated empty state
3. **Connected, has positions** — existing FlatList behavior (unchanged)

### Step 6.1: Update PositionsListScreen with wallet-awareness

- [ ] Replace the entire file:

```tsx
// packages/ui/src/screens/PositionsListScreen.tsx
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import type { PositionSummaryDto } from '@clmm/application/public';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import { buildPositionListViewModel } from '../view-models/PositionListViewModel.js';
import { RangeStatusBadge } from '../components/RangeStatusBadge.js';
import { DegradedCapabilityBanner } from '../components/DegradedCapabilityBanner.js';
import { ConnectWalletEntry } from '../components/ConnectWalletEntry.js';
import type { PlatformCapabilities } from '../components/DegradedCapabilityBannerUtils.js';

type Props = {
  walletAddress?: string | null;
  positions?: PositionSummaryDto[];
  onSelectPosition?: (positionId: string) => void;
  onConnectWallet?: () => void;
  platformCapabilities?: PlatformCapabilities | null;
};

export function PositionsListScreen({
  walletAddress,
  positions,
  onSelectPosition,
  onConnectWallet,
  platformCapabilities,
}: Props) {
  const isConnected = walletAddress != null && walletAddress.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
      <Text style={{
        color: colors.text,
        fontSize: typography.fontSize.xl,
        fontWeight: typography.fontWeight.bold,
      }}>
        Positions
      </Text>

      <DegradedCapabilityBanner capabilities={platformCapabilities} />

      {!isConnected ? (
        <ConnectWalletEntry onConnectWallet={onConnectWallet} />
      ) : (
        <ConnectedPositionsList
          positions={positions ?? []}
          onSelectPosition={onSelectPosition}
        />
      )}
    </View>
  );
}

function ConnectedPositionsList({
  positions,
  onSelectPosition,
}: {
  positions: PositionSummaryDto[];
  onSelectPosition?: (positionId: string) => void;
}) {
  const viewModel = buildPositionListViewModel(positions);

  if (viewModel.isEmpty) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
        <Text style={{
          color: colors.text,
          fontSize: typography.fontSize.lg,
          fontWeight: typography.fontWeight.semibold,
          textAlign: 'center',
        }}>
          Wallet Connected
        </Text>
        <Text style={{
          color: colors.textSecondary,
          fontSize: typography.fontSize.base,
          textAlign: 'center',
          marginTop: 8,
          lineHeight: typography.fontSize.base * typography.lineHeight.normal,
        }}>
          No supported Orca CLMM positions found for this wallet. Positions will appear here when you have active concentrated liquidity positions on Orca.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={viewModel.items}
      keyExtractor={(item) => item.positionId}
      style={{ marginTop: 12 }}
      renderItem={({ item }) => (
        <TouchableOpacity
          onPress={() => onSelectPosition?.(item.positionId)}
          style={{
            padding: 16,
            backgroundColor: colors.surface,
            borderRadius: 8,
            marginBottom: 8,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{
                  color: colors.text,
                  fontSize: typography.fontSize.base,
                  fontWeight: typography.fontWeight.semibold,
                }}>
                  {item.poolLabel}
                </Text>
                {item.hasAlert ? (
                  <View style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: colors.danger,
                    marginLeft: 8,
                  }} />
                ) : null}
              </View>
              <Text style={{
                color: colors.textSecondary,
                fontSize: typography.fontSize.sm,
                marginTop: 4,
              }}>
                {item.monitoringLabel}
              </Text>
            </View>
            <RangeStatusBadge rangeStateKind={item.rangeStatusKind} />
          </View>
        </TouchableOpacity>
      )}
    />
  );
}
```

### Step 6.2: Run all UI tests to verify nothing broke

- [ ] Run tests:

Run: `pnpm vitest run` from `packages/ui`
Expected: All existing tests PASS

### Step 6.3: Commit

- [ ] Commit:

```bash
git add packages/ui/src/screens/PositionsListScreen.tsx
git commit -m "feat(ui): add disconnected and connected-empty states to PositionsListScreen

Disconnected shows ConnectWalletEntry with connect button.
Connected with no positions shows dedicated empty state.
Connected with positions shows existing FlatList. Story 6.8."
```

---

## Task 7: Barrel Exports & Route Wiring

**Files:**
- Modify: `packages/ui/src/index.ts`
- Create: `apps/app/app/connect.tsx`

### Step 7.1: Update packages/ui/src/index.ts barrel exports

- [ ] Add new exports to the barrel. The file should become:

```ts
// packages/ui/src/index.ts

// Screens — imported by apps/app route files ONLY
export { PositionsListScreen } from './screens/PositionsListScreen.js';
export { AlertsListScreen } from './screens/AlertsListScreen.js';
export { PositionDetailScreen } from './screens/PositionDetailScreen.js';
export { ExecutionPreviewScreen } from './screens/ExecutionPreviewScreen.js';
export { SigningStatusScreen } from './screens/SigningStatusScreen.js';
export { ExecutionResultScreen } from './screens/ExecutionResultScreen.js';
export { HistoryListScreen } from './screens/HistoryListScreen.js';
export { HistoryDetailScreen } from './screens/HistoryDetailScreen.js';
export { WalletSettingsScreen } from './screens/WalletSettingsScreen.js';
export { WalletConnectScreen } from './screens/WalletConnectScreen.js';

// Components — reusable
export { DesktopShell } from './components/DesktopShell.js';
export { DirectionalPolicyCard } from './components/DirectionalPolicyCard.js';
export { PreviewStepSequence } from './components/PreviewStepSequence.js';
export { RangeStatusBadge, getRangeStatusBadgeProps } from './components/RangeStatusBadge.js';
export { ExecutionStateCard } from './components/ExecutionStateCard.js';
export { HistoryEventRow } from './components/HistoryEventRow.js';
export { OffChainHistoryLabel } from './components/OffChainHistoryLabel.js';
export { DegradedCapabilityBanner, buildDegradedBannerMessage } from './components/DegradedCapabilityBanner.js';
export { ConnectWalletEntry } from './components/ConnectWalletEntry.js';

// Wallet connection utils
export {
  truncateAddress,
  buildWalletOptions,
  getConnectionOutcomeDisplay,
  buildConnectedWalletSummary,
  buildPlatformNotice,
} from './components/WalletConnectionUtils.js';
export type {
  WalletOption,
  WalletOptionKind,
  ConnectionOutcome,
  ConnectionOutcomeDisplay,
  PlatformNotice,
  ConnectedWalletSummary,
} from './components/WalletConnectionUtils.js';

// View models — for testing and screen composition
export { buildPreviewViewModel } from './view-models/PreviewViewModel.js';
export { buildExecutionStateViewModel } from './view-models/ExecutionStateViewModel.js';
export { buildPositionListViewModel } from './view-models/PositionListViewModel.js';
export { buildPositionDetailViewModel } from './view-models/PositionDetailViewModel.js';
export { buildHistoryViewModel } from './view-models/HistoryViewModel.js';
export { buildWalletConnectViewModel } from './view-models/WalletConnectionViewModel.js';
export { buildWalletSettingsViewModel } from './view-models/WalletConnectionViewModel.js';
export type { WalletConnectViewModel, WalletSettingsViewModel } from './view-models/WalletConnectionViewModel.js';

// Presenters
export { presentPositionDetail } from './presenters/PositionDetailPresenter.js';
export { presentPreview } from './presenters/PreviewPresenter.js';

// Design system
export { colors } from './design-system/colors.js';
export { typography } from './design-system/typography.js';
```

### Step 7.2: Create connect route

- [ ] Create the route file:

```tsx
// apps/app/app/connect.tsx
import { WalletConnectScreen } from '@clmm/ui';

export default WalletConnectScreen;
```

### Step 7.3: Run all UI tests

- [ ] Run tests:

Run: `pnpm vitest run` from `packages/ui`
Expected: All tests PASS

### Step 7.4: Run typecheck

- [ ] Run:

Run: `pnpm typecheck` from repo root (or `pnpm tsc --noEmit` from `packages/ui`)
Expected: No type errors

### Step 7.5: Commit

- [ ] Commit:

```bash
git add packages/ui/src/index.ts apps/app/app/connect.tsx
git commit -m "feat(ui): export wallet connection components and add connect route

Adds WalletConnectScreen, ConnectWalletEntry, wallet utils, and
wallet view-models to barrel. Adds /connect route. Story 6.8."
```

---

## Spec Coverage Matrix

| Acceptance Criteria | Task |
|---|---|
| Disconnected user sees connect-wallet entry point (not empty surface) | Task 6 (PositionsListScreen disconnected state → ConnectWalletEntry) |
| Only supported wallet options shown per platform | Task 1 (buildWalletOptions), Task 2 (buildWalletConnectViewModel), Task 4 (WalletConnectScreen) |
| Native mobile: plain language wallet options | Task 1 (WalletOption labels), Task 4 (WalletConnectScreen) |
| Desktop PWA: browser wallet + honest capability representation | Task 1 (buildWalletOptions browser option description), Task 4 |
| Mobile web / degraded PWA: explicit degraded capability notice | Task 1 (buildPlatformNotice), Task 4 (WalletConnectScreen platformNotice) |
| Success → positions for that wallet (not generic dashboard) | Task 4 (connectionOutcome success), Task 6 (PositionsListScreen connected state) |
| Connected but no positions → dedicated empty state | Task 6 (ConnectedPositionsList empty state) |
| Failure/cancellation/interruption distinguished | Task 1 (getConnectionOutcomeDisplay 4 kinds), Task 4 (WalletConnectScreen outcomeDisplay) |
| Resume handoff → one authoritative state, no conflicting assumptions | Task 4 (WalletConnectScreen renders from single ViewModel — no split local state) |
| Wallet/Settings: connected summary + reconnect/switch/disconnect | Task 5 (WalletSettingsScreen) |
| New wallet → positions/alerts/history refresh against new identity | Task 6 (PositionsListScreen accepts walletAddress prop — parent refreshes data on wallet change) |
| Navigation remains narrow IA (no dashboard shell) | Task 7 (single /connect route, no new tabs or broader navigation) |

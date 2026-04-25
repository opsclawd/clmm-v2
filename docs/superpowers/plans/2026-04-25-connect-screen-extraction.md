# Connect Screen Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the connect-wallet screen from `apps/app/app/connect.tsx` into `packages/ui` behind a discriminated `ConnectScreenState` model, so the route file collapses to a thin wiring layer (~90 lines) and `packages/ui` owns every visual case.

**Architecture:** A new pure builder `buildConnectScreenViewModel` in `packages/ui` maps shell-provided inputs (capabilities, fallback state, discovery state, wallets, outcome, flags) onto a discriminated `ConnectScreenState`. `WalletConnectScreen` is rewritten to take `{ viewModel, actions }` and render a state-driven body inside the existing hero/features layout. Two new shell-side helpers (`detectFallbackState`, `useDiscoveryState`) get lifted out of the inline route. The existing `buildWalletConnectViewModel` stays untouched (still used by `WalletSettingsScreen`).

**Tech Stack:** React, React Native (via react-native-web), Zustand, Vitest, `@testing-library/react`, Expo Router, `@solana/connector`.

**Spec:** `docs/superpowers/specs/2026-04-25-connect-screen-extraction-design.md`

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `packages/ui/src/components/WalletConnectionUtils.ts` | Modify | Add `WalletPickerOption`, `ConnectScreenState`, `ConnectScreenActions` types |
| `packages/ui/src/view-models/WalletConnectionViewModel.ts` | Modify | Add `ConnectScreenInputs`, `ConnectScreenViewModel`, `buildConnectScreenViewModel` (additive — old builders untouched) |
| `packages/ui/src/view-models/WalletConnectionViewModel.test.ts` | Create | Unit tests for `buildConnectScreenViewModel` |
| `packages/ui/src/components/ConnectWalletPicker.tsx` | Create | Per-wallet row list (icon + name + onSelect) |
| `packages/ui/src/components/ConnectFallbackPanel.tsx` | Create | No-extension warning + Phantom/Solflare deep-link CTAs |
| `packages/ui/src/components/SocialWebviewEscapePanel.tsx` | Create | Social-webview warning + "Open in Browser" + Phantom/Solflare CTAs |
| `packages/ui/src/screens/WalletConnectScreen.tsx` | Rewrite | Renders hero+features+state-driven body from `{viewModel, actions}` |
| `packages/ui/src/screens/WalletConnectScreen.test.tsx` | Rewrite | Per-state-variant render tests |
| `packages/ui/src/index.ts` | Modify | Export new types and `buildConnectScreenViewModel` |
| `apps/app/src/platform/detectFallbackState.ts` | Create | Lifted from inline `connect.tsx` (pure function) |
| `apps/app/src/platform/detectFallbackState.test.ts` | Create | UA matrix tests |
| `apps/app/src/platform/browserWallet/useDiscoveryState.ts` | Create | Hook wrapping walletCount + 2s timeout, sticky |
| `apps/app/src/platform/browserWallet/useDiscoveryState.test.ts` | Create | Timer + sticky behavior tests |
| `apps/app/app/connect.tsx` | Rewrite | ~90-line shell: hooks → view-model → actions → screen |

**Build invariant:** Phase A (tasks 1–6) and Phase B (tasks 7–8) are purely additive and the tree compiles after each task. Phase C (task 9) rewrites the screen + route together in one task because their type contracts change in lockstep — splitting them would leave the tree unbuildable mid-phase.

---

## Conventions

- **Test command (per package):** `pnpm --filter <pkg> test -- <pattern>` runs vitest in that package filtered to files matching `<pattern>`.
- **Typecheck:** `pnpm --filter <pkg> typecheck` (alias for `tsc --noEmit`).
- **Boundaries:** `pnpm boundaries` runs at repo root.
- **Existing test style:** `@testing-library/react` + `vitest`. The file extension stays `.tsx` for screen tests (matches existing `WalletConnectScreen.test.tsx`). The spec mentions `@testing-library/react-native`; the actual repo uses `@testing-library/react` with `react-native-web`. Match the repo.
- **Commit style:** lowercase conventional-commit prefix (`feat(ui):`, `refactor(app):`, `test(ui):`). Match recent commits in the repo (e.g. `fix(wallet-boot):`).
- **DO NOT use `--no-verify`** on commits. If a hook fails, fix the root cause.

---

## Phase A — Additive `packages/ui` work

### Task 1: Add new types to `WalletConnectionUtils.ts`

**Files:**
- Modify: `packages/ui/src/components/WalletConnectionUtils.ts` (append at end of file)

- [ ] **Step 1: Append new types**

Add at the bottom of the file, after `buildPlatformNotice`:

```ts
// --- Connect Screen state model ---

export type WalletPickerOption = {
  id: string;
  name: string;
  iconUri: string | null;
};

export type ConnectScreenState =
  | { kind: 'loading-capabilities' }
  | { kind: 'social-webview'; socialEscapeAttempted: boolean }
  | { kind: 'discovering'; nativeAvailable: boolean }
  | {
      kind: 'ready';
      nativeAvailable: boolean;
      browserWallets: WalletPickerOption[];
    }
  | { kind: 'timed-out-discovery'; nativeAvailable: boolean }
  | { kind: 'wallet-fallback'; nativeAvailable: boolean }
  | { kind: 'desktop-no-wallet' };

export type ConnectScreenActions = {
  onSelectNativeWallet: () => void;
  onSelectBrowserWallet: (walletId: string) => void;
  onConnectDefaultBrowser: () => void;
  onOpenInExternalBrowser: () => void;
  onOpenInPhantom: () => void;
  onOpenInSolflare: () => void;
  onGoBack: () => void;
  onDismissOutcome: () => void;
};
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @clmm/ui typecheck`
Expected: passes (no consumers yet).

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/WalletConnectionUtils.ts
git commit -m "feat(ui): add ConnectScreenState type model"
```

---

### Task 2: Add `buildConnectScreenViewModel` (TDD)

**Files:**
- Create: `packages/ui/src/view-models/WalletConnectionViewModel.test.ts`
- Modify: `packages/ui/src/view-models/WalletConnectionViewModel.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/ui/src/view-models/WalletConnectionViewModel.test.ts` with the full decision-tree coverage:

```ts
import { describe, it, expect } from 'vitest';
import { buildConnectScreenViewModel } from './WalletConnectionViewModel.js';
import type { PlatformCapabilities } from '../components/DegradedCapabilityBannerUtils.js';
import type { WalletPickerOption } from '../components/WalletConnectionUtils.js';

const CAPS_NATIVE_ONLY: PlatformCapabilities = {
  nativePushAvailable: false,
  browserNotificationAvailable: false,
  nativeWalletAvailable: true,
  browserWalletAvailable: false,
  isMobileWeb: false,
};

const CAPS_BROWSER_ONLY: PlatformCapabilities = {
  ...CAPS_NATIVE_ONLY,
  nativeWalletAvailable: false,
  browserWalletAvailable: true,
};

const CAPS_NEITHER: PlatformCapabilities = {
  ...CAPS_NATIVE_ONLY,
  nativeWalletAvailable: false,
  browserWalletAvailable: false,
};

const WALLET_PHANTOM: WalletPickerOption = { id: 'phantom', name: 'Phantom', iconUri: null };

function baseInputs(overrides: Partial<Parameters<typeof buildConnectScreenViewModel>[0]> = {}) {
  return {
    capabilities: CAPS_BROWSER_ONLY,
    fallbackState: 'none' as const,
    discoveryState: 'discovering' as const,
    browserWallets: [],
    connectionOutcome: null,
    isConnecting: false,
    socialEscapeAttempted: false,
    ...overrides,
  };
}

describe('buildConnectScreenViewModel', () => {
  it('returns loading-capabilities when capabilities is null', () => {
    const vm = buildConnectScreenViewModel(baseInputs({ capabilities: null }));
    expect(vm.state.kind).toBe('loading-capabilities');
  });

  it('returns social-webview and passes socialEscapeAttempted=false through', () => {
    const vm = buildConnectScreenViewModel(
      baseInputs({ fallbackState: 'social-webview', socialEscapeAttempted: false }),
    );
    expect(vm.state).toEqual({ kind: 'social-webview', socialEscapeAttempted: false });
  });

  it('returns social-webview and passes socialEscapeAttempted=true through', () => {
    const vm = buildConnectScreenViewModel(
      baseInputs({ fallbackState: 'social-webview', socialEscapeAttempted: true }),
    );
    expect(vm.state).toEqual({ kind: 'social-webview', socialEscapeAttempted: true });
  });

  it('returns desktop-no-wallet when fallbackState is desktop-no-wallet', () => {
    const vm = buildConnectScreenViewModel(baseInputs({ fallbackState: 'desktop-no-wallet' }));
    expect(vm.state).toEqual({ kind: 'desktop-no-wallet' });
  });

  it('returns wallet-fallback with nativeAvailable=true', () => {
    const vm = buildConnectScreenViewModel(
      baseInputs({ fallbackState: 'wallet-fallback', capabilities: CAPS_NATIVE_ONLY }),
    );
    expect(vm.state).toEqual({ kind: 'wallet-fallback', nativeAvailable: true });
  });

  it('returns wallet-fallback with nativeAvailable=false', () => {
    const vm = buildConnectScreenViewModel(
      baseInputs({ fallbackState: 'wallet-fallback', capabilities: CAPS_NEITHER }),
    );
    expect(vm.state).toEqual({ kind: 'wallet-fallback', nativeAvailable: false });
  });

  it('returns discovering when discoveryState is discovering', () => {
    const vm = buildConnectScreenViewModel(baseInputs({ discoveryState: 'discovering' }));
    expect(vm.state).toEqual({ kind: 'discovering', nativeAvailable: false });
  });

  it('returns ready with non-empty browserWallets', () => {
    const vm = buildConnectScreenViewModel(
      baseInputs({ discoveryState: 'ready', browserWallets: [WALLET_PHANTOM] }),
    );
    expect(vm.state).toEqual({
      kind: 'ready',
      nativeAvailable: false,
      browserWallets: [WALLET_PHANTOM],
    });
  });

  it('returns ready with empty browserWallets when nativeAvailable is true (native-only path)', () => {
    const vm = buildConnectScreenViewModel(
      baseInputs({
        capabilities: CAPS_NATIVE_ONLY,
        discoveryState: 'ready',
        browserWallets: [],
      }),
    );
    expect(vm.state).toEqual({
      kind: 'ready',
      nativeAvailable: true,
      browserWallets: [],
    });
  });

  it('returns timed-out-discovery when discoveryState is timed-out', () => {
    const vm = buildConnectScreenViewModel(baseInputs({ discoveryState: 'timed-out' }));
    expect(vm.state).toEqual({ kind: 'timed-out-discovery', nativeAvailable: false });
  });

  it('social-webview wins over discoveryState=ready', () => {
    const vm = buildConnectScreenViewModel(
      baseInputs({
        fallbackState: 'social-webview',
        discoveryState: 'ready',
        browserWallets: [WALLET_PHANTOM],
        socialEscapeAttempted: false,
      }),
    );
    expect(vm.state.kind).toBe('social-webview');
  });

  it('outcome is the failed display when outcome is failed', () => {
    const vm = buildConnectScreenViewModel(
      baseInputs({ connectionOutcome: { kind: 'failed', reason: 'x' } }),
    );
    expect(vm.outcome).not.toBeNull();
    expect(vm.outcome?.title).toBe('Connection Failed');
  });

  it('outcome is null when outcome is connected', () => {
    const vm = buildConnectScreenViewModel(
      baseInputs({ connectionOutcome: { kind: 'connected' } }),
    );
    expect(vm.outcome).toBeNull();
  });

  it('outcome is null when outcome is null', () => {
    const vm = buildConnectScreenViewModel(baseInputs({ connectionOutcome: null }));
    expect(vm.outcome).toBeNull();
  });

  it('passes isConnecting through', () => {
    const vm = buildConnectScreenViewModel(baseInputs({ isConnecting: true }));
    expect(vm.isConnecting).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @clmm/ui test -- WalletConnectionViewModel`
Expected: FAIL — `buildConnectScreenViewModel is not exported`.

- [ ] **Step 3: Implement `buildConnectScreenViewModel`**

Append to `packages/ui/src/view-models/WalletConnectionViewModel.ts`:

```ts
import type {
  WalletPickerOption,
  ConnectScreenState,
} from '../components/WalletConnectionUtils.js';

// --- Connect Screen ViewModel (state-driven) ---

export type ConnectScreenInputs = {
  capabilities: PlatformCapabilities | null;
  fallbackState: 'none' | 'social-webview' | 'wallet-fallback' | 'desktop-no-wallet';
  discoveryState: 'discovering' | 'ready' | 'timed-out';
  browserWallets: WalletPickerOption[];
  connectionOutcome: ConnectionOutcome | null;
  isConnecting: boolean;
  socialEscapeAttempted: boolean;
};

export type ConnectScreenViewModel = {
  state: ConnectScreenState;
  outcome: ConnectionOutcomeDisplay | null;
  isConnecting: boolean;
};

export function buildConnectScreenViewModel(
  inputs: ConnectScreenInputs,
): ConnectScreenViewModel {
  const outcome =
    inputs.connectionOutcome === null || inputs.connectionOutcome.kind === 'connected'
      ? null
      : getConnectionOutcomeDisplay(inputs.connectionOutcome);

  if (inputs.capabilities === null) {
    return { state: { kind: 'loading-capabilities' }, outcome, isConnecting: inputs.isConnecting };
  }

  const nativeAvailable = inputs.capabilities.nativeWalletAvailable;

  // Decision rules — first match wins (top-to-bottom).
  if (inputs.fallbackState === 'social-webview') {
    return {
      state: { kind: 'social-webview', socialEscapeAttempted: inputs.socialEscapeAttempted },
      outcome,
      isConnecting: inputs.isConnecting,
    };
  }

  if (inputs.fallbackState === 'desktop-no-wallet') {
    return { state: { kind: 'desktop-no-wallet' }, outcome, isConnecting: inputs.isConnecting };
  }

  if (inputs.fallbackState === 'wallet-fallback') {
    return {
      state: { kind: 'wallet-fallback', nativeAvailable },
      outcome,
      isConnecting: inputs.isConnecting,
    };
  }

  switch (inputs.discoveryState) {
    case 'discovering':
      return {
        state: { kind: 'discovering', nativeAvailable },
        outcome,
        isConnecting: inputs.isConnecting,
      };
    case 'ready':
      return {
        state: { kind: 'ready', nativeAvailable, browserWallets: inputs.browserWallets },
        outcome,
        isConnecting: inputs.isConnecting,
      };
    case 'timed-out':
      return {
        state: { kind: 'timed-out-discovery', nativeAvailable },
        outcome,
        isConnecting: inputs.isConnecting,
      };
  }
}
```

Note: `PlatformCapabilities`, `ConnectionOutcome`, `ConnectionOutcomeDisplay`, and `getConnectionOutcomeDisplay` are already imported at the top of this file. If imports need expansion, also add `WalletPickerOption` and `ConnectScreenState` from `../components/WalletConnectionUtils.js`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @clmm/ui test -- WalletConnectionViewModel`
Expected: all tests pass.

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter @clmm/ui typecheck`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/view-models/WalletConnectionViewModel.ts \
        packages/ui/src/view-models/WalletConnectionViewModel.test.ts
git commit -m "feat(ui): add buildConnectScreenViewModel"
```

---

### Task 3: Add `ConnectWalletPicker` sub-component

**Files:**
- Create: `packages/ui/src/components/ConnectWalletPicker.tsx`

This component renders one row per `WalletPickerOption`. It is internal to `packages/ui` (not exported from `index.ts`) and is exercised by the `WalletConnectScreen` tests in Task 9. We do not write a separate test file — render coverage comes via the screen test in the `ready` state.

- [ ] **Step 1: Implement the component**

```tsx
import { TouchableOpacity, View, Text, Image, StyleSheet } from 'react-native';
import { colors, typography } from '../design-system/index.js';
import type { WalletPickerOption } from './WalletConnectionUtils.js';

type Props = {
  wallets: WalletPickerOption[];
  disabled: boolean;
  onSelect: (walletId: string) => void;
};

export function ConnectWalletPicker({ wallets, disabled, onSelect }: Props): JSX.Element {
  return (
    <View style={styles.container}>
      {wallets.map((wallet) => (
        <TouchableOpacity
          key={wallet.id}
          onPress={() => onSelect(wallet.id)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`Connect ${wallet.name}`}
          style={styles.row}
        >
          {wallet.iconUri ? (
            <Image source={{ uri: wallet.iconUri }} style={styles.icon} />
          ) : null}
          <View style={styles.label}>
            <Text style={styles.name}>{wallet.name}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: { width: 24, height: 24 },
  label: { flex: 1 },
  name: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.body,
    fontWeight: typography.fontWeight.semibold,
  },
});
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @clmm/ui typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/ConnectWalletPicker.tsx
git commit -m "feat(ui): add ConnectWalletPicker component"
```

---

### Task 4: Add `ConnectFallbackPanel` sub-component

**Files:**
- Create: `packages/ui/src/components/ConnectFallbackPanel.tsx`

Renders the no-extension warning + Phantom/Solflare deep-link buttons used by both `wallet-fallback` and (within a wider panel) `social-webview`. We expose it as a small, reusable block. Tested via the screen tests in Task 9.

- [ ] **Step 1: Implement the component**

```tsx
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { colors, typography } from '../design-system/index.js';

type Props = {
  /** When true, renders the no-wallet warning banner above the deep-link buttons. */
  showNoWalletWarning: boolean;
  onOpenInPhantom: () => void;
  onOpenInSolflare: () => void;
};

export function ConnectFallbackPanel({
  showNoWalletWarning,
  onOpenInPhantom,
  onOpenInSolflare,
}: Props): JSX.Element {
  return (
    <View style={styles.container}>
      {showNoWalletWarning ? (
        <View style={styles.warning}>
          <Text style={styles.warningTitle}>No wallet extension detected in this browser.</Text>
          <Text style={styles.warningDetail}>
            You can open this page directly in a wallet browser, or switch to a desktop browser
            with an installed extension.
          </Text>
        </View>
      ) : null}
      <Text style={styles.label}>Open in a wallet browser:</Text>
      <TouchableOpacity
        onPress={onOpenInPhantom}
        accessibilityRole="button"
        accessibilityLabel="Open in Phantom"
        style={styles.linkButton}
      >
        <Text style={[styles.linkText, { color: '#ab9ff2' }]}>Open in Phantom</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onOpenInSolflare}
        accessibilityRole="button"
        accessibilityLabel="Open in Solflare"
        style={styles.linkButton}
      >
        <Text style={[styles.linkText, { color: '#fc8748' }]}>Open in Solflare</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', marginTop: 16 },
  warning: {
    padding: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.warn,
    marginBottom: 12,
  },
  warningTitle: {
    color: colors.warn,
    fontSize: typography.fontSize.body,
    fontWeight: typography.fontWeight.semibold,
  },
  warningDetail: {
    color: colors.textBody,
    fontSize: typography.fontSize.caption,
    marginTop: 4,
  },
  label: {
    color: colors.textFaint,
    fontSize: typography.fontSize.caption,
    marginBottom: 8,
  },
  linkButton: {
    padding: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkText: {
    fontSize: typography.fontSize.body,
    fontWeight: typography.fontWeight.semibold,
  },
});
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @clmm/ui typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/ConnectFallbackPanel.tsx
git commit -m "feat(ui): add ConnectFallbackPanel component"
```

---

### Task 5: Add `SocialWebviewEscapePanel` sub-component

**Files:**
- Create: `packages/ui/src/components/SocialWebviewEscapePanel.tsx`

- [ ] **Step 1: Implement the component**

```tsx
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { colors, typography } from '../design-system/index.js';
import { ConnectFallbackPanel } from './ConnectFallbackPanel.js';

type Props = {
  socialEscapeAttempted: boolean;
  onOpenInExternalBrowser: () => void;
  onOpenInPhantom: () => void;
  onOpenInSolflare: () => void;
};

export function SocialWebviewEscapePanel({
  socialEscapeAttempted,
  onOpenInExternalBrowser,
  onOpenInPhantom,
  onOpenInSolflare,
}: Props): JSX.Element {
  return (
    <View style={styles.container}>
      <View style={styles.warning}>
        <Text style={styles.warningTitle}>
          Social app browsers block wallet extensions.
        </Text>
        <Text style={styles.warningDetail}>
          Open this page in Safari or Chrome to connect your wallet, or use Phantom / Solflare directly below.
        </Text>
      </View>

      <TouchableOpacity
        onPress={onOpenInExternalBrowser}
        disabled={socialEscapeAttempted}
        accessibilityRole="button"
        accessibilityLabel="Open in Browser"
        style={[
          styles.escapeButton,
          socialEscapeAttempted && styles.escapeButtonDisabled,
        ]}
      >
        <Text style={[
          styles.escapeText,
          socialEscapeAttempted && styles.escapeTextDisabled,
        ]}>
          Open in Browser
        </Text>
        <Text style={styles.escapeDetail}>
          Opens this page in your default browser where wallet extensions work.
        </Text>
      </TouchableOpacity>

      <ConnectFallbackPanel
        showNoWalletWarning={false}
        onOpenInPhantom={onOpenInPhantom}
        onOpenInSolflare={onOpenInSolflare}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', marginTop: 16 },
  warning: {
    padding: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.warn,
    marginBottom: 16,
  },
  warningTitle: {
    color: colors.warn,
    fontSize: typography.fontSize.body,
    fontWeight: typography.fontWeight.semibold,
  },
  warningDetail: {
    color: colors.textBody,
    fontSize: typography.fontSize.caption,
    marginTop: 4,
  },
  escapeButton: {
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.safe,
  },
  escapeButtonDisabled: {
    borderColor: colors.border,
    opacity: 0.6,
  },
  escapeText: {
    color: colors.safe,
    fontSize: typography.fontSize.body,
    fontWeight: typography.fontWeight.semibold,
  },
  escapeTextDisabled: {
    color: colors.textFaint,
  },
  escapeDetail: {
    color: colors.textBody,
    fontSize: typography.fontSize.caption,
    marginTop: 4,
  },
});
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @clmm/ui typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/SocialWebviewEscapePanel.tsx
git commit -m "feat(ui): add SocialWebviewEscapePanel component"
```

---

### Task 6: Export new types and builder from `packages/ui/src/index.ts`

**Files:**
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Add exports**

In the "Wallet connection utils" type block, append `WalletPickerOption`, `ConnectScreenState`, and `ConnectScreenActions` to the existing `export type { ... } from './components/WalletConnectionUtils.js'` block.

In the "View models" block, add:

```ts
export { buildConnectScreenViewModel } from './view-models/WalletConnectionViewModel.js';
export type {
  ConnectScreenInputs,
  ConnectScreenViewModel,
} from './view-models/WalletConnectionViewModel.js';
```

Do not remove or change any existing exports. `buildWalletConnectViewModel`, `buildWalletSettingsViewModel`, `WalletConnectViewModel`, and `WalletSettingsViewModel` stay exported (still used by `WalletSettingsScreen`).

- [ ] **Step 2: Run typecheck across the workspace**

Run: `pnpm typecheck`
Expected: passes (no consumers of the new exports yet, but the workspace must still build).

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/index.ts
git commit -m "feat(ui): export ConnectScreen view-model and types"
```

---

## Phase B — Additive `apps/app` shell helpers

### Task 7: Lift `detectFallbackState` to its own file

**Files:**
- Create: `apps/app/src/platform/detectFallbackState.ts`
- Create: `apps/app/src/platform/detectFallbackState.test.ts`

The existing inline `detectFallbackState` in `apps/app/app/connect.tsx` is moved verbatim, plus a small structural change: the constant `NO_WALLET_MESSAGE` moves with it and is exported (so the route file can reuse the same string when it cares about the error message, though after Task 9 it won't need to).

- [ ] **Step 1: Write failing tests**

Create `apps/app/src/platform/detectFallbackState.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PlatformCapabilityState } from '@clmm/application/public';
import { Platform } from 'react-native';

import { detectFallbackState, NO_WALLET_MESSAGE } from './detectFallbackState';

const CAPS_NO_WALLET: PlatformCapabilityState = {
  nativePushAvailable: false,
  browserNotificationAvailable: false,
  nativeWalletAvailable: false,
  browserWalletAvailable: false,
  isMobileWeb: false,
};

const CAPS_BROWSER_OK: PlatformCapabilityState = {
  ...CAPS_NO_WALLET,
  browserWalletAvailable: true,
};

function withUserAgent(ua: string, fn: () => void) {
  const original = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: ua },
    configurable: true,
    writable: true,
  });
  try {
    fn();
  } finally {
    if (original) {
      Object.defineProperty(globalThis, 'navigator', { value: original, configurable: true, writable: true });
    }
  }
}

beforeEach(() => {
  vi.spyOn(Platform, 'OS', 'get').mockReturnValue('web');
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('detectFallbackState', () => {
  it('returns "none" when Platform.OS is not web', () => {
    vi.spyOn(Platform, 'OS', 'get').mockReturnValue('ios');
    expect(detectFallbackState(CAPS_NO_WALLET, null)).toBe('none');
  });

  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) FBAN/FBIOS', 'social-webview'],
    ['Mozilla/5.0 (Linux; Android 10) Instagram 200.0.0', 'social-webview'],
    ['Mozilla/5.0 Twitter for iPhone', 'social-webview'],
    ['Mozilla/5.0 TikTok 26.5', 'social-webview'],
    ['Mozilla/5.0 LinkedInApp/9.0', 'social-webview'],
    ['Mozilla/5.0 Line/12.0', 'social-webview'],
  ])('detects social webview for UA %#', (ua, expected) => {
    withUserAgent(ua, () => {
      expect(detectFallbackState(CAPS_NO_WALLET, null)).toBe(expected);
    });
  });

  it('returns "wallet-fallback" on mobile UA when no wallet detected', () => {
    withUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) Mobile/15E148', () => {
      expect(detectFallbackState(CAPS_NO_WALLET, null)).toBe('wallet-fallback');
    });
  });

  it('returns "desktop-no-wallet" on desktop UA when no wallet detected', () => {
    withUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Chrome/120', () => {
      expect(detectFallbackState(CAPS_NO_WALLET, null)).toBe('desktop-no-wallet');
    });
  });

  it('returns "none" on mobile UA when browser wallet is available', () => {
    withUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) Mobile/15E148', () => {
      expect(detectFallbackState(CAPS_BROWSER_OK, null)).toBe('none');
    });
  });

  it('falls into wallet-fallback when connectError matches NO_WALLET_MESSAGE on mobile', () => {
    withUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) Mobile/15E148', () => {
      expect(
        detectFallbackState(CAPS_BROWSER_OK, new Error(NO_WALLET_MESSAGE)),
      ).toBe('wallet-fallback');
    });
  });

  it('returns "none" when capabilities is null', () => {
    expect(detectFallbackState(null, null)).toBe('none');
  });
});
```

Note the last case: the existing inline implementation reads `platformCapabilities?.browserWalletAvailable`, so a `null` capabilities argument is equivalent to "no wallet detected." However, we don't want `null` capabilities to render the desktop-no-wallet panel before the user even sees a loading spinner. The view-model handles that by returning `loading-capabilities` when `capabilities === null` — so `detectFallbackState` returning `'none'` for null caps is harmless but worth a guard. The tests above pin this behavior.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @clmm/app test -- detectFallbackState`
Expected: FAIL — file does not exist.

- [ ] **Step 3: Implement `detectFallbackState`**

Create `apps/app/src/platform/detectFallbackState.ts`:

```ts
import { Platform } from 'react-native';
import type { PlatformCapabilityState } from '@clmm/application/public';
import { isSocialAppWebView } from './browserWallet/walletDeepLinks';

export const NO_WALLET_MESSAGE = 'No supported browser wallet detected on this device';

export type FallbackState =
  | 'none'
  | 'wallet-fallback'
  | 'desktop-no-wallet'
  | 'social-webview';

export function detectFallbackState(
  platformCapabilities: PlatformCapabilityState | null,
  connectError: Error | null,
): FallbackState {
  if (Platform.OS !== 'web') {
    return 'none';
  }
  if (platformCapabilities === null) {
    return 'none';
  }
  if (typeof navigator !== 'undefined' && isSocialAppWebView(navigator.userAgent)) {
    return 'social-webview';
  }

  const noWalletDetected = !platformCapabilities.browserWalletAvailable;
  const connectThrewNoWallet = connectError?.message === NO_WALLET_MESSAGE;

  if (noWalletDetected || connectThrewNoWallet) {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    if (/Mobi|Android|iPad/i.test(ua)) {
      return 'wallet-fallback';
    }
    return 'desktop-no-wallet';
  }

  return 'none';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @clmm/app test -- detectFallbackState`
Expected: all tests pass.

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter @clmm/app typecheck`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/platform/detectFallbackState.ts \
        apps/app/src/platform/detectFallbackState.test.ts
git commit -m "refactor(app): lift detectFallbackState into its own module"
```

---

### Task 8: Add `useDiscoveryState` hook

**Files:**
- Create: `apps/app/src/platform/browserWallet/useDiscoveryState.ts`
- Create: `apps/app/src/platform/browserWallet/useDiscoveryState.test.ts`

The hook returns `'discovering' | 'ready' | 'timed-out'` from a `walletCount: number`. It is sticky: once `'ready'` or `'timed-out'`, it does not return to `'discovering'`. Once `'timed-out'`, it stays `'timed-out'` even if wallets later appear.

- [ ] **Step 1: Write failing tests**

Create `apps/app/src/platform/browserWallet/useDiscoveryState.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDiscoveryState, WALLET_DISCOVERY_TIMEOUT_MS } from './useDiscoveryState';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useDiscoveryState', () => {
  it('starts at "discovering" with walletCount 0', () => {
    const { result } = renderHook(({ count }) => useDiscoveryState(count), {
      initialProps: { count: 0 },
    });
    expect(result.current).toBe('discovering');
  });

  it('transitions to "ready" when walletCount becomes >0 before timeout', () => {
    const { result, rerender } = renderHook(({ count }) => useDiscoveryState(count), {
      initialProps: { count: 0 },
    });
    expect(result.current).toBe('discovering');
    rerender({ count: 1 });
    expect(result.current).toBe('ready');
  });

  it('transitions to "timed-out" after WALLET_DISCOVERY_TIMEOUT_MS with walletCount 0', () => {
    const { result } = renderHook(({ count }) => useDiscoveryState(count), {
      initialProps: { count: 0 },
    });
    act(() => {
      vi.advanceTimersByTime(WALLET_DISCOVERY_TIMEOUT_MS);
    });
    expect(result.current).toBe('timed-out');
  });

  it('stays "timed-out" even if walletCount later becomes >0 (sticky)', () => {
    const { result, rerender } = renderHook(({ count }) => useDiscoveryState(count), {
      initialProps: { count: 0 },
    });
    act(() => {
      vi.advanceTimersByTime(WALLET_DISCOVERY_TIMEOUT_MS);
    });
    expect(result.current).toBe('timed-out');
    rerender({ count: 2 });
    expect(result.current).toBe('timed-out');
  });

  it('once "ready", does not return to "discovering" if walletCount drops to 0', () => {
    const { result, rerender } = renderHook(({ count }) => useDiscoveryState(count), {
      initialProps: { count: 1 },
    });
    expect(result.current).toBe('ready');
    rerender({ count: 0 });
    expect(result.current).toBe('ready');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @clmm/app test -- useDiscoveryState`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the hook**

Create `apps/app/src/platform/browserWallet/useDiscoveryState.ts`:

```ts
import { useEffect, useState } from 'react';

export const WALLET_DISCOVERY_TIMEOUT_MS = 2000;

export type WalletDiscoveryState = 'discovering' | 'ready' | 'timed-out';

export function useDiscoveryState(walletCount: number): WalletDiscoveryState {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (walletCount > 0 || timedOut) return;
    const timer = setTimeout(() => setTimedOut(true), WALLET_DISCOVERY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [walletCount, timedOut]);

  if (timedOut) return 'timed-out';
  if (walletCount > 0) return 'ready';
  return 'discovering';
}
```

Sticky behavior: the `'ready'` → `'discovering'` rollback is prevented because `walletCount > 0` is the only path to `'ready'`; if it drops back to 0, the hook returns `'discovering'`. **Wait — that contradicts the test "once ready, does not return to discovering."** We need real stickiness:

```ts
import { useEffect, useState } from 'react';

export const WALLET_DISCOVERY_TIMEOUT_MS = 2000;

export type WalletDiscoveryState = 'discovering' | 'ready' | 'timed-out';

export function useDiscoveryState(walletCount: number): WalletDiscoveryState {
  const [state, setState] = useState<WalletDiscoveryState>(
    walletCount > 0 ? 'ready' : 'discovering',
  );

  useEffect(() => {
    if (state === 'ready' || state === 'timed-out') return;
    if (walletCount > 0) {
      setState('ready');
      return;
    }
    const timer = setTimeout(() => setState('timed-out'), WALLET_DISCOVERY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [walletCount, state]);

  return state;
}
```

Use this version. The earlier draft was wrong — the second draft is sticky in both directions.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @clmm/app test -- useDiscoveryState`
Expected: all tests pass.

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter @clmm/app typecheck`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/platform/browserWallet/useDiscoveryState.ts \
        apps/app/src/platform/browserWallet/useDiscoveryState.test.ts
git commit -m "feat(app): add useDiscoveryState hook"
```

---

## Phase C — Coupled rewrite of screen + route

### Task 9: Rewrite `WalletConnectScreen` and `connect.tsx` together

**Files:**
- Rewrite: `packages/ui/src/screens/WalletConnectScreen.tsx`
- Rewrite: `packages/ui/src/screens/WalletConnectScreen.test.tsx`
- Rewrite: `apps/app/app/connect.tsx`

This is one task because the screen's prop contract changes from `{platformCapabilities, connectionOutcome, isConnecting, onSelectWallet, onGoBack}` to `{viewModel, actions}`, and `connect.tsx` is the only consumer. Rewriting one without the other breaks `pnpm typecheck` for the workspace.

- [ ] **Step 1: Write the new screen test file**

Replace `packages/ui/src/screens/WalletConnectScreen.test.tsx` with the per-state-variant tests:

```tsx
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WalletConnectScreen } from './WalletConnectScreen.js';
import type {
  ConnectScreenViewModel,
} from '../view-models/WalletConnectionViewModel.js';
import type {
  ConnectScreenActions,
  ConnectScreenState,
  WalletPickerOption,
} from '../components/WalletConnectionUtils.js';

vi.mock('@expo/vector-icons/Feather', () => ({
  default: function MockFeather({ name, size, color }: { name: string; size: number; color: string }) {
    return <span data-testid="feather-icon" data-name={name} data-size={size} data-color={color} />;
  },
  glyphMap: {},
}));

afterEach(() => {
  cleanup();
});

const PHANTOM: WalletPickerOption = { id: 'phantom', name: 'Phantom', iconUri: null };
const SOLFLARE: WalletPickerOption = { id: 'solflare', name: 'Solflare', iconUri: null };

function makeVM(state: ConnectScreenState, overrides: Partial<ConnectScreenViewModel> = {}): ConnectScreenViewModel {
  return {
    state,
    outcome: null,
    isConnecting: false,
    ...overrides,
  };
}

function makeActions(overrides: Partial<ConnectScreenActions> = {}): ConnectScreenActions {
  return {
    onSelectNativeWallet: vi.fn(),
    onSelectBrowserWallet: vi.fn(),
    onConnectDefaultBrowser: vi.fn(),
    onOpenInExternalBrowser: vi.fn(),
    onOpenInPhantom: vi.fn(),
    onOpenInSolflare: vi.fn(),
    onGoBack: vi.fn(),
    onDismissOutcome: vi.fn(),
    ...overrides,
  };
}

describe('WalletConnectScreen', () => {
  describe('hybrid layout (always visible)', () => {
    it('renders title and subtitle in every state', () => {
      render(<WalletConnectScreen viewModel={makeVM({ kind: 'discovering', nativeAvailable: false })} actions={makeActions()} />);
      expect(screen.getByText('Protect your Orca positions')).toBeTruthy();
      expect(screen.getByText(/concentrated liquidity range/)).toBeTruthy();
    });

    it('renders feature bullets in every state', () => {
      render(<WalletConnectScreen viewModel={makeVM({ kind: 'discovering', nativeAvailable: false })} actions={makeActions()} />);
      expect(screen.getByText('Read-only by default')).toBeTruthy();
      expect(screen.getByText('Debounced breach logic')).toBeTruthy();
      expect(screen.getByText('Action history')).toBeTruthy();
    });

    it('back button calls actions.onGoBack', () => {
      const actions = makeActions();
      render(<WalletConnectScreen viewModel={makeVM({ kind: 'discovering', nativeAvailable: false })} actions={actions} />);
      fireEvent.click(screen.getByLabelText('Back'));
      expect(actions.onGoBack).toHaveBeenCalled();
    });
  });

  describe('loading-capabilities', () => {
    it('renders progressbar and no wallet buttons', () => {
      render(<WalletConnectScreen viewModel={makeVM({ kind: 'loading-capabilities' })} actions={makeActions()} />);
      expect(screen.getByRole('progressbar')).toBeTruthy();
      expect(screen.queryByLabelText(/Connect/i)).toBeNull();
    });
  });

  describe('discovering', () => {
    it('renders detection text', () => {
      render(<WalletConnectScreen viewModel={makeVM({ kind: 'discovering', nativeAvailable: false })} actions={makeActions()} />);
      expect(screen.getByText('Detecting browser wallets...')).toBeTruthy();
    });

    it('renders native button when nativeAvailable=true', () => {
      const actions = makeActions();
      render(<WalletConnectScreen viewModel={makeVM({ kind: 'discovering', nativeAvailable: true })} actions={actions} />);
      const btn = screen.getByLabelText('Connect Mobile Wallet');
      fireEvent.click(btn);
      expect(actions.onSelectNativeWallet).toHaveBeenCalled();
    });
  });

  describe('ready', () => {
    it('renders one row per browser wallet, each invoking onSelectBrowserWallet with its id', () => {
      const actions = makeActions();
      render(
        <WalletConnectScreen
          viewModel={makeVM({ kind: 'ready', nativeAvailable: false, browserWallets: [PHANTOM, SOLFLARE] })}
          actions={actions}
        />,
      );
      fireEvent.click(screen.getByLabelText('Connect Phantom'));
      fireEvent.click(screen.getByLabelText('Connect Solflare'));
      expect(actions.onSelectBrowserWallet).toHaveBeenNthCalledWith(1, 'phantom');
      expect(actions.onSelectBrowserWallet).toHaveBeenNthCalledWith(2, 'solflare');
    });

    it('renders only the native button when browserWallets is empty and nativeAvailable=true', () => {
      render(
        <WalletConnectScreen
          viewModel={makeVM({ kind: 'ready', nativeAvailable: true, browserWallets: [] })}
          actions={makeActions()}
        />,
      );
      expect(screen.getByLabelText('Connect Mobile Wallet')).toBeTruthy();
      expect(screen.queryByLabelText(/Connect Phantom/)).toBeNull();
    });
  });

  describe('timed-out-discovery', () => {
    it('renders the default-browser CTA invoking onConnectDefaultBrowser', () => {
      const actions = makeActions();
      render(
        <WalletConnectScreen
          viewModel={makeVM({ kind: 'timed-out-discovery', nativeAvailable: false })}
          actions={actions}
        />,
      );
      fireEvent.click(screen.getByLabelText('Connect Browser Wallet'));
      expect(actions.onConnectDefaultBrowser).toHaveBeenCalled();
    });
  });

  describe('social-webview', () => {
    it('renders warning + Open in Browser CTA wired to onOpenInExternalBrowser', () => {
      const actions = makeActions();
      render(
        <WalletConnectScreen
          viewModel={makeVM({ kind: 'social-webview', socialEscapeAttempted: false })}
          actions={actions}
        />,
      );
      expect(screen.getByText('Social app browsers block wallet extensions.')).toBeTruthy();
      fireEvent.click(screen.getByLabelText('Open in Browser'));
      expect(actions.onOpenInExternalBrowser).toHaveBeenCalled();
    });

    it('renders Phantom and Solflare deep-link buttons', () => {
      const actions = makeActions();
      render(
        <WalletConnectScreen
          viewModel={makeVM({ kind: 'social-webview', socialEscapeAttempted: false })}
          actions={actions}
        />,
      );
      fireEvent.click(screen.getByLabelText('Open in Phantom'));
      expect(actions.onOpenInPhantom).toHaveBeenCalled();
      fireEvent.click(screen.getByLabelText('Open in Solflare'));
      expect(actions.onOpenInSolflare).toHaveBeenCalled();
    });

    it('disables Open in Browser when socialEscapeAttempted=true', () => {
      const actions = makeActions();
      render(
        <WalletConnectScreen
          viewModel={makeVM({ kind: 'social-webview', socialEscapeAttempted: true })}
          actions={actions}
        />,
      );
      const btn = screen.getByLabelText('Open in Browser');
      fireEvent.click(btn);
      expect(actions.onOpenInExternalBrowser).not.toHaveBeenCalled();
    });
  });

  describe('wallet-fallback', () => {
    it('renders no-wallet warning + Phantom/Solflare deep links', () => {
      render(
        <WalletConnectScreen
          viewModel={makeVM({ kind: 'wallet-fallback', nativeAvailable: false })}
          actions={makeActions()}
        />,
      );
      expect(screen.getByText('No wallet extension detected in this browser.')).toBeTruthy();
      expect(screen.getByLabelText('Open in Phantom')).toBeTruthy();
      expect(screen.getByLabelText('Open in Solflare')).toBeTruthy();
    });
  });

  describe('desktop-no-wallet', () => {
    it('renders install copy and no wallet buttons', () => {
      render(
        <WalletConnectScreen
          viewModel={makeVM({ kind: 'desktop-no-wallet' })}
          actions={makeActions()}
        />,
      );
      expect(screen.getByText(/Install a Solana wallet extension/i)).toBeTruthy();
      expect(screen.queryByLabelText(/Connect Mobile Wallet/)).toBeNull();
    });
  });

  describe('outcome banner', () => {
    it('renders Connection Failed for failed outcome', () => {
      render(
        <WalletConnectScreen
          viewModel={makeVM({ kind: 'discovering', nativeAvailable: false }, {
            outcome: { title: 'Connection Failed', detail: 'reason: x', severity: 'error' },
          })}
          actions={makeActions()}
        />,
      );
      expect(screen.getByText('Connection Failed')).toBeTruthy();
    });

    it('renders nothing when outcome is null', () => {
      render(
        <WalletConnectScreen
          viewModel={makeVM({ kind: 'discovering', nativeAvailable: false })}
          actions={makeActions()}
        />,
      );
      expect(screen.queryByText('Connection Failed')).toBeNull();
    });
  });

  describe('isConnecting', () => {
    it('renders Connecting... when isConnecting=true', () => {
      render(
        <WalletConnectScreen
          viewModel={makeVM({ kind: 'discovering', nativeAvailable: true }, { isConnecting: true })}
          actions={makeActions()}
        />,
      );
      expect(screen.getByText('Connecting...')).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @clmm/ui test -- WalletConnectScreen`
Expected: FAIL — old props removed, new props missing.

- [ ] **Step 3: Rewrite `WalletConnectScreen.tsx`**

Replace `packages/ui/src/screens/WalletConnectScreen.tsx` entirely with the state-driven implementation:

```tsx
import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Animated,
  StyleSheet,
} from 'react-native';
import { colors, typography } from '../design-system/index.js';
import { Icon } from '../components/Icon.js';
import { ConnectWalletPicker } from '../components/ConnectWalletPicker.js';
import { ConnectFallbackPanel } from '../components/ConnectFallbackPanel.js';
import { SocialWebviewEscapePanel } from '../components/SocialWebviewEscapePanel.js';
import type {
  ConnectScreenActions,
  ConnectScreenState,
} from '../components/WalletConnectionUtils.js';
import type { ConnectScreenViewModel } from '../view-models/WalletConnectionViewModel.js';

type Props = {
  viewModel: ConnectScreenViewModel;
  actions: ConnectScreenActions;
};

const features = [
  { title: 'Read-only by default', description: 'We only request signatures when you approve an exit.' },
  { title: 'Debounced breach logic', description: 'Requires sustained breach before acting, not single wicks.' },
  { title: 'Action history', description: 'Every exit is logged with transaction details.' },
];

function HeroAnimation() {
  const pulseAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);
  const scale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 3.3] });
  const opacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });
  return (
    <View style={styles.heroContainer}>
      <View style={[styles.ring, styles.ringOuter]} />
      <View style={[styles.ring, styles.ringMiddle]} />
      <View style={[styles.ring, styles.ringInner]} />
      <View style={styles.centerDot} />
      <Animated.View style={[styles.pulseRing, { transform: [{ scale }], opacity }]} />
    </View>
  );
}

function FeatureRow({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureIcon}>
        <Icon name="check" size={16} color={colors.safe} />
      </View>
      <View style={styles.featureText}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
      </View>
    </View>
  );
}

function NativeWalletButton({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Connect Mobile Wallet"
      style={styles.primaryButton}
    >
      <Text style={styles.primaryButtonLabel}>Connect Mobile Wallet</Text>
      <Text style={styles.primaryButtonDetail}>Sign transactions with your mobile wallet app.</Text>
    </TouchableOpacity>
  );
}

function DefaultBrowserButton({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Connect Browser Wallet"
      style={styles.primaryButton}
    >
      <Text style={styles.primaryButtonLabel}>Connect Browser Wallet</Text>
      <Text style={styles.primaryButtonDetail}>Sign transactions with your browser wallet extension.</Text>
    </TouchableOpacity>
  );
}

function DiscoveringRow() {
  return (
    <View style={styles.discoveringRow}>
      <ActivityIndicator size="small" color={colors.textFaint} />
      <Text style={styles.discoveringText}>Detecting browser wallets...</Text>
    </View>
  );
}

function StateBody({ state, isConnecting, actions }: {
  state: ConnectScreenState;
  isConnecting: boolean;
  actions: ConnectScreenActions;
}) {
  switch (state.kind) {
    case 'loading-capabilities':
      return <ActivityIndicator role="progressbar" color={colors.safe} />;
    case 'social-webview':
      return (
        <SocialWebviewEscapePanel
          socialEscapeAttempted={state.socialEscapeAttempted}
          onOpenInExternalBrowser={actions.onOpenInExternalBrowser}
          onOpenInPhantom={actions.onOpenInPhantom}
          onOpenInSolflare={actions.onOpenInSolflare}
        />
      );
    case 'discovering':
      return (
        <View style={styles.body}>
          {state.nativeAvailable ? <NativeWalletButton disabled={isConnecting} onPress={actions.onSelectNativeWallet} /> : null}
          <DiscoveringRow />
        </View>
      );
    case 'ready':
      return (
        <View style={styles.body}>
          {state.nativeAvailable ? <NativeWalletButton disabled={isConnecting} onPress={actions.onSelectNativeWallet} /> : null}
          {state.browserWallets.length > 0 ? (
            <ConnectWalletPicker
              wallets={state.browserWallets}
              disabled={isConnecting}
              onSelect={actions.onSelectBrowserWallet}
            />
          ) : null}
        </View>
      );
    case 'timed-out-discovery':
      return (
        <View style={styles.body}>
          {state.nativeAvailable ? <NativeWalletButton disabled={isConnecting} onPress={actions.onSelectNativeWallet} /> : null}
          <DefaultBrowserButton disabled={isConnecting} onPress={actions.onConnectDefaultBrowser} />
        </View>
      );
    case 'wallet-fallback':
      return (
        <View style={styles.body}>
          {state.nativeAvailable ? <NativeWalletButton disabled={isConnecting} onPress={actions.onSelectNativeWallet} /> : null}
          <ConnectFallbackPanel
            showNoWalletWarning={!state.nativeAvailable}
            onOpenInPhantom={actions.onOpenInPhantom}
            onOpenInSolflare={actions.onOpenInSolflare}
          />
        </View>
      );
    case 'desktop-no-wallet':
      return (
        <View style={styles.warning}>
          <Text style={styles.warningTitle}>No wallet extension detected.</Text>
          <Text style={styles.warningDetail}>
            Install a Solana wallet extension like Phantom or Solflare, then refresh this page.
          </Text>
        </View>
      );
  }
}

export function WalletConnectScreen({ viewModel, actions }: Props): JSX.Element {
  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        <TouchableOpacity onPress={actions.onGoBack} accessibilityLabel="Back" style={styles.backButton}>
          <Icon name="chevronLeft" size={20} color={colors.textBody} />
        </TouchableOpacity>

        <HeroAnimation />

        <Text style={styles.title}>Protect your Orca positions</Text>
        <Text style={styles.subtitle}>
          We monitor your concentrated liquidity range and prepare a safe one-click exit the moment price breaches it.
        </Text>

        {viewModel.outcome ? (
          <View style={[styles.outcomeBanner, outcomeBorderStyle(viewModel.outcome.severity)]}>
            <Text style={[styles.outcomeTitle, outcomeTitleStyle(viewModel.outcome.severity)]}>
              {viewModel.outcome.title}
            </Text>
            {viewModel.outcome.detail ? (
              <Text style={styles.outcomeDetail}>{viewModel.outcome.detail}</Text>
            ) : null}
            <TouchableOpacity onPress={actions.onDismissOutcome} accessibilityLabel="Dismiss outcome" style={styles.dismiss}>
              <Icon name="x" size={14} color={colors.textFaint} />
            </TouchableOpacity>
          </View>
        ) : null}

        <StateBody state={viewModel.state} isConnecting={viewModel.isConnecting} actions={actions} />

        {viewModel.isConnecting ? (
          <View style={styles.connectingContainer}>
            <ActivityIndicator size="large" color={colors.safe} />
            <Text style={styles.connectingText}>Connecting...</Text>
          </View>
        ) : null}

        <View style={styles.featuresContainer}>
          {features.map((f) => (
            <FeatureRow key={f.title} title={f.title} description={f.description} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function outcomeBorderStyle(severity: 'success' | 'error' | 'info' | 'warning') {
  return {
    borderColor:
      severity === 'error' ? colors.breachAccent
      : severity === 'warning' ? colors.warn
      : severity === 'success' ? colors.safe
      : colors.border,
  };
}
function outcomeTitleStyle(severity: 'success' | 'error' | 'info' | 'warning') {
  return {
    color:
      severity === 'error' ? colors.breachAccent
      : severity === 'warning' ? colors.warn
      : severity === 'success' ? colors.safe
      : colors.textPrimary,
  };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.appBackground },
  scrollView: { flex: 1 },
  contentContainer: { paddingVertical: 40, paddingHorizontal: 20, alignItems: 'center' },
  backButton: { position: 'absolute', top: 16, left: 16, padding: 8, zIndex: 10 },
  heroContainer: { width: 120, height: 120, marginTop: 20, marginBottom: 24, justifyContent: 'center', alignItems: 'center' },
  ring: { position: 'absolute', borderRadius: 999, borderWidth: 1 },
  ringOuter: { width: 116, height: 116, borderColor: 'rgba(255,255,255,0.06)' },
  ringMiddle: { width: 88, height: 88, borderColor: 'rgba(255,255,255,0.10)' },
  ringInner: { width: 60, height: 60, borderColor: colors.safe, borderStyle: 'dashed', borderWidth: 1 },
  centerDot: { width: 12, height: 12, borderRadius: 999, backgroundColor: colors.textPrimary },
  pulseRing: { position: 'absolute', width: 12, height: 12, borderRadius: 999, backgroundColor: colors.textPrimary },
  title: { color: colors.textPrimary, fontSize: typography.fontSize.display, fontWeight: typography.fontWeight.semibold, letterSpacing: -0.02 * 22, marginBottom: 8, textAlign: 'center' },
  subtitle: { color: colors.textBody, fontSize: typography.fontSize.body, lineHeight: typography.fontSize.body * typography.lineHeight.normal, textAlign: 'center', maxWidth: 300, marginBottom: 28 },
  outcomeBanner: { width: '100%', maxWidth: 320, padding: 12, paddingRight: 32, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, marginBottom: 16, position: 'relative' },
  outcomeTitle: { fontSize: typography.fontSize.body, fontWeight: typography.fontWeight.semibold },
  outcomeDetail: { color: colors.textBody, fontSize: typography.fontSize.caption, marginTop: 4 },
  dismiss: { position: 'absolute', top: 8, right: 8, padding: 6 },
  body: { width: '100%', maxWidth: 320, marginTop: 24 },
  primaryButton: { padding: 16, backgroundColor: colors.card, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  primaryButtonLabel: { color: colors.textPrimary, fontSize: typography.fontSize.body, fontWeight: typography.fontWeight.semibold },
  primaryButtonDetail: { color: colors.textBody, fontSize: typography.fontSize.caption, marginTop: 4 },
  discoveringRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: colors.card, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  discoveringText: { color: colors.textFaint, fontSize: typography.fontSize.caption },
  warning: { width: '100%', maxWidth: 320, padding: 12, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.warn, marginTop: 24 },
  warningTitle: { color: colors.warn, fontSize: typography.fontSize.body, fontWeight: typography.fontWeight.semibold },
  warningDetail: { color: colors.textBody, fontSize: typography.fontSize.caption, marginTop: 4 },
  connectingContainer: { marginTop: 32, alignItems: 'center' },
  connectingText: { color: colors.textBody, marginTop: 12, fontSize: typography.fontSize.body },
  featuresContainer: { width: '100%', maxWidth: 320, marginTop: 28, gap: 10 },
  featureRow: { flexDirection: 'row', gap: 12, paddingVertical: 10, paddingHorizontal: 2 },
  featureIcon: { marginTop: 2 },
  featureText: { flex: 1 },
  featureTitle: { fontSize: 13, fontWeight: typography.fontWeight.semibold, color: colors.textPrimary },
  featureDescription: { fontSize: 12, color: colors.textFaint },
});
```

If `colors.x` ("the dismiss icon `Icon` name") doesn't exist, check `packages/ui/src/components/Icon.tsx` for available icons. If `'x'` is not registered, omit the dismiss icon and label the dismiss `TouchableOpacity` with text instead. Adjust the `Icon name="x"` call accordingly.

- [ ] **Step 4: Run screen tests**

Run: `pnpm --filter @clmm/ui test -- WalletConnectScreen`
Expected: all tests pass.

- [ ] **Step 5: Rewrite `apps/app/app/connect.tsx`**

Replace `apps/app/app/connect.tsx` entirely:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Linking } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useStore } from 'zustand';
import {
  WalletConnectScreen,
  buildConnectScreenViewModel,
  type ConnectScreenActions,
  type WalletPickerOption,
} from '@clmm/ui';
import type { PlatformCapabilityState } from '@clmm/application/public';
import { platformCapabilityAdapter, walletPlatform } from '../src/composition/index';
import { useBrowserWalletConnect } from '../src/platform/browserWallet/index';
import { useDiscoveryState } from '../src/platform/browserWallet/useDiscoveryState';
import {
  buildPhantomBrowseUrl,
  buildSolflareBrowseUrl,
  openInExternalBrowser,
} from '../src/platform/browserWallet/walletDeepLinks';
import { detectFallbackState } from '../src/platform/detectFallbackState';
import { mapWalletErrorToOutcome } from '../src/platform/walletConnection';
import { navigateRoute } from '../src/platform/webNavigation';
import { parseReturnTo } from '../src/wallet-boot/parseReturnTo';
import { walletSessionStore } from '../src/state/walletSessionStore';
import { enrollWalletForMonitoring } from '../src/api/wallets';

const FALLBACK_PLATFORM_CAPABILITIES: PlatformCapabilityState = {
  nativePushAvailable: false,
  browserNotificationAvailable: false,
  nativeWalletAvailable: false,
  browserWalletAvailable: false,
  isMobileWeb: false,
};

export default function ConnectRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const returnTo = useMemo(() => parseReturnTo(params.returnTo), [params.returnTo]);

  const platformCapabilities = useStore(walletSessionStore, (s) => s.platformCapabilities);
  const connectionOutcome = useStore(walletSessionStore, (s) => s.connectionOutcome);
  const isConnecting = useStore(walletSessionStore, (s) => s.isConnecting);
  const setPlatformCapabilities = useStore(walletSessionStore, (s) => s.setPlatformCapabilities);
  const beginConnection = useStore(walletSessionStore, (s) => s.beginConnection);
  const markConnected = useStore(walletSessionStore, (s) => s.markConnected);
  const markOutcome = useStore(walletSessionStore, (s) => s.markOutcome);
  const clearOutcome = useStore(walletSessionStore, (s) => s.clearOutcome);

  const browserConnect = useBrowserWalletConnect();
  const discoveryState = useDiscoveryState(browserConnect.wallets.length);
  const [socialEscapeAttempted, setSocialEscapeAttempted] = useState(false);

  useEffect(() => {
    let active = true;
    void platformCapabilityAdapter
      .getCapabilities()
      .then((c) => { if (active) setPlatformCapabilities(c); })
      .catch(() => { if (active) setPlatformCapabilities(FALLBACK_PLATFORM_CAPABILITIES); });
    return () => { active = false; };
  }, [setPlatformCapabilities]);

  const fallbackState = useMemo(
    () => detectFallbackState(platformCapabilities, browserConnect.error),
    [platformCapabilities, browserConnect.error],
  );

  const browserWallets: WalletPickerOption[] = useMemo(
    () => browserConnect.wallets.map((w) => ({ id: w.id, name: w.name, iconUri: w.icon || null })),
    [browserConnect.wallets],
  );

  const viewModel = buildConnectScreenViewModel({
    capabilities: platformCapabilities,
    fallbackState,
    discoveryState,
    browserWallets,
    connectionOutcome,
    isConnecting,
    socialEscapeAttempted,
  });

  function handleConnectionError(error: unknown) {
    const outcome = mapWalletErrorToOutcome(error);
    if (outcome.kind === 'connected') {
      markOutcome({ kind: 'failed', reason: 'Unexpected connected error outcome' });
      return;
    }
    markOutcome(outcome);
  }

  function onConnectSuccess(walletAddress: string, kind: 'native' | 'browser') {
    markConnected({ walletAddress, connectionKind: kind });
    enrollWalletForMonitoring(walletAddress).catch((e) => console.warn('Wallet enrollment failed:', e));
    navigateRoute({ router, path: returnTo, method: 'replace' });
  }

  const actions: ConnectScreenActions = {
    onSelectNativeWallet: async () => {
      beginConnection();
      try { onConnectSuccess(await walletPlatform.connectNativeWallet(), 'native'); }
      catch (e) { handleConnectionError(e); }
    },
    onSelectBrowserWallet: async (id) => {
      beginConnection();
      try { const { address } = await browserConnect.connect(id); onConnectSuccess(address, 'browser'); }
      catch (e) { handleConnectionError(e); }
    },
    onConnectDefaultBrowser: async () => {
      beginConnection();
      try { const { address } = await browserConnect.connect(); onConnectSuccess(address, 'browser'); }
      catch (e) { handleConnectionError(e); }
    },
    onOpenInExternalBrowser: () => {
      setSocialEscapeAttempted(true);
      openInExternalBrowser(window.location.href);
    },
    onOpenInPhantom: () => void Linking.openURL(buildPhantomBrowseUrl(window.location.href)),
    onOpenInSolflare: () => void Linking.openURL(buildSolflareBrowseUrl(window.location.href)),
    onGoBack: () => { clearOutcome(); router.back(); },
    onDismissOutcome: clearOutcome,
  };

  return <WalletConnectScreen viewModel={viewModel} actions={actions} />;
}
```

- [ ] **Step 6: Run workspace typecheck**

Run: `pnpm typecheck`
Expected: passes across all packages.

- [ ] **Step 7: Run all UI and app tests**

Run: `pnpm --filter @clmm/ui test && pnpm --filter @clmm/app test`
Expected: all tests pass. (`apps/app` has tests beyond the new ones — `useBrowserWalletConnect.test.ts`, `walletConnection.test.ts`, etc. Make sure none regressed because of the route file changes. Note: the route file itself has no test today and we are not adding one — its imports are exercised by helper unit tests.)

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/screens/WalletConnectScreen.tsx \
        packages/ui/src/screens/WalletConnectScreen.test.tsx \
        apps/app/app/connect.tsx
git commit -m "refactor(ui,app): drive connect screen from ConnectScreenState"
```

---

## Phase D — Validation

### Task 10: Run full repo validation

- [ ] **Step 1: Boundaries**

Run: `pnpm boundaries`
Expected: passes — no `apps/app` → `packages/ui` violations, no new disallowed imports in `packages/ui`.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: passes.

- [ ] **Step 3: Typecheck (workspace)**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 4: Test (workspace)**

Run: `pnpm test`
Expected: all packages pass.

- [ ] **Step 5: Build (workspace)**

Run: `pnpm build`
Expected: passes.

- [ ] **Step 6: Manual smoke test on web (recommended)**

Start the dev server (`pnpm --filter @clmm/app dev:web`) and exercise:
- Cold load the connect route → loading spinner → discovery → either picker rows or fallback panel.
- Click "Connect Browser Wallet" with an extension installed → success → return to `returnTo`.
- Trigger a connect error (e.g. reject in extension) → outcome banner appears with reason → click another wallet → banner clears.
- Open in a social-app simulator (e.g. spoof UA) → social-webview panel renders.
- Verify "Connecting..." shows during in-flight connect.

If the dev environment isn't accessible, note that explicitly in the PR description rather than claiming success.

- [ ] **Step 7: Commit any final cleanup (if needed)**

If validation surfaced nothing, no commit is needed. Otherwise fix the cause and commit with a clear message.

---

## Done

The route is now a thin shell. `packages/ui` owns every visual case behind a discriminated state. `pnpm boundaries` enforces that the layering doesn't regress.

**Out of scope (deferred per spec):**
- Disconnect-error inline banners in `WalletSettingsScreen` (issue #37 fourth bullet, separate follow-up).
- New application-layer port for fallback detection.
- Visual redesign of hero/features.

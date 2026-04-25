# Positions List Screen Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `PositionsListScreen` with card-based layout, new `Chip`, `SectionHeader`, and `PositionCard` components using the dark financial-terminal design system.

**Architecture:** Create 3 new reusable components (`Chip`, `SectionHeader`, `PositionCard`) alongside the screen rewrite. All components use the existing design system tokens. No DTO or API changes.

**Tech Stack:** React Native, Expo, `@expo/vector-icons` (Feather), Vitest, `@testing-library/react`

---

## File Map

| File | Responsibility |
|------|----------------|
| `packages/ui/src/components/Chip.tsx` | **New** — pill status badge with tone variants |
| `packages/ui/src/components/SectionHeader.tsx` | **New** — section title + meta text |
| `packages/ui/src/components/PositionCard.tsx` | **New** — position card with chip, monitoring indicator, pool id |
| `packages/ui/src/screens/PositionsListScreen.tsx` | **Replace** — full rewrite |
| `packages/ui/src/screens/PositionsListScreen.test.tsx` | **Update** — new selectors/assertions for card layout |
| `packages/ui/src/index.ts` | Export new components |

---

## Task 1: Create Chip component

**Files:**
- Create: `packages/ui/src/components/Chip.tsx`

- [ ] **Step 1: Write the component**

Create `packages/ui/src/components/Chip.tsx`:

```tsx
import { View, Text } from 'react-native';
import { colors } from '../design-system/index.js';

export type ChipTone = 'safe' | 'warn' | 'breach';

type Props = {
  tone: ChipTone;
  children: React.ReactNode;
};

const toneStyles: Record<ChipTone, { text: string; border: string; dot: string; glow?: string }> = {
  safe: {
    text: colors.safe,
    border: 'rgba(158,236,209,0.30)',
    dot: colors.safe,
    glow: '0 0 8px rgba(158,236,209,0.5)',
  },
  warn: {
    text: colors.warn,
    border: 'rgba(244,201,122,0.30)',
    dot: colors.warn,
  },
  breach: {
    text: colors.breachAccent,
    border: 'rgba(245,148,132,0.30)',
    dot: colors.breachAccent,
    glow: '0 0 10px rgba(245,148,132,0.5)',
  },
};

export function Chip({ tone, children }: Props): JSX.Element {
  const style = toneStyles[tone];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 24,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: style.border,
        alignSelf: 'flex-start',
      }}
    >
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          backgroundColor: style.dot,
          ...(style.glow ? { boxShadow: style.glow } : {}),
        }}
      />
      <Text
        style={{
          color: style.text,
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.02 * 11,
        }}
      >
        {children}
      </Text>
    </View>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd packages/ui && pnpm typecheck`

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/Chip.tsx
git commit -m "feat: add Chip status badge component"
```

---

## Task 2: Create SectionHeader component

**Files:**
- Create: `packages/ui/src/components/SectionHeader.tsx`

- [ ] **Step 1: Write the component**

Create `packages/ui/src/components/SectionHeader.tsx`:

```tsx
import { View, Text } from 'react-native';
import { colors } from '../design-system/index.js';

type Props = {
  title: string;
  meta?: string;
};

export function SectionHeader({ title, meta }: Props): JSX.Element {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        marginTop: 22,
        marginBottom: 10,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 0.08 * 11,
          color: colors.textTertiary,
          fontWeight: '600',
        }}
      >
        {title}
      </Text>
      {meta ? (
        <Text
          style={{
            fontSize: 11,
            color: colors.textFaint,
          }}
        >
          {meta}
        </Text>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd packages/ui && pnpm typecheck`

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/SectionHeader.tsx
git commit -m "feat: add SectionHeader component"
```

---

## Task 3: Create PositionCard component

**Files:**
- Create: `packages/ui/src/components/PositionCard.tsx`

- [ ] **Step 1: Write the component**

Create `packages/ui/src/components/PositionCard.tsx`:

```tsx
import { View, Text, TouchableOpacity } from 'react-native';
import { colors, typography } from '../design-system/index.js';
import { Chip } from './Chip.js';

type Props = {
  positionId: string;
  poolLabel: string;
  rangeStatusKind: 'in-range' | 'below-range' | 'above-range';
  hasAlert: boolean;
  monitoringLabel: string;
  onPress?: () => void;
};

function getChipProps(rangeStatusKind: string, hasAlert: boolean): { tone: 'safe' | 'warn' | 'breach'; label: string } {
  if (hasAlert) {
    return { tone: 'breach', label: 'Breach' };
  }
  if (rangeStatusKind === 'in-range') {
    return { tone: 'safe', label: 'In range' };
  }
  return { tone: 'warn', label: 'Near edge' };
}

function getMonitoringColor(status: string): string {
  if (status === 'Monitoring Active') return colors.safe;
  if (status === 'Monitoring Degraded') return colors.warn;
  return colors.textFaint;
}

function getMonitoringText(status: string): string {
  if (status === 'Monitoring Active') return 'Live';
  if (status === 'Monitoring Degraded') return 'Degraded';
  return 'Inactive';
}

export function PositionCard({
  poolLabel,
  rangeStatusKind,
  hasAlert,
  monitoringLabel,
  onPress,
}: Props): JSX.Element {
  const chip = getChipProps(rangeStatusKind, hasAlert);
  const monitoringColor = getMonitoringColor(monitoringLabel);
  const monitoringText = getMonitoringText(monitoringLabel);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        padding: 16,
        marginBottom: 10,
        marginHorizontal: 20,
      }}
    >
      {/* Row 1: chip + monitoring indicator */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Chip tone={chip.tone}>{chip.label}</Chip>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              backgroundColor: monitoringColor,
            }}
          />
          <Text
            style={{
              fontSize: 12,
              color: colors.textBody,
            }}
          >
            {monitoringText}
          </Text>
        </View>
      </View>

      {/* Row 2: pool id */}
      <Text
        style={{
          fontSize: typography.fontSize.body,
          fontWeight: typography.fontWeight.semibold,
          color: colors.textPrimary,
          letterSpacing: -0.01 * 14,
        }}
      >
        {poolLabel}
      </Text>

      {/* Row 3: monitoring label */}
      <Text
        style={{
          fontSize: typography.fontSize.caption,
          color: colors.textTertiary,
          marginTop: 4,
        }}
      >
        {monitoringLabel}
      </Text>

      {/* Alert dot */}
      {hasAlert ? (
        <View
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 8,
            height: 8,
            borderRadius: 999,
            backgroundColor: colors.breachAccent,
          }}
        />
      ) : null}
    </TouchableOpacity>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd packages/ui && pnpm typecheck`

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/PositionCard.tsx
git commit -m "feat: add PositionCard component"
```

---

## Task 4: Rewrite PositionsListScreen

**Files:**
- Modify: `packages/ui/src/screens/PositionsListScreen.tsx`

- [ ] **Step 1: Replace the file**

Replace `packages/ui/src/screens/PositionsListScreen.tsx` with:

```tsx
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import type { PositionSummaryDto } from '@clmm/application/public';
import { colors, typography } from '../design-system/index.js';
import { buildPositionListViewModel } from '../view-models/PositionListViewModel.js';
import { DegradedCapabilityBanner } from '../components/DegradedCapabilityBanner.js';
import { ConnectWalletEntry } from '../components/ConnectWalletEntry.js';
import { SectionHeader } from '../components/SectionHeader.js';
import { PositionCard } from '../components/PositionCard.js';
import type { PlatformCapabilities } from '../components/DegradedCapabilityBannerUtils.js';

type Props = {
  walletAddress?: string | null;
  positions?: PositionSummaryDto[] | undefined;
  positionsLoading?: boolean;
  positionsError?: string | null;
  onSelectPosition?: (positionId: string) => void;
  onConnectWallet?: () => void;
  platformCapabilities?: PlatformCapabilities | null;
};

export function PositionsListScreen({
  walletAddress,
  positions,
  positionsLoading,
  positionsError,
  onSelectPosition,
  onConnectWallet,
  platformCapabilities,
}: Props): JSX.Element {
  const isConnected = walletAddress != null && walletAddress.length > 0;
  const hasPositions = (positions?.length ?? 0) > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBackground }}>
      <ScrollView>
        <DegradedCapabilityBanner capabilities={platformCapabilities} />

        {!isConnected ? (
          <ConnectWalletEntry {...(onConnectWallet != null ? { onConnectWallet } : {})} />
        ) : positionsLoading ? (
          <LoadingState />
        ) : positionsError && !hasPositions ? (
          <ErrorState error={positionsError} />
        ) : hasPositions ? (
          <ConnectedPositionsList
            positions={positions ?? []}
            onSelectPosition={onSelectPosition}
          />
        ) : (
          <EmptyState />
        )}
      </ScrollView>
    </View>
  );
}

function LoadingState() {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
      <ActivityIndicator color={colors.safe} />
      <Text
        style={{
          color: colors.textPrimary,
          fontSize: typography.fontSize.body,
          fontWeight: typography.fontWeight.semibold,
          textAlign: 'center',
          marginTop: 16,
        }}
      >
        Loading supported Orca positions
      </Text>
      <Text
        style={{
          color: colors.textBody,
          fontSize: typography.fontSize.caption,
          textAlign: 'center',
          marginTop: 8,
        }}
      >
        Checking this wallet for supported concentrated liquidity positions.
      </Text>
    </View>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
      <Text
        style={{
          color: colors.textPrimary,
          fontSize: typography.fontSize.body,
          fontWeight: typography.fontWeight.semibold,
          textAlign: 'center',
        }}
      >
        Could not load supported positions
      </Text>
      <Text
        style={{
          color: colors.textBody,
          fontSize: typography.fontSize.caption,
          textAlign: 'center',
          marginTop: 8,
        }}
      >
        {error}
      </Text>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
      <Text
        style={{
          color: colors.textPrimary,
          fontSize: typography.fontSize.body,
          fontWeight: typography.fontWeight.semibold,
          textAlign: 'center',
        }}
      >
        No supported positions
      </Text>
      <Text
        style={{
          color: colors.textBody,
          fontSize: typography.fontSize.caption,
          textAlign: 'center',
          marginTop: 8,
        }}
      >
        Connect a wallet with Orca CLMM positions to see them here.
      </Text>
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

  return (
    <>
      <SectionHeader
        title="Active positions"
        meta={`${positions.length} monitored`}
      />
      {viewModel.items.map((item) => (
        <PositionCard
          key={item.positionId}
          positionId={item.positionId}
          poolLabel={item.poolLabel}
          rangeStatusKind={item.rangeStatusKind}
          hasAlert={item.hasAlert}
          monitoringLabel={item.monitoringLabel}
          onPress={() => onSelectPosition?.(item.positionId)}
        />
      ))}
    </>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd packages/ui && pnpm typecheck`

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/screens/PositionsListScreen.tsx
git commit -m "feat: redesign PositionsListScreen with card layout"
```

---

## Task 5: Update PositionsListScreen tests

**Files:**
- Modify: `packages/ui/src/screens/PositionsListScreen.test.tsx`

- [ ] **Step 1: Replace the test file**

Replace `packages/ui/src/screens/PositionsListScreen.test.tsx` with:

```tsx
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PositionSummaryDto } from '@clmm/application/public';
import { PositionsListScreen } from './PositionsListScreen.js';

afterEach(() => {
  cleanup();
});

function brand<T>(value: string): T {
  return value as T;
}

function makePosition(overrides: Partial<PositionSummaryDto> = {}): PositionSummaryDto {
  return {
    positionId: brand<PositionSummaryDto['positionId']>('position-1'),
    poolId: brand<PositionSummaryDto['poolId']>('pool-1'),
    rangeState: 'in-range',
    hasActionableTrigger: false,
    monitoringStatus: 'active',
    ...overrides,
  };
}

describe('PositionsListScreen', () => {
  it('renders connect-wallet entry when disconnected', () => {
    render(<PositionsListScreen walletAddress={null} />);

    expect(screen.getByText('Connect your wallet to get started')).toBeTruthy();
    expect(screen.getByText('Connect Wallet')).toBeTruthy();
  });

  it('renders loading state for connected wallets while positions are fetching', () => {
    render(<PositionsListScreen walletAddress="wallet-1" positionsLoading />);

    expect(screen.getByText('Loading supported Orca positions')).toBeTruthy();
  });

  it('renders error state when loading fails before any positions are available', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positionsError="Could not load supported positions for this wallet."
      />,
    );

    expect(screen.getByText('Could not load supported positions')).toBeTruthy();
    expect(screen.getByText('Could not load supported positions for this wallet.')).toBeTruthy();
  });

  it('keeps rendering the positions list when a background refetch fails after positions load', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition()]}
        positionsError="Could not load supported positions for this wallet."
      />,
    );

    expect(screen.getByText('Pool pool-1')).toBeTruthy();
    expect(screen.queryByText('Could not load supported positions')).toBeNull();
  });

  it('renders the empty state when connected without positions and without an error', () => {
    render(<PositionsListScreen walletAddress="wallet-1" positions={[]} />);

    expect(screen.getByText('No supported positions')).toBeTruthy();
    expect(
      screen.getByText(
        'Connect a wallet with Orca CLMM positions to see them here.',
      ),
    ).toBeTruthy();
  });

  it('renders position cards with correct status chip', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[
          makePosition({ rangeState: 'in-range' }),
          makePosition({ positionId: brand('position-2'), rangeState: 'below-range' }),
          makePosition({ positionId: brand('position-3'), rangeState: 'above-range', hasActionableTrigger: true }),
        ]}
      />,
    );

    expect(screen.getByText('In range')).toBeTruthy();
    expect(screen.getByText('Near edge')).toBeTruthy();
    expect(screen.getByText('Breach')).toBeTruthy();
  });

  it('renders section header with position count', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition(), makePosition({ positionId: brand('position-2') })]}
      />,
    );

    expect(screen.getByText('Active positions')).toBeTruthy();
    expect(screen.getByText('2 monitored')).toBeTruthy();
  });

  it('calls onSelectPosition with the position id when a card is tapped', () => {
    const onSelectPosition = vi.fn();

    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition({ positionId: brand<PositionSummaryDto['positionId']>('pos-tap-test'), poolId: brand<PositionSummaryDto['poolId']>('pool-tap-test') })]}
        onSelectPosition={onSelectPosition}
      />,
    );

    fireEvent.click(screen.getByText('Pool pool-tap-test'));
    expect(onSelectPosition).toHaveBeenCalledWith('pos-tap-test');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd packages/ui && pnpm test -- PositionsListScreen.test.tsx`

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/screens/PositionsListScreen.test.tsx
git commit -m "test: update PositionsListScreen tests for card layout"
```

---

## Task 6: Export new components from index.ts

**Files:**
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Add exports**

Add to `packages/ui/src/index.ts` in the Components section:

```ts
export { Chip } from './components/Chip.js';
export type { ChipTone } from './components/Chip.js';
export { SectionHeader } from './components/SectionHeader.js';
export { PositionCard } from './components/PositionCard.js';
```

- [ ] **Step 2: Run typecheck and build**

Run: `cd packages/ui && pnpm typecheck && pnpm build`

Expected: No errors.

- [ ] **Step 3: Run all UI tests**

Run: `cd packages/ui && pnpm test`

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/index.ts
git commit -m "chore: export Chip, SectionHeader, and PositionCard"
```

---

## Task 7: Verify full repo builds

**Files:**
- None (verification only)

- [ ] **Step 1: Run full repo checks**

Run from root:
```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
```

Expected: All pass.

- [ ] **Step 2: Commit**

```bash
git commit --allow-empty -m "feat: positions list redesign complete"
```

---

## Self-Review Checklist

### Spec Coverage

| Spec Section | Task |
|-------------|------|
| Chip component | Task 1 |
| SectionHeader component | Task 2 |
| PositionCard component | Task 3 |
| PositionsListScreen rewrite | Task 4 |
| PositionsListScreen tests | Task 5 |
| Export new components | Task 6 |
| Verification | Task 7 |

### Placeholder Scan

- [x] No TBDs, TODOs, or incomplete sections
- [x] No "add appropriate error handling" vagueness
- [x] No "similar to Task N" shortcuts
- [x] All code steps contain complete code
- [x] All test steps contain complete test code

### Type Consistency

- [x] `ChipTone` type used consistently in `Chip.tsx` and `index.ts`
- [x] `PositionCard` props match `PositionListItemViewModel` fields
- [x] `SectionHeader` props match spec
- [x] `PositionsListScreen` props unchanged from original

---

## Plan Complete

**Saved to:** `docs/superpowers/plans/2026-04-24-positions-list-redesign.md`

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

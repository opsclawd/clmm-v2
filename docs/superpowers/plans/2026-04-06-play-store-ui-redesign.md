# Play Store UI Redesign — Calm Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate every screen in `packages/ui` to the "Calm Command" visual direction — deep slate backgrounds, layered surfaces, semantic state colors, stronger type hierarchy — without changing any business logic or screen structure.

**Architecture:** All changes live inside `packages/ui`. The design system tokens (`colors.ts`, `typography.ts`) get expanded first, then a new `spacing.ts` module is added. Every screen and component is updated to consume the new tokens. No new screens, no new view-models, no new props — only visual refinement of existing surfaces.

**Tech Stack:** React Native, TypeScript, Vitest (jsdom). Tests cover pure-logic utils only (no component rendering tests in this codebase).

**Spec:** `docs/superpowers/specs/2026-04-06-play-store-ui-design.md`

---

## File Structure

### New files
- `packages/ui/src/design-system/spacing.ts` — spacing scale, corner radii, elevation styles
- `packages/ui/src/design-system/spacing.test.ts` — tests for spacing helpers

### Modified files
- `packages/ui/src/design-system/colors.ts` — expanded semantic palette
- `packages/ui/src/design-system/colors.test.ts` — new; validate token completeness
- `packages/ui/src/design-system/typography.ts` — type scale presets
- `packages/ui/src/design-system/index.ts` — re-export spacing
- `packages/ui/src/components/RangeStatusBadge.tsx` — updated badge styling
- `packages/ui/src/components/RangeStatusBadgeUtils.ts` — new color keys
- `packages/ui/src/components/RangeStatusBadge.test.ts` — updated for new keys
- `packages/ui/src/components/DirectionalPolicyCard.tsx` — layered card styling
- `packages/ui/src/components/ExecutionStateCard.tsx` — elevated card styling
- `packages/ui/src/components/PreviewStepSequence.tsx` — step styling refresh
- `packages/ui/src/components/ConnectWalletEntry.tsx` — premium empty state
- `packages/ui/src/components/DegradedCapabilityBanner.tsx` — token-based warning colors
- `packages/ui/src/components/DesktopShell.tsx` — updated shell colors
- `packages/ui/src/components/OffChainHistoryLabel.tsx` — consistent chip styling
- `packages/ui/src/components/HistoryEventRow.tsx` — list item refresh
- `packages/ui/src/screens/PositionsListScreen.tsx` — dashboard hierarchy
- `packages/ui/src/screens/PositionDetailScreen.tsx` — range/breach prominence
- `packages/ui/src/screens/ExecutionPreviewScreen.tsx` — trust screen polish
- `packages/ui/src/screens/SigningStatusScreen.tsx` — calm signing states
- `packages/ui/src/screens/ExecutionResultScreen.tsx` — result state clarity
- `packages/ui/src/screens/HistoryListScreen.tsx` — quieter utility screen
- `packages/ui/src/screens/HistoryDetailScreen.tsx` — consistent with list
- `packages/ui/src/screens/AlertsListScreen.tsx` — semantic alert cards
- `packages/ui/src/screens/WalletSettingsScreen.tsx` — settings polish
- `packages/ui/src/screens/WalletConnectScreen.tsx` — onboarding polish
- `packages/ui/src/index.ts` — re-export new spacing module

---

## Task 1: Expand Color Tokens

The current palette uses pure black background and a single flat surface color. This task replaces it with the Calm Command palette: deep slate background, layered surfaces, and expanded semantic colors.

**Files:**
- Modify: `packages/ui/src/design-system/colors.ts`
- Create: `packages/ui/src/design-system/colors.test.ts`

- [ ] **Step 1: Write the failing test for expanded color tokens**

```ts
// packages/ui/src/design-system/colors.test.ts
import { describe, it, expect } from 'vitest';
import { colors } from './colors.js';

describe('colors', () => {
  it('has deep slate background instead of pure black', () => {
    expect(colors.background).not.toBe('#000000');
    expect(colors.background).toBe('#0f1219');
  });

  it('has layered surface tokens', () => {
    expect(colors.surface).toBeDefined();
    expect(colors.surfaceElevated).toBeDefined();
    expect(colors.surfaceRecessed).toBeDefined();
  });

  it('has semantic state colors', () => {
    expect(colors.success).toBeDefined();
    expect(colors.pending).toBeDefined();
    expect(colors.terminal).toBeDefined();
  });

  it('has all required color keys', () => {
    const requiredKeys = [
      'background', 'surface', 'surfaceElevated', 'surfaceRecessed',
      'primary', 'warning', 'danger', 'breach',
      'success', 'pending', 'terminal',
      'text', 'textSecondary', 'textMuted',
      'border', 'borderSubtle',
      'downsideArrow', 'upsideArrow',
    ];
    for (const key of requiredKeys) {
      expect(colors).toHaveProperty(key);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/ui && npx vitest run src/design-system/colors.test.ts`
Expected: FAIL — `colors.background` is still `#000000`, missing `surfaceElevated`, etc.

- [ ] **Step 3: Implement expanded color tokens**

Replace the contents of `packages/ui/src/design-system/colors.ts`:

```ts
export const colors = {
  // Backgrounds — deep slate, not pure black
  background: '#0f1219',
  surface: '#1a1f2b',
  surfaceElevated: '#232a38',
  surfaceRecessed: '#141820',

  // Primary action — emerald green
  primary: '#34d399',

  // Semantic states
  warning: '#fbbf24',
  danger: '#ef4444',
  breach: '#fb923c',
  success: '#34d399',
  pending: '#60a5fa',
  terminal: '#94a3b8',

  // Text
  text: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',

  // Borders
  border: '#2a3241',
  borderSubtle: '#1e2534',

  // Directional arrows
  downsideArrow: '#60a5fa',
  upsideArrow: '#a78bfa',
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/ui && npx vitest run src/design-system/colors.test.ts`
Expected: PASS

- [ ] **Step 5: Update RangeStatusBadgeUtils for new color keys**

The `RangeStatusBadgeUtils.ts` references `colorKey: keyof typeof colors`. Since `primary` still exists, the badge mapping still works. But verify existing tests still pass:

Run: `cd packages/ui && npx vitest run src/components/RangeStatusBadge.test.ts`
Expected: PASS (the keys `primary` and `breach` still exist)

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/design-system/colors.ts packages/ui/src/design-system/colors.test.ts
git commit -m "feat(ui): expand color tokens to Calm Command palette

Replace pure-black background with deep slate. Add layered surface
tokens, semantic state colors, and text hierarchy colors."
```

---

## Task 2: Add Spacing and Elevation Tokens

The codebase has no spacing system — all values are hardcoded (8, 12, 16, etc.) with inconsistent corner radii. This task adds a spacing scale, standardized radii, and elevation presets.

**Files:**
- Create: `packages/ui/src/design-system/spacing.ts`
- Create: `packages/ui/src/design-system/spacing.test.ts`
- Modify: `packages/ui/src/design-system/index.ts`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/ui/src/design-system/spacing.test.ts
import { describe, it, expect } from 'vitest';
import { spacing, radii, cardStyles } from './spacing.js';

describe('spacing', () => {
  it('provides a spacing scale', () => {
    expect(spacing.xs).toBe(4);
    expect(spacing.sm).toBe(8);
    expect(spacing.md).toBe(12);
    expect(spacing.lg).toBe(16);
    expect(spacing.xl).toBe(24);
    expect(spacing['2xl']).toBe(32);
    expect(spacing['3xl']).toBe(48);
  });

  it('provides standardized radii', () => {
    expect(radii.sm).toBe(6);
    expect(radii.md).toBe(10);
    expect(radii.lg).toBe(14);
    expect(radii.full).toBe(9999);
  });
});

describe('cardStyles', () => {
  it('elevated card has surfaceElevated background', () => {
    expect(cardStyles.elevated.backgroundColor).toBe('#232a38');
  });

  it('base card has surface background', () => {
    expect(cardStyles.base.backgroundColor).toBe('#1a1f2b');
  });

  it('recessed card has surfaceRecessed background', () => {
    expect(cardStyles.recessed.backgroundColor).toBe('#141820');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/ui && npx vitest run src/design-system/spacing.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement spacing tokens**

```ts
// packages/ui/src/design-system/spacing.ts
import { colors } from './colors.js';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  full: 9999,
} as const;

export const cardStyles = {
  elevated: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  base: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  recessed: {
    backgroundColor: colors.surfaceRecessed,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/ui && npx vitest run src/design-system/spacing.test.ts`
Expected: PASS

- [ ] **Step 5: Update design-system index to re-export spacing**

Update `packages/ui/src/design-system/index.ts`:

```ts
export { colors } from './colors.js';
export { typography } from './typography.js';
export { spacing, radii, cardStyles } from './spacing.js';
```

- [ ] **Step 6: Update package index to re-export spacing**

Add to `packages/ui/src/index.ts`, in the "Design system" section:

```ts
export { spacing, radii, cardStyles } from './design-system/spacing.js';
```

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/design-system/spacing.ts packages/ui/src/design-system/spacing.test.ts packages/ui/src/design-system/index.ts packages/ui/src/index.ts
git commit -m "feat(ui): add spacing scale, radii, and card style presets"
```

---

## Task 3: Expand Typography Presets

Add named type scale presets (pageTitle, sectionLabel, body, helper) so screens use consistent hierarchy without repeating fontSize/fontWeight combos.

**Files:**
- Modify: `packages/ui/src/design-system/typography.ts`

- [ ] **Step 1: Add type scale presets to typography**

Append to the existing `typography` object in `packages/ui/src/design-system/typography.ts`:

```ts
export const typography = {
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
  },
  fontWeight: {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
  // Named presets for consistent screen hierarchy
  presets: {
    pageTitle: { fontSize: 24, fontWeight: '700' as const, lineHeight: 1.25 },
    sectionLabel: { fontSize: 14, fontWeight: '600' as const, lineHeight: 1.25, letterSpacing: 0.5 },
    body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 1.5 },
    bodyMedium: { fontSize: 16, fontWeight: '500' as const, lineHeight: 1.5 },
    helper: { fontSize: 12, fontWeight: '400' as const, lineHeight: 1.5 },
    caption: { fontSize: 14, fontWeight: '500' as const, lineHeight: 1.25 },
    cta: { fontSize: 16, fontWeight: '700' as const, lineHeight: 1.25 },
  },
} as const;
```

- [ ] **Step 2: Run all existing tests to verify nothing breaks**

Run: `cd packages/ui && npx vitest run`
Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/design-system/typography.ts
git commit -m "feat(ui): add named typography presets for screen hierarchy"
```

---

## Task 4: Refresh Core Components

Update the shared components that appear across multiple screens: `RangeStatusBadge`, `DirectionalPolicyCard`, `ExecutionStateCard`, `PreviewStepSequence`, `ConnectWalletEntry`, `DegradedCapabilityBanner`, `DesktopShell`, `OffChainHistoryLabel`, `HistoryEventRow`.

**Files:**
- Modify: `packages/ui/src/components/RangeStatusBadge.tsx`
- Modify: `packages/ui/src/components/DirectionalPolicyCard.tsx`
- Modify: `packages/ui/src/components/ExecutionStateCard.tsx`
- Modify: `packages/ui/src/components/PreviewStepSequence.tsx`
- Modify: `packages/ui/src/components/ConnectWalletEntry.tsx`
- Modify: `packages/ui/src/components/DegradedCapabilityBanner.tsx`
- Modify: `packages/ui/src/components/DesktopShell.tsx`
- Modify: `packages/ui/src/components/OffChainHistoryLabel.tsx`
- Modify: `packages/ui/src/components/HistoryEventRow.tsx`

- [ ] **Step 1: Update RangeStatusBadge**

Use standardized radii and spacing. The badge should feel like a compact semantic chip.

```tsx
// packages/ui/src/components/RangeStatusBadge.tsx
import { View, Text } from 'react-native';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import { radii, spacing } from '../design-system/index.js';
import { getRangeStatusBadgeProps, type RangeStateKind } from './RangeStatusBadgeUtils.js';

export { getRangeStatusBadgeProps } from './RangeStatusBadgeUtils.js';

export function RangeStatusBadge({ rangeStateKind }: { rangeStateKind: RangeStateKind }) {
  const { label, colorKey } = getRangeStatusBadgeProps(rangeStateKind);
  const badgeColor = colors[colorKey];

  return (
    <View style={{
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radii.sm,
      backgroundColor: `${badgeColor}18`,
      borderWidth: 1,
      borderColor: `${badgeColor}30`,
    }}>
      <Text style={{
        color: badgeColor,
        fontSize: typography.fontSize.sm,
        fontWeight: typography.fontWeight.semibold,
      }}>
        {label}
      </Text>
    </View>
  );
}
```

- [ ] **Step 2: Update DirectionalPolicyCard**

Elevated card with subtle border. Direction label should be more prominent.

```tsx
// packages/ui/src/components/DirectionalPolicyCard.tsx
import { View, Text } from 'react-native';
import type { BreachDirection } from '@clmm/application/public';
import { renderDirectionalPolicyText } from './DirectionalPolicyCardUtils.js';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import { cardStyles, spacing } from '../design-system/index.js';

type Props = {
  direction: BreachDirection;
};

export function DirectionalPolicyCard({ direction }: Props) {
  const policy = renderDirectionalPolicyText(direction);
  return (
    <View style={{
      ...cardStyles.elevated,
      padding: spacing.lg,
    }}>
      <Text style={{
        color: colors.text,
        fontSize: typography.fontSize.lg,
        fontWeight: typography.fontWeight.bold,
      }}>
        {policy.directionLabel}
      </Text>
      <Text style={{
        color: colors.textSecondary,
        fontSize: typography.fontSize.sm,
        marginTop: spacing.xs,
        lineHeight: typography.fontSize.sm * typography.lineHeight.normal,
      }}>
        {policy.policyReason}
      </Text>
      <Text style={{
        color: colors.primary,
        fontSize: typography.fontSize.base,
        fontWeight: typography.fontWeight.semibold,
        marginTop: spacing.md,
      }}>
        {policy.swapLabel} → {policy.postureLabel}
      </Text>
    </View>
  );
}
```

- [ ] **Step 3: Update ExecutionStateCard**

Elevated card with better title hierarchy and semantic state colors.

```tsx
// packages/ui/src/components/ExecutionStateCard.tsx
import { View, Text } from 'react-native';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import { cardStyles, spacing } from '../design-system/index.js';
import type { ExecutionStateViewModel } from '../view-models/ExecutionStateViewModel.js';

type Props = {
  viewModel: ExecutionStateViewModel;
};

export function ExecutionStateCard({ viewModel }: Props) {
  return (
    <View style={{
      ...cardStyles.elevated,
      padding: spacing.lg,
    }}>
      <Text style={{
        color: colors.text,
        fontSize: typography.fontSize.lg,
        fontWeight: typography.fontWeight.bold,
      }}>
        {viewModel.title}
      </Text>

      <Text style={{
        color: colors.textSecondary,
        fontSize: typography.fontSize.base,
        marginTop: spacing.xs,
        lineHeight: typography.fontSize.base * typography.lineHeight.normal,
      }}>
        {viewModel.subtitle}
      </Text>

      {viewModel.partialCompletionWarning ? (
        <View style={{
          marginTop: spacing.md,
          padding: spacing.sm,
          borderRadius: radii.sm,
          backgroundColor: `${colors.warning}18`,
          borderWidth: 1,
          borderColor: `${colors.warning}30`,
        }}>
          <Text style={{ color: colors.warning, fontSize: typography.fontSize.sm }}>
            {viewModel.partialCompletionWarning}
          </Text>
        </View>
      ) : null}

      {viewModel.nextAction ? (
        <Text style={{
          color: colors.primary,
          fontSize: typography.fontSize.base,
          fontWeight: typography.fontWeight.semibold,
          marginTop: spacing.md,
        }}>
          {viewModel.nextAction}
        </Text>
      ) : null}
    </View>
  );
}
```

Note: Add `import { radii } from '../design-system/index.js';` — or merge with existing spacing import.

- [ ] **Step 4: Update PreviewStepSequence**

Replace the flat border-bottom rows with styled step cards.

```tsx
// packages/ui/src/components/PreviewStepSequence.tsx
import type { BreachDirection } from '@clmm/application/public';
import { buildPreviewStepLabels } from './PreviewStepSequenceUtils.js';
import { View, Text } from 'react-native';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import { spacing, radii } from '../design-system/index.js';

type Props = { direction: BreachDirection; estimatedAmounts?: Record<number, string> };

export function PreviewStepSequence({ direction, estimatedAmounts }: Props) {
  const steps = buildPreviewStepLabels(direction);
  return (
    <View style={{ gap: spacing.sm }}>
      {steps.map((step) => (
        <View
          key={step.step}
          style={{
            flexDirection: 'row',
            padding: spacing.md,
            backgroundColor: colors.surfaceRecessed,
            borderRadius: radii.sm,
          }}
        >
          <View style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: `${colors.primary}20`,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: spacing.md,
          }}>
            <Text style={{
              color: colors.primary,
              fontSize: typography.fontSize.xs,
              fontWeight: typography.fontWeight.bold,
            }}>
              {step.step}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{
              color: colors.text,
              fontSize: typography.fontSize.base,
              fontWeight: typography.fontWeight.semibold,
            }}>
              {step.label}
            </Text>
            {step.sublabel && (
              <Text style={{
                color: colors.textSecondary,
                fontSize: typography.fontSize.xs,
                marginTop: 2,
              }}>
                {step.sublabel}
              </Text>
            )}
            {estimatedAmounts?.[step.step] && (
              <Text style={{
                color: colors.primary,
                fontSize: typography.fontSize.xs,
                marginTop: 2,
              }}>
                {estimatedAmounts[step.step]}
              </Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}
```

- [ ] **Step 5: Update ConnectWalletEntry**

Premium empty state with better visual weight on the CTA.

```tsx
// packages/ui/src/components/ConnectWalletEntry.tsx
import { View, Text, TouchableOpacity } from 'react-native';
import { colors, typography } from '../design-system/index.js';
import { spacing, radii } from '../design-system/index.js';

type Props = {
  onConnectWallet?: () => void;
};

export function ConnectWalletEntry({ onConnectWallet }: Props) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing['3xl'], paddingHorizontal: spacing.xl }}>
      <Text style={{
        color: colors.text,
        ...typography.presets.pageTitle,
        textAlign: 'center',
      }}>
        Connect your wallet to get started
      </Text>
      <Text style={{
        color: colors.textSecondary,
        ...typography.presets.body,
        textAlign: 'center',
        marginTop: spacing.sm,
      }}>
        CLMM monitors your Orca concentrated liquidity positions and helps you exit when they go out of range.
      </Text>
      <TouchableOpacity
        onPress={onConnectWallet}
        style={{
          marginTop: spacing.xl,
          paddingVertical: 14,
          paddingHorizontal: spacing['2xl'],
          backgroundColor: colors.primary,
          borderRadius: radii.md,
        }}
      >
        <Text style={{
          color: colors.background,
          ...typography.presets.cta,
          textAlign: 'center',
        }}>
          Connect Wallet
        </Text>
      </TouchableOpacity>
    </View>
  );
}
```

- [ ] **Step 6: Update DegradedCapabilityBanner**

Use token-based warning background instead of hardcoded `#422006`.

```tsx
// packages/ui/src/components/DegradedCapabilityBanner.tsx
import { View, Text } from 'react-native';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import { spacing, radii } from '../design-system/index.js';
import { buildDegradedBannerMessage } from './DegradedCapabilityBannerUtils.js';
import type { PlatformCapabilities } from './DegradedCapabilityBannerUtils.js';

export { buildDegradedBannerMessage } from './DegradedCapabilityBannerUtils.js';
export type { PlatformCapabilities } from './DegradedCapabilityBannerUtils.js';

type Props = {
  capabilities?: PlatformCapabilities | null | undefined;
};

export function DegradedCapabilityBanner({ capabilities }: Props) {
  if (!capabilities) return null;

  const message = buildDegradedBannerMessage(capabilities);
  if (!message) return null;

  return (
    <View style={{
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      backgroundColor: `${colors.warning}18`,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: `${colors.warning}30`,
    }}>
      <Text style={{
        color: colors.warning,
        fontSize: typography.fontSize.sm,
        fontWeight: typography.fontWeight.medium,
      }}>
        {message}
      </Text>
    </View>
  );
}
```

- [ ] **Step 7: Update DesktopShell**

Use new background color and border token.

```tsx
// packages/ui/src/components/DesktopShell.tsx
import { View, Text, Platform } from 'react-native';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import { spacing } from '../design-system/index.js';
import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  title?: string;
};

export function DesktopShell({ children, title }: Props) {
  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  return (
    <View style={{
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
    }}>
      <View style={{
        width: '100%',
        maxWidth: 480,
        flex: 1,
      }}>
        {title ? (
          <View style={{
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}>
            <Text style={{
              color: colors.text,
              fontSize: typography.fontSize.lg,
              fontWeight: typography.fontWeight.bold,
            }}>
              {title}
            </Text>
          </View>
        ) : null}
        {children}
      </View>
    </View>
  );
}
```

- [ ] **Step 8: Run all tests**

Run: `cd packages/ui && npx vitest run`
Expected: all tests PASS

- [ ] **Step 9: Commit**

```bash
git add packages/ui/src/components/
git commit -m "feat(ui): refresh core components with Calm Command styling

Update RangeStatusBadge, DirectionalPolicyCard, ExecutionStateCard,
PreviewStepSequence, ConnectWalletEntry, DegradedCapabilityBanner,
and DesktopShell to use new design tokens."
```

---

## Task 5: Redesign PositionsListScreen (Dashboard)

The positions list is the primary screenshot surface. Add a stronger top-level summary area, elevate breach/risk states, and reduce visual clutter inside each card.

**Files:**
- Modify: `packages/ui/src/screens/PositionsListScreen.tsx`

- [ ] **Step 1: Rewrite PositionsListScreen with Calm Command styling**

Key changes:
- Page title uses `typography.presets.pageTitle`
- Position cards use `cardStyles.elevated` with consistent spacing
- Empty and loading states feel designed, not incidental
- Alert dot replaced with a semantic badge
- Pool label and range status get clearer hierarchy

```tsx
// packages/ui/src/screens/PositionsListScreen.tsx
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import type { PositionSummaryDto } from '@clmm/application/public';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import { spacing, radii, cardStyles } from '../design-system/index.js';
import { buildPositionListViewModel } from '../view-models/PositionListViewModel.js';
import { RangeStatusBadge } from '../components/RangeStatusBadge.js';
import { DegradedCapabilityBanner } from '../components/DegradedCapabilityBanner.js';
import { ConnectWalletEntry } from '../components/ConnectWalletEntry.js';
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
}: Props) {
  const isConnected = walletAddress != null && walletAddress.length > 0;
  const hasPositions = (positions?.length ?? 0) > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: spacing.lg }}>
      <Text style={{
        color: colors.text,
        ...typography.presets.pageTitle,
      }}>
        Positions
      </Text>

      <DegradedCapabilityBanner capabilities={platformCapabilities} />

      {!isConnected ? (
        <ConnectWalletEntry {...(onConnectWallet != null ? { onConnectWallet } : {})} />
      ) : positionsLoading ? (
        <View style={{ alignItems: 'center', paddingVertical: spacing['3xl'], paddingHorizontal: spacing.xl }}>
          <Text style={{
            color: colors.text,
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            textAlign: 'center',
          }}>
            Loading supported Orca positions
          </Text>
          <Text style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.base,
            textAlign: 'center',
            marginTop: spacing.sm,
          }}>
            Checking this wallet for supported concentrated liquidity positions.
          </Text>
        </View>
      ) : positionsError && !hasPositions ? (
        <View style={{ alignItems: 'center', paddingVertical: spacing['3xl'], paddingHorizontal: spacing.xl }}>
          <Text style={{
            color: colors.text,
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            textAlign: 'center',
          }}>
            Could not load supported positions
          </Text>
          <Text style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.base,
            textAlign: 'center',
            marginTop: spacing.sm,
            lineHeight: typography.fontSize.base * typography.lineHeight.normal,
          }}>
            {positionsError}
          </Text>
        </View>
      ) : (
        <ConnectedPositionsList
          positions={positions ?? []}
          {...(onSelectPosition != null ? { onSelectPosition } : {})}
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
      <View style={{ alignItems: 'center', paddingVertical: spacing['3xl'], paddingHorizontal: spacing.xl }}>
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
          marginTop: spacing.sm,
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
      style={{ marginTop: spacing.lg }}
      contentContainerStyle={{ gap: spacing.sm }}
      renderItem={({ item }) => (
        <TouchableOpacity
          onPress={() => onSelectPosition?.(item.positionId)}
          style={{
            padding: spacing.lg,
            ...cardStyles.elevated,
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
                    marginLeft: spacing.sm,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 2,
                    borderRadius: radii.sm,
                    backgroundColor: `${colors.danger}18`,
                  }}>
                    <Text style={{
                      color: colors.danger,
                      fontSize: typography.fontSize.xs,
                      fontWeight: typography.fontWeight.semibold,
                    }}>
                      Action needed
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={{
                color: colors.textMuted,
                fontSize: typography.fontSize.sm,
                marginTop: spacing.xs,
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

- [ ] **Step 2: Run existing screen tests**

Run: `cd packages/ui && npx vitest run src/screens/PositionsListScreen.test.tsx`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/screens/PositionsListScreen.tsx
git commit -m "feat(ui): redesign PositionsListScreen with Calm Command hierarchy

Elevated cards, semantic alert badges, consistent spacing tokens,
and premium empty/loading states."
```

---

## Task 6: Redesign PositionDetailScreen

The main decision screen. Increase visual prominence of range state and breach state. Clear hierarchy for range bounds vs current price. Dominant CTA.

**Files:**
- Modify: `packages/ui/src/screens/PositionDetailScreen.tsx`

- [ ] **Step 1: Rewrite PositionDetailScreen with Calm Command styling**

Key changes:
- Elevated card for range bounds with stronger hierarchy
- Breach direction gets a semantic alert card instead of flat tinted box
- CTA button is larger with radii.md
- Alert label gets consistent chip styling

```tsx
// packages/ui/src/screens/PositionDetailScreen.tsx
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import type { PositionDetailDto } from '@clmm/application/public';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import { spacing, radii, cardStyles } from '../design-system/index.js';
import { presentPositionDetail } from '../presenters/PositionDetailPresenter.js';
import { RangeStatusBadge } from '../components/RangeStatusBadge.js';
import { DirectionalPolicyCard } from '../components/DirectionalPolicyCard.js';

type Props = {
  position?: PositionDetailDto;
  onViewPreview?: (triggerId: string) => void;
};

export function PositionDetailScreen({ position, onViewPreview }: Props) {
  if (!position) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: spacing.lg }}>
        <Text style={{
          color: colors.text,
          ...typography.presets.pageTitle,
        }}>
          Position Detail
        </Text>
        <Text style={{ color: colors.textSecondary, marginTop: spacing.sm }}>
          Loading position...
        </Text>
      </View>
    );
  }

  const presentation = presentPositionDetail({ position });
  const vm = presentation.position;
  const breachDirection = position.breachDirection;
  const triggerId = position.triggerId;
  const canViewPreview = position.hasActionableTrigger && breachDirection != null && triggerId != null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: spacing.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{
            color: colors.text,
            ...typography.presets.pageTitle,
          }}>
            {vm.poolLabel}
          </Text>
          <RangeStatusBadge rangeStateKind={position.rangeState} />
        </View>

        <View style={{
          marginTop: spacing.lg,
          padding: spacing.lg,
          ...cardStyles.elevated,
        }}>
          <Text style={{
            color: colors.textMuted,
            ...typography.presets.sectionLabel,
          }}>
            RANGE BOUNDS
          </Text>
          <Text style={{
            color: colors.text,
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            marginTop: spacing.xs,
          }}>
            {vm.rangeBoundsLabel}
          </Text>
          <Text style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.sm,
            marginTop: spacing.sm,
          }}>
            {vm.currentPriceLabel}
          </Text>
        </View>

        {vm.breachDirectionLabel ? (
          <View style={{
            marginTop: spacing.md,
            padding: spacing.md,
            backgroundColor: `${colors.breach}18`,
            borderRadius: radii.sm,
            borderWidth: 1,
            borderColor: `${colors.breach}30`,
          }}>
            <Text style={{
              color: colors.breach,
              fontSize: typography.fontSize.base,
              fontWeight: typography.fontWeight.semibold,
            }}>
              {vm.breachDirectionLabel}
            </Text>
          </View>
        ) : null}

        {canViewPreview ? (
          <View style={{ marginTop: spacing.lg }}>
            <DirectionalPolicyCard direction={breachDirection!} />

            <TouchableOpacity
              onPress={() => onViewPreview?.(triggerId!)}
              style={{
                marginTop: spacing.lg,
                padding: spacing.lg,
                backgroundColor: colors.primary,
                borderRadius: radii.md,
                alignItems: 'center',
              }}
            >
              <Text style={{
                color: colors.background,
                ...typography.presets.cta,
              }}>
                View Exit Preview
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={{
          marginTop: spacing.lg,
          padding: spacing.md,
          ...cardStyles.base,
        }}>
          <Text style={{
            color: vm.hasAlert ? colors.danger : colors.textMuted,
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.medium,
          }}>
            {vm.alertLabel}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
```

- [ ] **Step 2: Run existing screen tests**

Run: `cd packages/ui && npx vitest run src/screens/PositionDetailScreen.test.tsx`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/screens/PositionDetailScreen.tsx
git commit -m "feat(ui): redesign PositionDetailScreen with layered cards and breach prominence"
```

---

## Task 7: Redesign ExecutionPreviewScreen (Trust Screen)

The most important trust screen. The directional policy card is the centerpiece. Freshness and quote validity in a compact state band. CTA visually distinct from secondary actions.

**Files:**
- Modify: `packages/ui/src/screens/ExecutionPreviewScreen.tsx`

- [ ] **Step 1: Rewrite ExecutionPreviewScreen with Calm Command styling**

Key changes:
- Title uses `typography.presets.pageTitle`
- DirectionalPolicyCard is the visual centerpiece
- Freshness band uses compact semantic chip styling
- Warning uses token-based colors instead of hardcoded alpha
- CTA is large and visually distinct
- Refresh button uses recessed card styling

```tsx
// packages/ui/src/screens/ExecutionPreviewScreen.tsx
import { ActivityIndicator, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import type { ExecutionPreviewDto } from '@clmm/application/public';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import { spacing, radii, cardStyles } from '../design-system/index.js';
import { presentPreview } from '../presenters/PreviewPresenter.js';
import { DirectionalPolicyCard } from '../components/DirectionalPolicyCard.js';
import { PreviewStepSequence } from '../components/PreviewStepSequence.js';

type Props = {
  preview?: ExecutionPreviewDto;
  previewLoading?: boolean;
  previewError?: string | null;
  onApprove?: () => void;
  onRefresh?: () => void;
};

export function ExecutionPreviewScreen({ preview, previewLoading, previewError, onApprove, onRefresh }: Props) {
  if (previewLoading !== false && !preview) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ padding: spacing.lg, alignItems: 'center', justifyContent: 'center', minHeight: 240 }}>
          <Text style={{ color: colors.text, ...typography.presets.pageTitle }}>
            Exit Preview
          </Text>
          <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.primary} />
          <Text style={{ color: colors.textSecondary, marginTop: spacing.md }}>
            Loading exit preview
          </Text>
        </View>
      </ScrollView>
    );
  }

  if (!preview && previewError) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ padding: spacing.lg, alignItems: 'center', justifyContent: 'center', minHeight: 240 }}>
          <Text style={{ color: colors.text, ...typography.presets.pageTitle }}>
            Exit Preview
          </Text>
          <Text style={{
            color: colors.text,
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            marginTop: spacing.lg,
            textAlign: 'center',
          }}>
            Could not load exit preview
          </Text>
          <Text style={{
            color: colors.textSecondary,
            marginTop: spacing.sm,
            textAlign: 'center',
          }}>
            {previewError}
          </Text>
        </View>
      </ScrollView>
    );
  }

  if (!preview) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ padding: spacing.lg, alignItems: 'center', justifyContent: 'center', minHeight: 240 }}>
          <Text style={{ color: colors.text, ...typography.presets.pageTitle }}>
            Exit Preview
          </Text>
          <Text style={{
            color: colors.textSecondary,
            marginTop: spacing.lg,
            textAlign: 'center',
          }}>
            No preview available
          </Text>
        </View>
      </ScrollView>
    );
  }

  const { preview: vm, canProceed, warningMessage } = presentPreview(preview);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: spacing.lg }}>
        <Text style={{
          color: colors.text,
          ...typography.presets.pageTitle,
        }}>
          Exit Preview
        </Text>

        <View style={{ marginTop: spacing.lg }}>
          <DirectionalPolicyCard direction={preview.breachDirection} />
        </View>

        <View style={{ marginTop: spacing.lg }}>
          <Text style={{
            color: colors.textMuted,
            ...typography.presets.sectionLabel,
            marginBottom: spacing.sm,
          }}>
            EXECUTION STEPS
          </Text>
          <PreviewStepSequence direction={preview.breachDirection} />
        </View>

        <View style={{
          marginTop: spacing.lg,
          padding: spacing.md,
          ...cardStyles.base,
        }}>
          <Text style={{
            color: vm.isFresh ? colors.success : vm.isStale ? colors.warning : colors.danger,
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.semibold,
          }}>
            {vm.freshnessLabel}
          </Text>
        </View>

        {warningMessage ? (
          <View style={{
            marginTop: spacing.md,
            padding: spacing.md,
            backgroundColor: `${colors.warning}18`,
            borderRadius: radii.sm,
            borderWidth: 1,
            borderColor: `${colors.warning}30`,
          }}>
            <Text style={{
              color: colors.warning,
              fontSize: typography.fontSize.sm,
            }}>
              {warningMessage}
            </Text>
          </View>
        ) : null}

        {canProceed ? (
          <TouchableOpacity
            onPress={onApprove}
            style={{
              marginTop: spacing.xl,
              padding: spacing.lg,
              backgroundColor: colors.primary,
              borderRadius: radii.md,
              alignItems: 'center',
            }}
          >
            <Text style={{
              color: colors.background,
              ...typography.presets.cta,
            }}>
              Sign and Execute Exit
            </Text>
          </TouchableOpacity>
        ) : null}

        {vm.requiresRefresh ? (
          <TouchableOpacity
            onPress={onRefresh}
            style={{
              marginTop: spacing.md,
              padding: spacing.lg,
              ...cardStyles.recessed,
              borderColor: colors.warning,
              alignItems: 'center',
            }}
          >
            <Text style={{
              color: colors.warning,
              fontSize: typography.fontSize.base,
              fontWeight: typography.fontWeight.semibold,
            }}>
              Refresh Quote
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </ScrollView>
  );
}
```

- [ ] **Step 2: Run all tests**

Run: `cd packages/ui && npx vitest run`
Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/screens/ExecutionPreviewScreen.tsx
git commit -m "feat(ui): redesign ExecutionPreviewScreen as premium trust surface"
```

---

## Task 8: Redesign SigningStatusScreen

This flow should feel calm, explicit, and honest. Clear waiting-for-signature state. Progress and lifecycle cues. Distinct states for pending, submitted, confirmed, failed, partial.

**Files:**
- Modify: `packages/ui/src/screens/SigningStatusScreen.tsx`

- [ ] **Step 1: Rewrite SigningStatusScreen with Calm Command styling**

Key changes:
- Replace hardcoded `#422006` with token-based `${colors.warning}18`
- Use spacing tokens throughout
- Use `cardStyles` for notice and progress sections
- Use `radii` for all corners
- Use `typography.presets.pageTitle` for title
- Use `typography.presets.cta` for button text
- Consistent button styling with `radii.md`

Apply the same pattern used in previous screen rewrites. Replace all:
- `padding: 16` → `padding: spacing.lg`
- `padding: 12` → `padding: spacing.md`
- `padding: 8` → `padding: spacing.sm`
- `marginTop: 16` → `marginTop: spacing.lg`
- `marginTop: 12` → `marginTop: spacing.md`
- `marginTop: 8` → `marginTop: spacing.sm`
- `borderRadius: 8` → `borderRadius: radii.md`
- `borderRadius: 4` → `borderRadius: radii.sm`
- `colors.border` border cards → `cardStyles.elevated` or `cardStyles.base`
- `backgroundColor: '#422006'` → `backgroundColor: \`${colors.warning}18\``
- `fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold` title → `...typography.presets.pageTitle`
- `fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.bold` CTA → `...typography.presets.cta`

The structure and logic of SigningStatusScreen should remain identical — only inline style values change to use design tokens.

- [ ] **Step 2: Run signing screen tests**

Run: `cd packages/ui && npx vitest run src/screens/SigningStatusScreen.test.tsx`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/screens/SigningStatusScreen.tsx
git commit -m "feat(ui): redesign SigningStatusScreen with calm signing states"
```

---

## Task 9: Redesign ExecutionResultScreen

**Files:**
- Modify: `packages/ui/src/screens/ExecutionResultScreen.tsx`

- [ ] **Step 1: Apply Calm Command styling to ExecutionResultScreen**

Same token substitutions as Task 8. Key changes:
- Title → `typography.presets.pageTitle`
- Cards → `cardStyles.elevated` / `cardStyles.base`
- All spacing → `spacing.*` tokens
- All radii → `radii.*` tokens
- CTAs → `radii.md`, `typography.presets.cta`
- Transaction signature card → `cardStyles.base`

- [ ] **Step 2: Run all tests**

Run: `cd packages/ui && npx vitest run`
Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/screens/ExecutionResultScreen.tsx
git commit -m "feat(ui): redesign ExecutionResultScreen with Calm Command styling"
```

---

## Task 10: Redesign Utility Screens (History, Alerts, Wallet)

These are utility screens and should be quieter than the main action surfaces. Reduce emphasis compared with preview and detail flows. Improve scanability.

**Files:**
- Modify: `packages/ui/src/screens/HistoryListScreen.tsx`
- Modify: `packages/ui/src/screens/HistoryDetailScreen.tsx`
- Modify: `packages/ui/src/screens/AlertsListScreen.tsx`
- Modify: `packages/ui/src/screens/WalletSettingsScreen.tsx`
- Modify: `packages/ui/src/screens/WalletConnectScreen.tsx`

- [ ] **Step 1: Apply Calm Command styling to HistoryListScreen**

Key changes:
- Title → `typography.presets.pageTitle`
- List items → `cardStyles.base` (quieter than elevated)
- Spacing → tokens
- Radii → tokens

- [ ] **Step 2: Apply Calm Command styling to HistoryDetailScreen**

Read the file first, then apply the same token substitutions.

- [ ] **Step 3: Apply Calm Command styling to AlertsListScreen**

Key changes:
- Title → `typography.presets.pageTitle`
- Alert cards → `cardStyles.elevated` (these are actionable, so elevated)
- Count label uses `colors.breach`
- Spacing/radii → tokens

- [ ] **Step 4: Apply Calm Command styling to WalletSettingsScreen**

Key changes:
- Title → `typography.presets.pageTitle`
- Wallet info card → `cardStyles.elevated`
- Action buttons → `cardStyles.base` with `radii.md`
- Replace hardcoded `#422006` / `#450a0a` → token-based `${colors.warning}18` / `${colors.danger}18`
- Disconnect button → keep transparent bg with `colors.danger` border

- [ ] **Step 5: Apply Calm Command styling to WalletConnectScreen**

Read the file first, then apply token substitutions.

- [ ] **Step 6: Run all tests**

Run: `cd packages/ui && npx vitest run`
Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/screens/HistoryListScreen.tsx packages/ui/src/screens/HistoryDetailScreen.tsx packages/ui/src/screens/AlertsListScreen.tsx packages/ui/src/screens/WalletSettingsScreen.tsx packages/ui/src/screens/WalletConnectScreen.tsx
git commit -m "feat(ui): redesign utility screens (History, Alerts, Wallet) with quieter Calm Command styling"
```

---

## Task 11: Final Consistency Pass

Verify all screens compile, all tests pass, and the token usage is consistent across the codebase.

**Files:**
- All files in `packages/ui/src/`

- [ ] **Step 1: Run full test suite**

Run: `cd packages/ui && npx vitest run`
Expected: all tests PASS

- [ ] **Step 2: Build the package**

Run: `cd packages/ui && npx tsc --noEmit`
Expected: no type errors

- [ ] **Step 3: Grep for hardcoded color values that should use tokens**

Search for remaining hardcoded hex colors in screen/component files (excluding test files and the design-system itself):

Run: `grep -rn '#[0-9a-fA-F]\{6\}' packages/ui/src/screens/ packages/ui/src/components/ --include='*.tsx' --include='*.ts' | grep -v '.test.'`

Any remaining hardcoded hex values should be replaced with the appropriate token. Exceptions: alpha-appended colors like `${colors.warning}18` are fine.

- [ ] **Step 4: Grep for hardcoded spacing values**

Run: `grep -rn 'padding: [0-9]' packages/ui/src/screens/ packages/ui/src/components/ --include='*.tsx' | grep -v '.test.'`
Run: `grep -rn 'margin.*: [0-9]' packages/ui/src/screens/ packages/ui/src/components/ --include='*.tsx' | grep -v '.test.'`

Replace any remaining hardcoded values with `spacing.*` tokens. Small one-off values like `2` for marginTop are acceptable.

- [ ] **Step 5: Fix any remaining issues found in steps 3-4**

- [ ] **Step 6: Run full test suite again**

Run: `cd packages/ui && npx vitest run`
Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/ui/
git commit -m "chore(ui): final consistency pass — replace remaining hardcoded values with tokens"
```

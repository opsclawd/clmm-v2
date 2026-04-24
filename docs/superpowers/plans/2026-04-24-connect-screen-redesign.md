# Connect Screen Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `WalletConnectScreen` with a React Native translation of Claude's `ScreenConnect` design, expanding the design system with new semantic tokens and a Feather icon wrapper.

**Architecture:** Keep the existing props interface and view-model logic untouched. Replace only the presentation layer. Add new design tokens alongside existing ones for backward compatibility. Use `@expo/vector-icons` (Feather) for icons.

**Tech Stack:** React Native, Expo, `@expo/vector-icons` (Feather), Vitest, `@testing-library/react`

---

## File Map

| File | Responsibility |
|------|----------------|
| `packages/ui/src/design-system/colors.ts` | Add new semantic color tokens from the design |
| `packages/ui/src/design-system/colors.test.ts` | Add tests for new tokens |
| `packages/ui/src/design-system/typography.ts` | Add `fontFamily` and smaller font sizes |
| `packages/ui/src/components/Icon.tsx` | New: Feather icon wrapper that maps design icon names to Feather names |
| `packages/ui/src/screens/WalletConnectScreen.tsx` | Replace: full rewrite of connect screen |
| `packages/ui/src/screens/WalletConnectScreen.test.tsx` | New: tests for the rewritten screen |
| `packages/ui/src/index.ts` | Export the new `Icon` component |
| `packages/ui/package.json` | Add `@expo/vector-icons` as devDependency |
| `apps/app/package.json` | Add `@expo/vector-icons` as dependency |

---

## Task 1: Add `@expo/vector-icons` dependency

**Files:**
- Modify: `packages/ui/package.json`
- Modify: `apps/app/package.json`

- [ ] **Step 1: Add to packages/ui devDependencies**

Add `"@expo/vector-icons": "^14.0.0"` to `devDependencies` in `packages/ui/package.json`:

```json
"devDependencies": {
  "@clmm/config": "workspace:*",
  "@expo/vector-icons": "^14.0.0",
  "@testing-library/react": "^16.3.0",
  "@types/react": "~18.3.1",
  "react-native-web": "~0.19.13",
  "vitest": "^1.6.0",
  "typescript": "^5.4.0"
}
```

- [ ] **Step 2: Add to apps/app dependencies**

Add `"@expo/vector-icons": "^14.0.0"` to `dependencies` in `apps/app/package.json`:

```json
"dependencies": {
  "@babel/runtime": "^7.29.0",
  "@clmm/application": "workspace:*",
  "@clmm/ui": "workspace:*",
  "@expo/metro-runtime": "~4.0.1",
  "@expo/vector-icons": "^14.0.0",
  "expo-modules-core": "~2.2.3",
  ...
}
```

- [ ] **Step 3: Install dependencies**

Run: `pnpm install --frozen-lockfile`

Expected: Lockfile updates, no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/package.json apps/app/package.json pnpm-lock.yaml
git commit -m "deps: add @expo/vector-icons for Feather icon set"
```

---

## Task 2: Expand design system colors

**Files:**
- Modify: `packages/ui/src/design-system/colors.ts`
- Modify: `packages/ui/src/design-system/colors.test.ts`

- [ ] **Step 1: Add new tokens to colors.ts**

Add the following keys to the existing `colors` object in `packages/ui/src/design-system/colors.ts`, keeping all existing keys:

```ts
export const colors = {
  // ... existing keys ...

  // New semantic tokens from design system
  appBackground: '#070A0F',
  card: '#0C1118',
  cardRaised: '#121923',
  safe: '#9EECD1',
  safeMuted: 'rgba(158,236,209,0.12)',
  warn: '#F4C97A',
  breach: '#F59484',
  accent: '#8FB8F5',
  textPrimary: '#F4F6F8',
  textSecondary: '#B6C0CE',
  textTertiary: '#7C8695',
  textMuted: '#4F5866',
  borderLight: 'rgba(255,255,255,0.10)',
  borderMedium: 'rgba(255,255,255,0.16)',
} as const;
```

The complete file should now contain all old keys plus these new keys.

- [ ] **Step 2: Add tests for new tokens**

Append to `packages/ui/src/design-system/colors.test.ts`:

```ts
  it('has new design system semantic tokens', () => {
    expect(colors.appBackground).toBe('#070A0F');
    expect(colors.card).toBe('#0C1118');
    expect(colors.cardRaised).toBe('#121923');
    expect(colors.safe).toBe('#9EECD1');
    expect(colors.safeMuted).toBe('rgba(158,236,209,0.12)');
    expect(colors.warn).toBe('#F4C97A');
    expect(colors.breach).toBe('#F59484');
    expect(colors.accent).toBe('#8FB8F5');
    expect(colors.textPrimary).toBe('#F4F6F8');
    expect(colors.textSecondary).toBe('#B6C0CE');
    expect(colors.textTertiary).toBe('#7C8695');
    expect(colors.textMuted).toBe('#4F5866');
    expect(colors.borderLight).toBe('rgba(255,255,255,0.10)');
    expect(colors.borderMedium).toBe('rgba(255,255,255,0.16)');
  });
```

- [ ] **Step 3: Run color tests**

Run: `cd packages/ui && pnpm test -- colors.test.ts`

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/design-system/colors.ts packages/ui/src/design-system/colors.test.ts
git commit -m "design-system: add semantic color tokens from new design"
```

---

## Task 3: Expand design system typography

**Files:**
- Modify: `packages/ui/src/design-system/typography.ts`

- [ ] **Step 1: Add fontFamily and smaller sizes**

Replace the content of `packages/ui/src/design-system/typography.ts` with:

```ts
export const typography = {
  fontFamily: {
    ui: 'Inter, system-ui, sans-serif',
    mono: 'JetBrains Mono, monospace',
  },
  fontSize: {
    xs: 10,
    sm: 12,
    base: 14,
    md: 15,
    lg: 17,
    xl: 20,
    '2xl': 22,
    '3xl': 34,
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
} as const;
```

- [ ] **Step 2: Run typecheck**

Run: `cd packages/ui && pnpm typecheck`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/design-system/typography.ts
git commit -m "design-system: add fontFamily and smaller font sizes"
```

---

## Task 4: Create Icon wrapper component

**Files:**
- Create: `packages/ui/src/components/Icon.tsx`

- [ ] **Step 1: Write the Icon component**

Create `packages/ui/src/components/Icon.tsx`:

```tsx
import React from 'react';
import Feather from '@expo/vector-icons/Feather';

export type IconName =
  | 'wallet'
  | 'check'
  | 'alert'
  | 'bell'
  | 'layers'
  | 'search'
  | 'gear'
  | 'chevronLeft'
  | 'chevronRight'
  | 'x'
  | 'lock'
  | 'swap'
  | 'arrowRight'
  | 'shield'
  | 'shieldCheck'
  | 'copy'
  | 'info'
  | 'trend'
  | 'radar'
  | 'dot';

const nameMap: Record<IconName, keyof typeof Feather.glyphMap> = {
  wallet: 'credit-card',
  check: 'check',
  alert: 'alert-triangle',
  bell: 'bell',
  layers: 'layers',
  search: 'search',
  gear: 'settings',
  chevronLeft: 'chevron-left',
  chevronRight: 'chevron-right',
  x: 'x',
  lock: 'lock',
  swap: 'repeat',
  arrowRight: 'arrow-right',
  shield: 'shield',
  shieldCheck: 'shield',
  copy: 'copy',
  info: 'info',
  trend: 'trending-up',
  radar: 'activity',
  dot: 'circle',
};

type Props = {
  name: IconName;
  size?: number;
  color?: string;
};

export function Icon({ name, size = 16, color = '#F4F6F8' }: Props): JSX.Element {
  const featherName = nameMap[name];
  return <Feather name={featherName} size={size} color={color} />;
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd packages/ui && pnpm typecheck`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/Icon.tsx
git commit -m "feat: add Icon wrapper component using Feather icons"
```

---

## Task 5: Rewrite WalletConnectScreen

**Files:**
- Modify: `packages/ui/src/screens/WalletConnectScreen.tsx`

- [ ] **Step 1: Replace WalletConnectScreen.tsx**

Replace the entire file with:

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
import { buildWalletConnectViewModel } from '../view-models/WalletConnectionViewModel.js';
import { Icon } from '../components/Icon.js';
import type { PlatformCapabilities } from '../components/DegradedCapabilityBannerUtils.js';
import type { ConnectionOutcome, WalletOptionKind } from '../components/WalletConnectionUtils.js';

type Props = {
  platformCapabilities?: PlatformCapabilities | null;
  connectionOutcome?: ConnectionOutcome | null;
  isConnecting?: boolean;
  onSelectWallet?: (kind: WalletOptionKind) => void;
  onGoBack?: () => void;
};

function HeroAnimation() {
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  const scale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 3.3],
  });

  const opacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0],
  });

  return (
    <View style={styles.heroContainer}>
      <View style={[styles.ring, styles.ringOuter]} />
      <View style={[styles.ring, styles.ringMiddle]} />
      <View style={[styles.ring, styles.ringInner]} />
      <View style={styles.centerDot} />
      <Animated.View
        style={[
          styles.pulseRing,
          {
            transform: [{ scale }],
            opacity,
          },
        ]}
      />
    </View>
  );
}

const features = [
  {
    title: 'Read-only by default',
    description: 'We only request signatures when you approve an exit.',
  },
  {
    title: 'Debounced breach logic',
    description: "Ignores 30–60s wicks so you don't exit on noise.",
  },
  {
    title: 'Auditable receipts',
    description: 'Every action saved with tx hash and fills.',
  },
];

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

export function WalletConnectScreen({
  platformCapabilities,
  connectionOutcome,
  isConnecting,
  onSelectWallet,
  onGoBack,
}: Props): JSX.Element {
  if (!platformCapabilities) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.safe} />
      </View>
    );
  }

  const vm = buildWalletConnectViewModel({
    capabilities: platformCapabilities,
    connectionOutcome: connectionOutcome ?? null,
    isConnecting: isConnecting ?? false,
  });

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
      >
        {onGoBack ? (
          <TouchableOpacity onPress={onGoBack} style={styles.backButton}>
            <Icon name="chevronLeft" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : null}

        <HeroAnimation />

        <Text style={styles.title}>Protect your Orca positions</Text>
        <Text style={styles.subtitle}>
          We monitor your concentrated liquidity range and prepare a safe one-click exit the moment price breaches it.
        </Text>

        {vm.outcomeDisplay ? (
          <View
            style={[
              styles.outcomeBanner,
              {
                borderColor:
                  vm.outcomeDisplay.severity === 'error'
                    ? colors.breach
                    : vm.outcomeDisplay.severity === 'warning'
                      ? colors.warn
                      : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.outcomeTitle,
                {
                  color:
                    vm.outcomeDisplay.severity === 'error'
                      ? colors.breach
                      : vm.outcomeDisplay.severity === 'warning'
                        ? colors.warn
                        : colors.textPrimary,
                },
              ]}
            >
              {vm.outcomeDisplay.title}
            </Text>
            {vm.outcomeDisplay.detail ? (
              <Text style={styles.outcomeDetail}>{vm.outcomeDisplay.detail}</Text>
            ) : null}
          </View>
        ) : null}

        {vm.isConnecting ? (
          <View style={styles.connectingContainer}>
            <ActivityIndicator size="large" color={colors.safe} />
            <Text style={styles.connectingText}>Connecting...</Text>
          </View>
        ) : (
          <View style={styles.walletOptions}>
            {vm.walletOptions.map((option) => (
              <TouchableOpacity
                key={option.kind}
                onPress={() => onSelectWallet?.(option.kind)}
                style={styles.walletOptionButton}
              >
                <Icon name="wallet" size={20} color={colors.textPrimary} />
                <View style={styles.walletOptionText}>
                  <Text style={styles.walletOptionLabel}>{option.label}</Text>
                  <Text style={styles.walletOptionDescription}>
                    {option.description}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.featuresContainer}>
          {features.map((f) => (
            <FeatureRow key={f.title} title={f.title} description={f.description} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.appBackground,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.appBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    padding: 8,
    zIndex: 10,
  },
  heroContainer: {
    width: 120,
    height: 120,
    marginTop: 20,
    marginBottom: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ring: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
  },
  ringOuter: {
    width: 116,
    height: 116,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  ringMiddle: {
    width: 88,
    height: 88,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  ringInner: {
    width: 60,
    height: 60,
    borderColor: colors.safe,
    borderStyle: 'dashed',
    borderWidth: 1,
  },
  centerDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: colors.textPrimary,
  },
  pulseRing: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: colors.textPrimary,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: -0.02 * 22,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.base,
    lineHeight: typography.fontSize.base * typography.lineHeight.normal,
    textAlign: 'center',
    maxWidth: 300,
    marginBottom: 28,
  },
  outcomeBanner: {
    width: '100%',
    maxWidth: 320,
    padding: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  outcomeTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  outcomeDetail: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginTop: 4,
  },
  connectingContainer: {
    marginTop: 32,
    alignItems: 'center',
  },
  connectingText: {
    color: colors.textSecondary,
    marginTop: 12,
    fontSize: typography.fontSize.base,
  },
  walletOptions: {
    width: '100%',
    maxWidth: 320,
    marginTop: 24,
  },
  walletOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  walletOptionText: {
    flex: 1,
  },
  walletOptionLabel: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  walletOptionDescription: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginTop: 4,
  },
  featuresContainer: {
    width: '100%',
    maxWidth: 320,
    marginTop: 28,
    gap: 10,
  },
  featureRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 2,
  },
  featureIcon: {
    marginTop: 2,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 13,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
  },
  featureDescription: {
    fontSize: 12,
    color: colors.textTertiary,
  },
});
```

- [ ] **Step 2: Run typecheck**

Run: `cd packages/ui && pnpm typecheck`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/screens/WalletConnectScreen.tsx
git commit -m "feat: redesign WalletConnectScreen with new design system"
```

---

## Task 6: Write WalletConnectScreen tests

**Files:**
- Create: `packages/ui/src/screens/WalletConnectScreen.test.tsx`

- [ ] **Step 1: Write the test file**

Create `packages/ui/src/screens/WalletConnectScreen.test.tsx`:

```tsx
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WalletConnectScreen } from './WalletConnectScreen.js';

function makeCaps(overrides: Record<string, unknown> = {}) {
  return {
    nativePushAvailable: false,
    browserNotificationAvailable: false,
    nativeWalletAvailable: false,
    browserWalletAvailable: false,
    isMobileWeb: false,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('WalletConnectScreen', () => {
  it('renders loading spinner when platformCapabilities is null', () => {
    render(<WalletConnectScreen />);
    expect(document.querySelector('div[role="progressbar"]')).toBeTruthy();
  });

  it('renders title and subtitle', () => {
    render(<WalletConnectScreen platformCapabilities={makeCaps()} />);
    expect(screen.getByText('Protect your Orca positions')).toBeTruthy();
    expect(
      screen.getByText(
        'We monitor your concentrated liquidity range and prepare a safe one-click exit the moment price breaches it.',
      ),
    ).toBeTruthy();
  });

  it('renders feature bullets', () => {
    render(<WalletConnectScreen platformCapabilities={makeCaps()} />);
    expect(screen.getByText('Read-only by default')).toBeTruthy();
    expect(screen.getByText('Debounced breach logic')).toBeTruthy();
    expect(screen.getByText('Auditable receipts')).toBeTruthy();
  });

  it('renders back button when onGoBack is provided', () => {
    const onGoBack = vi.fn();
    render(
      <WalletConnectScreen
        platformCapabilities={makeCaps()}
        onGoBack={onGoBack}
      />,
    );
    const backButton = document.querySelector('[style*="position: absolute"]');
    expect(backButton).toBeTruthy();
  });

  it('calls onGoBack when back button is pressed', () => {
    const onGoBack = vi.fn();
    render(
      <WalletConnectScreen
        platformCapabilities={makeCaps()}
        onGoBack={onGoBack}
      />,
    );
    const backButton = document.querySelector('[style*="position: absolute"]');
    if (backButton) {
      fireEvent.click(backButton);
    }
    expect(onGoBack).toHaveBeenCalled();
  });

  it('renders connecting state', () => {
    render(
      <WalletConnectScreen
        platformCapabilities={makeCaps()}
        isConnecting
      />,
    );
    expect(screen.getByText('Connecting...')).toBeTruthy();
  });

  it('renders wallet options when capabilities allow', () => {
    render(
      <WalletConnectScreen
        platformCapabilities={makeCaps({ browserWalletAvailable: true })}
      />,
    );
    expect(screen.getByText('Connect Browser Wallet')).toBeTruthy();
  });

  it('calls onSelectWallet when a wallet option is pressed', () => {
    const onSelectWallet = vi.fn();
    render(
      <WalletConnectScreen
        platformCapabilities={makeCaps({
          browserWalletAvailable: true,
          nativeWalletAvailable: true,
        })}
        onSelectWallet={onSelectWallet}
      />,
    );
    fireEvent.click(screen.getByText('Connect Browser Wallet'));
    expect(onSelectWallet).toHaveBeenCalledWith('browser');
  });

  it('renders outcome banner on error', () => {
    render(
      <WalletConnectScreen
        platformCapabilities={makeCaps()}
        connectionOutcome={{ kind: 'failed', reason: 'timeout' }}
      />,
    );
    expect(screen.getByText('Connection Failed')).toBeTruthy();
    expect(screen.getByText('timeout')).toBeTruthy();
  });

  it('renders outcome banner on success', () => {
    render(
      <WalletConnectScreen
        platformCapabilities={makeCaps()}
        connectionOutcome={{ kind: 'connected' }}
      />,
    );
    expect(screen.getByText('Wallet Connected')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd packages/ui && pnpm test -- WalletConnectScreen.test.tsx`

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/screens/WalletConnectScreen.test.tsx
git commit -m "test: add WalletConnectScreen tests for redesigned screen"
```

---

## Task 7: Export Icon from index.ts

**Files:**
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Add Icon export**

Add to `packages/ui/src/index.ts` in the Components section:

```ts
export { Icon } from './components/Icon.js';
export type { IconName } from './components/Icon.js';
```

- [ ] **Step 2: Run typecheck and build**

Run: `cd packages/ui && pnpm typecheck && pnpm build`

Expected: No errors, build succeeds.

- [ ] **Step 3: Run all UI tests**

Run: `cd packages/ui && pnpm test`

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/index.ts
git commit -m "chore: export Icon component from ui package"
```

---

## Task 8: Verify app builds

**Files:**
- None (verification only)

- [ ] **Step 1: Run app typecheck**

Run: `cd apps/app && pnpm typecheck`

Expected: No errors.

- [ ] **Step 2: Run app tests**

Run: `cd apps/app && pnpm test`

Expected: All tests pass.

- [ ] **Step 3: Run full repo checks**

Run from root:
```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
```

Expected: All pass. If any fail, fix issues before proceeding.

- [ ] **Step 4: Final commit**

```bash
git commit --allow-empty -m "feat: connect screen redesign complete"
```

---

## Self-Review Checklist

### Spec Coverage

| Spec Section | Task |
|-------------|------|
| Design system colors | Task 2 |
| Design system typography | Task 3 |
| Icon mapping (Feather) | Task 4 |
| WalletConnectScreen layout | Task 5 |
| WalletConnectScreen hero animation | Task 5 |
| WalletConnectScreen state handling | Task 5 |
| Tests for new screen | Task 6 |
| Export Icon | Task 7 |
| Verification | Task 8 |

### Placeholder Scan

- [x] No TBDs, TODOs, or incomplete sections
- [x] No "add appropriate error handling" vagueness
- [x] No "similar to Task N" shortcuts
- [x] All code steps contain complete code
- [x] All test steps contain complete test code

### Type Consistency

- [x] `IconName` type used consistently in `Icon.tsx` and `index.ts`
- [x] `colors` token names match between `colors.ts`, tests, and screen
- [x] `typography` sizes match between `typography.ts` and screen
- [x] Props interface unchanged from original

---

## Plan Complete

**Saved to:** `docs/superpowers/plans/2026-04-24-connect-screen-redesign.md`

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**

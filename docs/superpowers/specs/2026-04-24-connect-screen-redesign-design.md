# Connect Screen Redesign — Design Spec

**Date:** 2026-04-24
**Scope:** Replace `WalletConnectScreen` with a React Native translation of Claude's `ScreenConnect` design from `design/screens-a.jsx`.

---

## 1. Goal

Replace the current functional-but-plain connect screen with the polished, branded "CLMM Autopilot" design. Establish the new dark financial-terminal design system for future screens.

---

## 2. Design System Changes

### 2.1 Colors

Expand `packages/ui/src/design-system/colors.ts` with semantic tokens from `design/tokens.css`. All `oklch()` / `color-mix()` values are flattened to static hex/rgba for React Native compatibility.

| Token | Value | CSS Equivalent | Usage |
|-------|-------|----------------|-------|
| `appBackground` | `#070A0F` | `--bg-0` | Screen background |
| `card` | `#0C1118` | `--bg-1` | Card surfaces |
| `cardRaised` | `#121923` | `--bg-2` | Elevated cards |
| `safe` | `#9EECD1` | `--safe-ink` | Safe / in-range accent |
| `safeMuted` | `rgba(158,236,209,0.12)` | `--safe-bg` | Safe backgrounds |
| `warn` | `#F4C97A` | `--warn-ink` | Warning accent |
| `breach` | `#F59484` | `--breach-ink` | Breach accent |
| `accent` | `#8FB8F5` | `--accent-ink` | Interactive highlight |
| `textPrimary` | `#F4F6F8` | `--fg-1` | Primary text |
| `textSecondary` | `#B6C0CE` | `--fg-2` | Secondary text |
| `textTertiary` | `#7C8695` | `--fg-3` | Meta / labels |
| `textMuted` | `#4F5866` | `--fg-4` | Disabled / faint |
| `border` | `rgba(255,255,255,0.06)` | `--line-1` | Card borders |
| `borderLight` | `rgba(255,255,255,0.10)` | `--line-2` | Subtle borders |
| `borderMedium` | `rgba(255,255,255,0.16)` | `--line-3` | Emphasized borders |

Existing colors remain exported for backward compatibility. New screens use the new tokens.

### 2.2 Typography

Add to `packages/ui/src/design-system/typography.ts`:

```ts
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
```

---

## 3. Icon Mapping

Replace the design's inline SVG `Icon` set with `@expo/vector-icons` (Feather). Create a wrapper component `packages/ui/src/components/Icon.tsx`.

| Design Icon | Feather Name | Notes |
|-------------|--------------|-------|
| `wallet` | `credit-card` | CTA icon |
| `check` | `check` | Feature bullet |
| `alert` | `alert-triangle` | — |
| `bell` | `bell` | — |
| `layers` | `layers` | — |
| `search` | `search` | — |
| `gear` | `settings` | — |
| `chevronLeft` | `chevron-left` | — |
| `chevronRight` | `chevron-right` | — |
| `x` | `x` | — |
| `lock` | `lock` | — |
| `swap` | `repeat` | — |
| `arrowRight` | `arrow-right` | — |
| `shield` | `shield` | — |
| `shieldCheck` | `shield` | Same as shield |
| `copy` | `copy` | — |
| `info` | `info` | — |
| `trend` | `trending-up` | — |
| `radar` | `activity` | — |
| `dot` | `circle` | — |

Wrapper API:
```ts
type IconName = 'wallet' | 'check' | 'alert' | ...;
<Icon name="wallet" size={20} color={colors.safe} />
```

---

## 4. WalletConnectScreen Rewrite

### 4.1 Layout Structure

Translate `ScreenConnect` from `design/screens-a.jsx` into React Native:

```
<View flex:1 background:appBackground>
  <ScrollView contentContainerStyle={centered, padding 40px 20px}>
    <HeroAnimation />           {/* 4 concentric rings + pulse */}
    <Title />                   {/* "Protect your Orca positions" */}
    <Subtitle />                {/* Description text */}
    <ConnectButton />           {/* Primary CTA */}
    <FeatureList>               {/* 3 bullet rows */}
      <FeatureRow />
      <FeatureRow />
      <FeatureRow />
    </FeatureList>
  </ScrollView>
</View>
```

No `TabBar` — the connect screen is a stack route (`/connect`), not a tab.

### 4.2 Hero Animation

Four concentric rings, 120×120 container:

1. **Outer ring:** `borderWidth: 1`, `borderColor: rgba(255,255,255,0.06)`, `borderRadius: 999`
2. **Middle ring:** `borderWidth: 1`, `borderColor: rgba(255,255,255,0.10)`, `borderRadius: 999`
3. **Inner dashed ring:** `borderWidth: 1`, `borderColor: safe`, `borderStyle: 'dashed'`, `borderRadius: 999`
4. **Center dot:** `width: 12`, `height: 12`, `borderRadius: 999`, `backgroundColor: textPrimary`
5. **Pulse ring:** Animated `scale` 1 → 3.3 and `opacity` 0.35 → 0 over 3s, `repeatCount: 'infinite'`. Uses `Animated` from React Native.

### 4.3 Typography

| Element | Size | Weight | Color | Other |
|---------|------|--------|-------|-------|
| Title | 22 | 600 | textPrimary | letterSpacing: -0.02em |
| Subtitle | 14 | 400 | textSecondary | lineHeight: 1.5, maxWidth: 300 |
| Feature title | 13 | 600 | textPrimary | — |
| Feature desc | 12 | 400 | textTertiary | — |

### 4.4 Connect Button

- Style: `backgroundColor: textPrimary`, text color `#0A0E14` (inverse)
- Height: 48, `borderRadius: 12`
- Full width, `maxWidth: 320`
- Icon: Feather `credit-card` at 20px, gap 8px
- Disabled state: reduced opacity when `isConnecting`

### 4.5 Feature Bullets

Three rows, each:
- Check icon (16px, `safe` color)
- Title (13px, weight 600)
- Description (12px, `textTertiary`)

Content:
1. "Read-only by default" / "We only request signatures when you approve an exit."
2. "Debounced breach logic" / "Ignores 30–60s wicks so you don't exit on noise."
3. "Auditable receipts" / "Every action saved with tx hash and fills."

### 4.6 State Handling

The existing props interface is **unchanged**:

```ts
type Props = {
  platformCapabilities?: PlatformCapabilities | null;
  connectionOutcome?: ConnectionOutcome | null;
  isConnecting?: boolean;
  onSelectWallet?: (kind: WalletOptionKind) => void;
  onGoBack?: () => void;
};
```

- `isConnecting`: Replace button with `ActivityIndicator` centered in the button area
- `connectionOutcome`: Show error/warning banner above the connect button using the design's card style (`card` background, `border` border, appropriate tone color)
- `platformCapabilities`: Continue to use `buildWalletConnectViewModel` for filtering wallet options
- `onGoBack`: Show back arrow in top-left (Feather `chevron-left`, only when `onGoBack` is provided)

---

## 5. File Changes

| File | Change |
|------|--------|
| `packages/ui/src/design-system/colors.ts` | Add new semantic tokens |
| `packages/ui/src/design-system/typography.ts` | Add `fontFamily`, smaller sizes |
| `packages/ui/src/components/Icon.tsx` | **New** — Feather icon wrapper |
| `packages/ui/src/screens/WalletConnectScreen.tsx` | **Replace** — full rewrite |
| `packages/ui/src/screens/WalletConnectScreen.test.tsx` | **Update** — new selectors/assertions |
| `packages/ui/src/index.ts` | Export `Icon` component |

**No changes** to `apps/app/app/connect.tsx` or any route files.

---

## 6. Testing

- `WalletConnectScreen.test.tsx`: Update selectors and assertions for new layout elements (hero, title, feature rows, button)
- `WalletConnectionViewModel.test.ts`: No changes (logic unchanged)
- `colors.test.ts`: Add assertions for new tokens

---

## 7. Risk & Rollback

- Blast radius is isolated to one screen component
- Old color values remain exported for backward compatibility
- If issues arise, reverting is one file (`WalletConnectScreen.tsx`) plus test updates
- No changes to route files, navigation, or business logic

---

## 8. Out of Scope

- `TabBar` from the design — our app uses Expo Router `<Tabs>`
- `TopBar` from the design — the connect screen is simple enough without it
- `ScreenPositions`, `ScreenPositionSafe` from `screens-a.jsx` — deferred to a follow-up task
- All screens from `screens-b.jsx` — deferred indefinitely
- `react-native-svg` — we use Feather icons instead

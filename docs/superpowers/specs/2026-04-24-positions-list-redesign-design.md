# Positions List Screen Redesign — Design Spec

**Date:** 2026-04-24
**Scope:** Redesign `PositionsListScreen` with the new dark financial-terminal design system. Pure frontend work — no DTO/API changes.

---

## 1. Goal

Replace the current functional-but-plain positions list with the polished "CLMM Autopilot" card-based design. Establish reusable `Chip`, `PositionCard`, and `SectionHeader` components for future screens.

---

## 2. Design System (reused from connect screen)

The positions screen uses the same semantic tokens already added in the connect screen redesign:

### 2.1 Colors

| Token | Value | Usage |
|-------|-------|-------|
| `appBackground` | `#070A0F` | Screen background |
| `card` | `#0C1118` | Card surfaces |
| `safe` | `#9EECD1` | In-range status |
| `warn` | `#F4C97A` | Near edge / degraded |
| `breachAccent` | `#F59484` | Breach / alert |
| `textPrimary` | `#F4F6F8` | Primary text |
| `textBody` | `#B6C0CE` | Secondary text |
| `textTertiary` | `#7C8695` | Meta / labels |
| `textFaint` | `#4F5866` | Disabled |
| `border` | `rgba(255,255,255,0.06)` | Card borders |

### 2.2 Typography

Uses existing keys plus new design-system keys:
- `typography.fontSize.display` (22) — section headers
- `typography.fontSize.body` (14) — card body text
- `typography.fontSize.caption` (12) — meta labels
- `typography.fontSize.micro` (10) — small labels

---

## 3. Component Design

### 3.1 `Chip` (new reusable component)

A pill-shaped status badge with a colored dot.

**Props:**
```ts
type ChipTone = 'safe' | 'warn' | 'breach';
type Props = {
  tone: ChipTone;
  children: React.ReactNode;
};
```

**Styling:**
- Height: 24px
- Padding: 0 10px
- BorderRadius: 999 (pill)
- Border: 1px solid, color varies by tone
- Background: transparent (or subtle tinted background)
- Dot: 6px circle, colored by tone, with `boxShadow` glow for safe/breach
- Text: 11px, weight 600, color matches tone

| Tone | Text color | Border color | Dot color |
|------|-----------|--------------|-----------|
| `safe` | `colors.safe` | `rgba(158,236,209,0.30)` | `colors.safe` + glow |
| `warn` | `colors.warn` | `rgba(244,201,122,0.30)` | `colors.warn` |
| `breach` | `colors.breachAccent` | `rgba(245,148,132,0.30)` | `colors.breachAccent` + glow |

### 3.2 `SectionHeader` (new reusable component)

**Props:**
```ts
type Props = {
  title: string;
  meta?: string;
};
```

**Styling:**
- `display: flex`, `justifyContent: space-between`, `alignItems: baseline`
- Padding: 0 20px
- Margin: 22px 0 10px
- Title: 11px, uppercase, letterSpacing 0.08em, color `textTertiary`, weight 600
- Meta: 11px, color `textFaint`

### 3.3 `PositionCard` (new component)

**Props:**
```ts
type Props = {
  positionId: string;
  poolLabel: string;
  rangeStatusKind: 'in-range' | 'below-range' | 'above-range';
  hasAlert: boolean;
  monitoringLabel: string;
  onPress?: () => void;
};
```

**Layout:**
```
┌─────────────────────────────────────┐
│ [Chip]              [pulse] Status  │  ← row 1: status + monitoring
│                                     │
│ Pool 9Hs2…pLx7                      │  ← row 2: pool id
│ Monitoring Active                   │  ← row 3: monitoring label
└─────────────────────────────────────┘
```

**Styling:**
- Background: `colors.card`
- Border: 1px solid `colors.border`
- BorderRadius: 12
- Padding: 16px
- MarginBottom: 10

**Status mapping:**
| `rangeStatusKind` | `hasAlert` | Chip tone | Chip text | Pulse color |
|-------------------|-----------|-----------|-----------|-------------|
| `in-range` | any | `safe` | "In range" | `safe` |
| `below-range` | false | `warn` | "Near edge" | `warn` |
| `above-range` | false | `warn` | "Near edge" | `warn` |
| `below-range` | true | `breach` | "Breach" | `breachAccent` |
| `above-range` | true | `breach` | "Breach" | `breachAccent` |

**Monitoring indicator:**
- Pulse dot: 6px circle with `borderRadius: 999`
- Color: `safe` for active, `warn` for degraded, `textFaint` for inactive
- Text: "Live" / "Degraded" / "Inactive" (derived from `monitoringLabel`)

**Alert indicator:**
- Small red dot (8px, `colors.breachAccent`) in top-right corner if `hasAlert` is true

---

## 4. Screen Layout

### 4.1 `PositionsListScreen` rewrite

**Props (unchanged):**
```ts
type Props = {
  walletAddress?: string | null;
  positions?: PositionSummaryDto[] | undefined;
  positionsLoading?: boolean;
  positionsError?: string | null;
  onSelectPosition?: (positionId: string) => void;
  onConnectWallet?: () => void;
  platformCapabilities?: PlatformCapabilities | null;
};
```

**Layout structure:**
```
<View flex:1 background:appBackground>
  <ScrollView>
    <DegradedCapabilityBanner capabilities={platformCapabilities} />
    
    {!isConnected ? (
      <ConnectWalletEntry onConnectWallet={onConnectWallet} />
    ) : positionsLoading ? (
      <LoadingState />
    ) : positionsError && !hasPositions ? (
      <ErrorState error={positionsError} />
    ) : hasPositions ? (
      <>
        <SectionHeader
          title="Active positions"
          meta={`${positions.length} monitored`}
        />
        {positions.map((p) => (
          <PositionCard
            key={p.positionId}
            {...p}
            onPress={() => onSelectPosition?.(p.positionId)}
          />
        ))}
      </>
    ) : (
      <EmptyState />
    )}
  </ScrollView>
</View>
```

### 4.2 State designs

**Loading state:**
- Centered `ActivityIndicator` (color: `safe`)
- Text: "Loading supported Orca positions" (body, textPrimary, semibold)
- Subtext: "Checking this wallet for supported concentrated liquidity positions." (caption, textBody)

**Error state:**
- Centered text: "Could not load supported positions" (body, textPrimary, semibold)
- Subtext: error message (caption, textBody)

**Empty state:**
- Centered text: "No supported positions" (body, textPrimary, semibold)
- Subtext: "Connect a wallet with Orca CLMM positions to see them here." (caption, textBody)

---

## 5. View-Model Changes (minimal)

No DTO changes. Minor view-model enhancement:

**`buildPositionListViewModel`** stays the same. The new `PositionCard` consumes the existing `PositionListItemViewModel` fields directly.

One addition: derive `monitoringStatusText` from `monitoringLabel` for the pulse indicator:
- "Monitoring Active" → "Live"
- "Monitoring Degraded" → "Degraded"
- "Monitoring Inactive" → "Inactive"

This mapping lives in `PositionCard` (presentation layer), not the view-model.

---

## 6. File Changes

| File | Change |
|------|--------|
| `packages/ui/src/components/Chip.tsx` | **New** — pill status badge |
| `packages/ui/src/components/SectionHeader.tsx` | **New** — section header with title + meta |
| `packages/ui/src/components/PositionCard.tsx` | **New** — position card with chip + monitoring |
| `packages/ui/src/screens/PositionsListScreen.tsx` | **Replace** — full rewrite |
| `packages/ui/src/screens/PositionsListScreen.test.tsx` | **Update** — new selectors/assertions |
| `packages/ui/src/index.ts` | Export new components |

**No changes to:**
- `apps/app/app/(tabs)/positions.tsx` (route file)
- `packages/application/src/dto/index.ts` (DTOs)
- Any adapter or domain files

---

## 7. Testing

- `PositionsListScreen.test.tsx`: Update for new layout (cards instead of list rows)
- New tests for `Chip`: renders all tones correctly
- New tests for `PositionCard`: renders status chip, monitoring indicator, alert dot
- All existing view-model tests untouched

---

## 8. Risk & Rollback

- Blast radius: one screen + 3 new components
- `PositionsListScreen` is isolated (not shared)
- New components are additive (don't affect existing code)
- Rollback: revert `PositionsListScreen.tsx` + remove new component files

---

## 9. Out of Scope

- `PositionDetailScreen` (from `screens-a.jsx`) — separate task
- `RangeBar` visualization — requires price bound data not in DTO
- `PairGlyph` token icons — requires token symbols not in DTO
- Portfolio health strip — requires portfolio/fee data not in DTO
- `TabBar` redesign — owned by Expo Router
- Any DTO or API changes

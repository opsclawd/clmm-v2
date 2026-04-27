---
title: "UI Component Extraction and View-Model Restructuring for S/R Levels Display"
date: 2026-04-26
category: design-patterns
module: packages/ui
problem_type: design_pattern
component: development_workflow
severity: low
applies_when:
  - "Redesigning a screen section with complex presentation logic"
  - "A screen component grows beyond ~30 lines for a single subsection"
  - "View-model data shape does not match the desired UI layout"
  - "Presentation logic (sorting, tone computation, note formatting) is mixed with rendering"
tags:
  - ui-redesign
  - view-model
  - component-extraction
  - presentation-logic
  - design-system
---

# UI Component Extraction and View-Model Restructuring for S/R Levels Display

## Context

When redesigning the Support & Resistance (S/R) section on the Position Detail screen, the existing implementation was a simple text list with separate "Support" and "Resistance" subsection titles. The new design called for a card-based layout with:

- Tone-colored chips (`safe` / `warn` / `breach`) for each level
- Contextual notes (e.g., "Range upper · your position")
- Unified ascending sort across all levels (supports and resistances intermixed)
- A freshness header ("AI · MCO · 2h ago")

The initial approach rendered everything inline inside `PositionDetailScreen.tsx`, which quickly grew to ~90 lines of JSX and inline styles for this single subsection alone. This violated the repo's established pattern of keeping screens thin and delegating to focused presentational components.

## Guidance

### 1. Restructure the View-Model First

Move all presentation logic into the view-model layer before touching the screen component. The view-model should output data in the exact shape the UI needs.

**Before:**
```typescript
export type SrLevelsViewModelBlock = {
  supportsSorted: Array<{ priceLabel: string; rankLabel?: string }>;
  resistancesSorted: Array<{ priceLabel: string; rankLabel?: string }>;
  freshnessLabel: string;
  isStale: boolean;
};
```

**After:**
```typescript
export type SrLevelViewModel = {
  kind: 'support' | 'resistance';
  rawPrice: number; // for sorting
  priceLabel: string;
  note: string;
  tone: 'safe' | 'warn' | 'breach';
};

export type SrLevelsViewModelBlock = {
  levels: SrLevelViewModel[];
  freshnessLabel: string;
  isStale: boolean;
};
```

Compute in the view-model builder:
- **Tone** from price proximity and range bounds (`breach` if crossed, `warn` if near bound or within 5%, `safe` otherwise)
- **Notes** from a fallback hierarchy: DTO `notes` → bound match → `rank` → empty
- **Sorting** on raw numeric price before formatting

### 2. Extract a Presentational Component

When a screen section exceeds ~30 lines, extract it into a dedicated component in `packages/ui/src/components/`.

**Keep the component focused:**
- Accept the pre-computed view-model block as a prop
- Handle both present and absent states
- Keep tone-to-color mapping inside the component (not in the screen or design system)
- Use `testID` attributes for testability

```typescript
// SrLevelsCard.tsx
type Props = {
  srLevels?: SrLevelsViewModelBlock | undefined;
};

export function SrLevelsCard({ srLevels }: Props): JSX.Element {
  if (!srLevels) {
    return <Text>No current MCO levels available</Text>;
  }
  // render card with chips, prices, notes
}
```

### 3. Keep the Screen Thin

The screen component should only orchestrate:

```tsx
// PositionDetailScreen.tsx
<SrLevelsCard srLevels={vm.srLevels} />
```

No inline styles, no tone logic, no sorting — all of that lives in the view-model and the presentational component.

## Why This Matters

- **Testability:** View-model logic is unit-testable in isolation. Screen tests become focused integration tests.
- **Reusability:** A dedicated component can be reused if the same pattern appears elsewhere (e.g., a regime screen).
- **Maintainability:** Screens stay readable. Changes to S/R rendering touch one component, not a 300+ line screen file.
- **Type safety:** The `exactOptionalPropertyTypes` TypeScript setting means optional props must explicitly allow `undefined`: `srLevels?: SrLevelsViewModelBlock | undefined`.

## When to Apply

- A screen subsection grows beyond ~30 lines of JSX/styles
- Presentation logic (sorting, color mapping, note formatting) is mixed with rendering
- The view-model outputs a shape that forces the screen to do data transformation
- The same visual pattern might appear on multiple screens

## Examples

### Before (inline in screen, ~90 lines)

```tsx
{vm.srLevels ? (
  <View style={{ marginTop: 4 }}>
    <Text style={srStyles.sectionTitle}>Support & Resistance (MCO)</Text>
    <Text style={srStyles.subsectionTitle}>Support</Text>
    {vm.srLevels.supportsSorted.map((s, i) => (
      <Text key={`s-${i}`} style={srStyles.levelRow}>
        {s.priceLabel}{s.rankLabel ? ` (${s.rankLabel})` : ''}
      </Text>
    ))}
    <Text style={srStyles.subsectionTitle}>Resistance</Text>
    {/* ... more inline JSX ... */}
  </View>
) : (
  <Text style={srStyles.muted}>No current MCO levels available</Text>
)}
```

### After (thin screen, extracted component)

```tsx
// PositionDetailScreen.tsx — single line
<SrLevelsCard srLevels={vm.srLevels} />

// SrLevelsCard.tsx — focused presentational component
export function SrLevelsCard({ srLevels }: Props): JSX.Element {
  // ~90 lines of focused JSX, all S/R concerns in one place
}
```

### View-Model: Computing Tone and Notes

```typescript
function computeLevelTone(
  kind: 'support' | 'resistance',
  levelPrice: number,
  currentPrice: number,
  lowerBound: number,
  upperBound: number,
): 'safe' | 'warn' | 'breach' {
  if (kind === 'resistance') {
    if (currentPrice > levelPrice) return 'breach';
    if (isNearBound(levelPrice, upperBound)) return 'warn';
    if (isWithinProximity(currentPrice, levelPrice)) return 'warn';
    return 'safe';
  }
  if (currentPrice < levelPrice) return 'breach';
  if (isNearBound(levelPrice, lowerBound)) return 'warn';
  if (isWithinProximity(currentPrice, levelPrice)) return 'warn';
  return 'safe';
}
```

## Related

- `packages/ui/src/screens/PositionDetailScreen.tsx`
- `packages/ui/src/components/SrLevelsCard.tsx`
- `packages/ui/src/view-models/PositionDetailViewModel.ts`

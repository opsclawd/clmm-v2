---
title: UI component review patterns from positions list card redesign
date: 2026-05-05
category: best-practices
module: packages/ui
problem_type: best_practice
component: development_workflow
severity: medium
applies_when:
  - Building or reviewing React Native UI components that derive display state from view-model data
  - Adding chip/status indicators that depend on range predicates
  - Writing card components that consume view-model items
tags:
  - clmm
  - range-status
  - is-near-edge
  - ui-components
  - code-review
  - accessibility
  - type-safety
  - dead-code
  - unit-testing
---

# UI Component Review Patterns from Positions List Card Redesign

## Context

During ce:review of issue #67 (positions list card range redesign), multiple code quality issues were found across `PositionCardUtils.ts`, `PositionCard.tsx`, `PortfolioSummaryStrip.tsx`, and `PositionListViewModel.ts`. The review surfaced a latent logic bug (`isNearEdge`), misplaced derivation logic, type-safety gaps, dead view-model fields, and missing accessibility instrumentation — patterns that generalize to any UI component that derives display state from view-model data.

## Guidance

### 1. Range-dependent predicates must guard on in-range first

Any function computing a property conditional on in-range status must check in-range _before_ computing the property. `isNearEdge` checked proximity to bounds without verifying the current price was within the range, causing it to return `true` for prices entirely outside the range.

```ts
// WRONG — computes proximity without checking range membership
export function isNearEdge({
  currentPrice,
  lowerBoundPrice,
  upperBoundPrice,
}: NearEdgeInput): boolean {
  const width = upperBoundPrice - lowerBoundPrice;
  if (width <= 0) return false;
  const threshold = width * NEAR_EDGE_FRACTION;
  return currentPrice - lowerBoundPrice <= threshold || upperBoundPrice - currentPrice <= threshold;
}

// CORRECT — guard on range membership first
export function isNearEdge({
  currentPrice,
  lowerBoundPrice,
  upperBoundPrice,
}: NearEdgeInput): boolean {
  if (
    !Number.isFinite(currentPrice) ||
    !Number.isFinite(lowerBoundPrice) ||
    !Number.isFinite(upperBoundPrice)
  )
    return false;
  if (currentPrice < lowerBoundPrice || currentPrice > upperBoundPrice) return false;
  const width = upperBoundPrice - lowerBoundPrice;
  if (width <= 0) return false;
  const threshold = width * NEAR_EDGE_FRACTION;
  return currentPrice - lowerBoundPrice <= threshold || upperBoundPrice - currentPrice <= threshold;
}
```

### 2. Derived display logic belongs in utils, not components

Component files import from utils; they don't derive new business helpers inline. `breachSide` derivation was embedded in `PositionCard.tsx` instead of `PositionCardUtils.ts`. If a derivation is worth doing, it's worth testing in isolation.

```ts
// In PositionCardUtils.ts — testable, reusable
export function getBreachSide(
  hasAlert: boolean,
  rangeStatusKind: 'in-range' | 'below-range' | 'above-range',
): 'below' | 'above' | undefined {
  if (!hasAlert) return undefined;
  return rangeStatusKind === 'below-range' ? 'below' : 'above';
}
```

### 3. No non-null assertions on array indexing

Prefer `as const satisfies ReadonlyArray<T>` tuple + `?? fallback` over `[idx]!`. The fallback makes the default visible and the type narrower.

```ts
// WRONG — hides fallback intent
const DECK = [itemA, itemB, itemC];
return DECK[idx]!;

// CORRECT — explicit fallback, narrower type
const DECK = [itemA, itemB, itemC] as const satisfies ReadonlyArray<ItemType>;
return DECK[idx] ?? DECK[0];
```

### 4. Remove dead fields from view model types

View model types should contain only fields consumed by the screen that uses them. `PositionListItemViewModel` carried `feeRateLabel`, `rangeStatusLabel`, and `rangeDistanceLabel` that no list-screen code consumed (they were used by the detail screen's separate view model). Removing them from the list type and mapper reduces coupling and prevents future consumers from depending on stale fields.

Verify removal is safe by grepping for each field name in the consuming screen before deleting.

### 5. Interactive elements need testID + accessibilityRole

Every `TouchableOpacity`, `Pressable`, or button must carry `testID`, `accessibilityRole="button"`, and `accessibilityLabel`. Without these, agent tooling and screen readers cannot discover interactive elements.

```tsx
<TouchableOpacity
  testID={`position-card-${poolId}`}
  accessibilityRole="button"
  accessibilityLabel={`Position card for ${poolLabel}, ${chip.label}`}
  onPress={onPress}
>
```

### 6. Test coverage for derived helpers must cover all branches

`getBreachSide` has 5 branches (no alert → undefined, alert+below → 'below', alert+above → 'above', alert+in-range → 'above' fallback, plus the false case). All must be tested. Range predicates need out-of-range inputs on both sides plus just-outside-threshold boundary cases.

## Why This Matters

- **isNearEdge without guard** would have shown false near-edge badges for out-of-range positions — a silent UI state bug caught only in review
- **Derived logic in components** makes it untestable and scatters business rules across presentation files
- **Non-null assertions** hide fallback paths, making the code less safe under refactoring
- **Dead fields** increase coupling and confuse new contributors about what the type actually provides
- **Missing a11y props** make components invisible to automated testing and screen readers

## When to Apply

- When building or reviewing UI components that derive display state (chip labels, breach indicators, near-edge flags) from view-model data
- When adding status or range predicates that depend on in-range membership
- When writing card or list item components that consume view-model items
- When auditing view model types for fields that may have accumulated but are no longer consumed

## Examples

**Before (isNearEdge with latent bug):**

```ts
export function isNearEdge({
  currentPrice,
  lowerBoundPrice,
  upperBoundPrice,
}: NearEdgeInput): boolean {
  const width = upperBoundPrice - lowerBoundPrice;
  if (width <= 0) return false;
  const threshold = width * 0.1;
  return currentPrice - lowerBoundPrice <= threshold || upperBoundPrice - currentPrice <= threshold;
}
// isNearEdge({ currentPrice: 50, lowerBoundPrice: 100, upperBoundPrice: 200 }) → true (WRONG)
```

**After (guard-first pattern):**

```ts
export function isNearEdge({
  currentPrice,
  lowerBoundPrice,
  upperBoundPrice,
}: NearEdgeInput): boolean {
  if (
    !Number.isFinite(currentPrice) ||
    !Number.isFinite(lowerBoundPrice) ||
    !Number.isFinite(upperBoundPrice)
  )
    return false;
  if (currentPrice < lowerBoundPrice || currentPrice > upperBoundPrice) return false;
  const width = upperBoundPrice - lowerBoundPrice;
  if (width <= 0) return false;
  const threshold = width * 0.1;
  return currentPrice - lowerBoundPrice <= threshold || upperBoundPrice - currentPrice <= threshold;
}
// isNearEdge({ currentPrice: 50, lowerBoundPrice: 100, upperBoundPrice: 200 }) → false (CORRECT)
```

## Related

- `docs/solutions/best-practices/enriching-dtos-across-layers-2026-04-25.md` — DTO enrichment pipeline that feeds PositionCardUtils; may need refresh after issue #71 (typed monitoring status)
- `docs/solutions/best-practices/position-bound-fields-tick-to-price-migration-2026-05-04.md` — dead field detection pattern from tick-to-price migration; overlaps with dead field guidance here
- `docs/solutions/ui-bugs/connect-screen-extraction-regression-review-findings-2026-04-25.md` — refactor regression pattern (dropped guards during extraction); same "carry guards to correct layer" principle
- GitHub #71 — View-model contract: typed monitoring status + PositionCard props API
- GitHub #72 — Edge-case display: hasAlert+in-range chip + RangeBar non-finite fallback
- GitHub #73 — Placeholder data migration: real portfolio metrics, hash collisions, PairGlyph fallback

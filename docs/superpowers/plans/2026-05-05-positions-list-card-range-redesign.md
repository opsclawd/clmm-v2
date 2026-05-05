# Positions List Card And Range Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the connected `PositionsListScreen` to match issue #67 — add a portfolio summary strip, redesign each `PositionCard` with pair glyphs, truncated pool IDs, breach/near-edge chip variants, a new reusable `RangeBar`, placeholder TVL/Fees metrics, and reorder market context so Support & Resistance appears before Market Thesis below the cards.

**Architecture:** Pure UI work, all changes inside `packages/ui`. Two stable DTO-derived fields (`poolId`, `currentPrice`) are added to `PositionListItemViewModel`; everything else (chip mapping, near-edge, pool ID formatting, glyph splitter, monitoring text, placeholder TVL/Fees, portfolio total) lives as local pure helpers and presentation constants in the card/screen layer. The `MarketContextPanel` keeps its existing state machine — only the rendered order of `SrLevelsCard`/`MarketThesisCard` changes, and the panel moves below the cards via `ListFooterComponent`. No backend, DTO, domain, adapter, trigger, or directional-exit changes.

**Tech Stack:** TypeScript, React 19, React Native (web target via `react-native-web`), Vitest, `@testing-library/react`. Existing helpers live next to components as `<Component>Utils.ts` with sibling `*.test.ts` files (mirroring `WalletConnectionUtils`, `RangeStatusBadgeUtils`, etc.).

---

## File Structure

**New files:**

- `packages/ui/src/components/RangeBar.tsx` — reusable horizontal range bar (out-of-range shading, in-range band, current-price tick, three labels) consuming display-ready price-space props.
- `packages/ui/src/components/RangeBar.test.tsx` — visual/behavioral tests via testIDs and label text.
- `packages/ui/src/components/PairGlyph.tsx` — two overlapping `TokenGlyph` circles built from token symbols.
- `packages/ui/src/components/PortfolioSummaryStrip.tsx` — two-column "Portfolio" / "Fees earned" strip with placeholder values.
- `packages/ui/src/components/PositionCardUtils.ts` — pure helpers: `getStatusChipProps`, `isNearEdge`, `formatPoolId`, `splitTokenPair`, `getMonitoringDisplay`, `getCardPlaceholderMetrics`.
- `packages/ui/src/components/PositionCardUtils.test.ts` — unit tests for each helper.

**Modified files:**

- `packages/ui/src/view-models/PositionListViewModel.ts` — add `poolId` and `currentPrice` to `PositionListItemViewModel`.
- `packages/ui/src/view-models/PositionListViewModel.test.ts` — assertions for the two new fields.
- `packages/ui/src/components/PositionCard.tsx` — full layout rewrite consuming the new helpers + `RangeBar` + `PairGlyph`.
- `packages/ui/src/components/MarketContextPanel.tsx` — render `SrLevelsCard` before `MarketThesisCard`.
- `packages/ui/src/components/MarketContextPanel.test.tsx` — order assertion.
- `packages/ui/src/screens/PositionsListScreen.tsx` — add portfolio strip in `ListHeaderComponent`, move `MarketContextPanel` into `ListFooterComponent`, pass new view-model fields to `PositionCard`.
- `packages/ui/src/screens/PositionsListScreen.test.tsx` — new chip labels, summary strip assertions, section ordering.
- `packages/ui/src/index.ts` — export `RangeBar`, `PairGlyph`, `PortfolioSummaryStrip` (only as needed for app composition).

**Untouched (do not edit):** any file in `packages/domain`, `packages/application`, `packages/adapters`, `apps/app/api`, trigger qualification, exit policy.

---

## Task 1: Add `poolId` and `currentPrice` to the list view-model

These are stable DTO-derived fields needed by `PositionCard` (pool ID truncation, placeholder metric lookup, range-bar tick).

**Files:**

- Modify: `packages/ui/src/view-models/PositionListViewModel.ts`
- Test: `packages/ui/src/view-models/PositionListViewModel.test.ts`

- [ ] **Step 1: Write the failing test for the two new fields**

In `packages/ui/src/view-models/PositionListViewModel.test.ts`, add a test inside the existing `describe('buildPositionListViewModel', ...)` block:

```ts
it('exposes poolId and numeric currentPrice for card-layer consumers', () => {
  const vm = buildPositionListViewModel([
    makeSummaryDto({
      poolId: 'pool-xyz' as PositionSummaryDto['poolId'],
      currentPrice: 142.35,
    }),
  ]);
  const item = vm.items[0]!;

  expect(item.poolId).toBe('pool-xyz');
  expect(item.currentPrice).toBe(142.35);
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm --filter @clmm/ui test -- PositionListViewModel.test.ts`
Expected: FAIL — `item.poolId` is `undefined` (property does not exist).

- [ ] **Step 3: Add the fields to `PositionListItemViewModel` and the mapper**

In `packages/ui/src/view-models/PositionListViewModel.ts`, extend the type and the mapper:

```ts
export type PositionListItemViewModel = {
  positionId: string;
  poolId: string;
  poolLabel: string;
  currentPrice: number;
  currentPriceLabel: string;
  feeRateLabel: string;
  rangeStatusLabel: string;
  rangeStatusKind: 'in-range' | 'below-range' | 'above-range';
  rangeDistanceLabel: string;
  hasAlert: boolean;
  monitoringLabel: string;
  lowerBoundPrice: number;
  upperBoundPrice: number;
  lowerBoundLabel: string;
  upperBoundLabel: string;
};
```

In `buildPositionListViewModel`, populate the two new fields from the DTO:

```ts
const items: PositionListItemViewModel[] = positions.map((p) => ({
  positionId: p.positionId,
  poolId: p.poolId,
  poolLabel: p.tokenPairLabel,
  currentPrice: p.currentPrice,
  currentPriceLabel: p.currentPriceLabel ?? `Current: ${p.currentPrice}`,
  feeRateLabel: p.feeRateLabel ?? '',
  rangeStatusLabel: rangeStateLabel(p.rangeState),
  rangeStatusKind: p.rangeState,
  rangeDistanceLabel: rangeDistanceLabel(p.rangeDistance),
  hasAlert: p.hasActionableTrigger,
  monitoringLabel: monitoringLabel(p.monitoringStatus),
  lowerBoundPrice: p.lowerBoundPrice,
  upperBoundPrice: p.upperBoundPrice,
  lowerBoundLabel: p.lowerBoundLabel,
  upperBoundLabel: p.upperBoundLabel,
}));
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @clmm/ui test -- PositionListViewModel.test.ts`
Expected: PASS, including the existing `maps price-space bound fields from DTO` and `returns isEmpty true when list is empty` cases.

- [ ] **Step 5: Run typecheck to confirm consumers still compile**

Run: `pnpm --filter @clmm/ui typecheck`
Expected: PASS. (`PositionsListScreen` constructs items with the new fields automatically because we extended the mapper, and `PositionCard` does not yet read them.)

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/view-models/PositionListViewModel.ts packages/ui/src/view-models/PositionListViewModel.test.ts
git commit -m "feat(ui): expose poolId and currentPrice on PositionListItemViewModel"
```

---

## Task 2: Pure helpers — `splitTokenPair` and `formatPoolId`

These are display-only string helpers. We add them first because the chip and card both depend on them, and they have zero coupling to other helpers.

**Files:**

- Create: `packages/ui/src/components/PositionCardUtils.ts`
- Test: `packages/ui/src/components/PositionCardUtils.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/src/components/PositionCardUtils.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatPoolId, splitTokenPair } from './PositionCardUtils.js';

describe('splitTokenPair', () => {
  it('returns both symbols for a well-formed "A / B" label', () => {
    expect(splitTokenPair('SOL / USDC')).toEqual({ a: 'SOL', b: 'USDC' });
  });

  it('trims whitespace around symbols', () => {
    expect(splitTokenPair('  SOL  /  USDC ')).toEqual({ a: 'SOL', b: 'USDC' });
  });

  it('returns the whole label as `a` and empty `b` when no separator present', () => {
    expect(splitTokenPair('SOL-USDC')).toEqual({ a: 'SOL-USDC', b: '' });
  });

  it('returns empty pair for empty string', () => {
    expect(splitTokenPair('')).toEqual({ a: '', b: '' });
  });
});

describe('formatPoolId', () => {
  it('returns first-4 + ellipsis + last-4 for long IDs', () => {
    expect(formatPoolId('CzfqAaBbCcDdEeFfGgHh1234kkkk44zE')).toBe('Czfq…44zE');
  });

  it('returns the original string unchanged when it is already short enough', () => {
    expect(formatPoolId('Czfq44zE')).toBe('Czfq44zE');
  });

  it('returns an empty string for empty input', () => {
    expect(formatPoolId('')).toBe('');
  });

  it('returns the original string for non-string-like falsy input gracefully', () => {
    // Defensive: caller may pass undefined when DTO is malformed.
    expect(formatPoolId(undefined)).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm --filter @clmm/ui test -- PositionCardUtils.test.ts`
Expected: FAIL — module `./PositionCardUtils.js` does not exist.

- [ ] **Step 3: Implement `PositionCardUtils.ts` with the two helpers**

Create `packages/ui/src/components/PositionCardUtils.ts`:

```ts
export type TokenPair = { a: string; b: string };

export function splitTokenPair(label: string): TokenPair {
  if (!label) return { a: '', b: '' };
  const parts = label.split('/');
  if (parts.length < 2) return { a: label.trim(), b: '' };
  return { a: (parts[0] ?? '').trim(), b: (parts[1] ?? '').trim() };
}

const POOL_ID_HEAD = 4;
const POOL_ID_TAIL = 4;

export function formatPoolId(poolId: string | undefined | null): string {
  if (!poolId) return '';
  if (poolId.length <= POOL_ID_HEAD + POOL_ID_TAIL) return poolId;
  return `${poolId.slice(0, POOL_ID_HEAD)}…${poolId.slice(-POOL_ID_TAIL)}`;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `pnpm --filter @clmm/ui test -- PositionCardUtils.test.ts`
Expected: PASS for all four `splitTokenPair` cases and all four `formatPoolId` cases.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/PositionCardUtils.ts packages/ui/src/components/PositionCardUtils.test.ts
git commit -m "feat(ui): add splitTokenPair and formatPoolId helpers for position card"
```

---

## Task 3: Pure helper — `isNearEdge`

Computes whether a position is within 10% of the total range width from either bound. **Only meaningful for in-range positions.** Out-of-range positions and degenerate ranges (zero / negative / non-finite) must return `false`.

**Files:**

- Modify: `packages/ui/src/components/PositionCardUtils.ts`
- Test: `packages/ui/src/components/PositionCardUtils.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/ui/src/components/PositionCardUtils.test.ts`:

```ts
import { isNearEdge } from './PositionCardUtils.js';

describe('isNearEdge', () => {
  // Range: 100..200 → width 100, 10% threshold = 10.

  it('returns true when current price is within 10% of the lower bound', () => {
    expect(isNearEdge({ currentPrice: 105, lowerBoundPrice: 100, upperBoundPrice: 200 })).toBe(
      true,
    );
  });

  it('returns true when current price is within 10% of the upper bound', () => {
    expect(isNearEdge({ currentPrice: 195, lowerBoundPrice: 100, upperBoundPrice: 200 })).toBe(
      true,
    );
  });

  it('returns true exactly at the 10% boundary on the lower side', () => {
    expect(isNearEdge({ currentPrice: 110, lowerBoundPrice: 100, upperBoundPrice: 200 })).toBe(
      true,
    );
  });

  it('returns true exactly at the 10% boundary on the upper side', () => {
    expect(isNearEdge({ currentPrice: 190, lowerBoundPrice: 100, upperBoundPrice: 200 })).toBe(
      true,
    );
  });

  it('returns false when comfortably in the middle of the range', () => {
    expect(isNearEdge({ currentPrice: 150, lowerBoundPrice: 100, upperBoundPrice: 200 })).toBe(
      false,
    );
  });

  it('returns false when the range width is zero', () => {
    expect(isNearEdge({ currentPrice: 100, lowerBoundPrice: 100, upperBoundPrice: 100 })).toBe(
      false,
    );
  });

  it('returns false when the range width is negative (inverted bounds)', () => {
    expect(isNearEdge({ currentPrice: 150, lowerBoundPrice: 200, upperBoundPrice: 100 })).toBe(
      false,
    );
  });

  it('returns false when any input is non-finite', () => {
    expect(
      isNearEdge({ currentPrice: Number.NaN, lowerBoundPrice: 100, upperBoundPrice: 200 }),
    ).toBe(false);
    expect(
      isNearEdge({
        currentPrice: 150,
        lowerBoundPrice: Number.POSITIVE_INFINITY,
        upperBoundPrice: 200,
      }),
    ).toBe(false);
    expect(
      isNearEdge({
        currentPrice: 150,
        lowerBoundPrice: 100,
        upperBoundPrice: Number.NEGATIVE_INFINITY,
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm --filter @clmm/ui test -- PositionCardUtils.test.ts`
Expected: FAIL — `isNearEdge` is not exported.

- [ ] **Step 3: Implement `isNearEdge`**

Append to `packages/ui/src/components/PositionCardUtils.ts`:

```ts
export type NearEdgeInput = {
  currentPrice: number;
  lowerBoundPrice: number;
  upperBoundPrice: number;
};

const NEAR_EDGE_FRACTION = 0.1;

export function isNearEdge({
  currentPrice,
  lowerBoundPrice,
  upperBoundPrice,
}: NearEdgeInput): boolean {
  if (
    !Number.isFinite(currentPrice) ||
    !Number.isFinite(lowerBoundPrice) ||
    !Number.isFinite(upperBoundPrice)
  ) {
    return false;
  }
  const width = upperBoundPrice - lowerBoundPrice;
  if (width <= 0) return false;
  const threshold = width * NEAR_EDGE_FRACTION;
  return currentPrice - lowerBoundPrice <= threshold || upperBoundPrice - currentPrice <= threshold;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `pnpm --filter @clmm/ui test -- PositionCardUtils.test.ts`
Expected: PASS — all 8 `isNearEdge` cases.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/PositionCardUtils.ts packages/ui/src/components/PositionCardUtils.test.ts
git commit -m "feat(ui): add isNearEdge threshold helper for position card status"
```

---

## Task 4: Pure helper — `getStatusChipProps`

Maps `(rangeStatusKind, hasAlert, isNearEdge)` to the chip tone + label exactly per the spec table.

**Files:**

- Modify: `packages/ui/src/components/PositionCardUtils.ts`
- Test: `packages/ui/src/components/PositionCardUtils.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/ui/src/components/PositionCardUtils.test.ts`:

```ts
import { getStatusChipProps } from './PositionCardUtils.js';

describe('getStatusChipProps', () => {
  it('returns breach · below for hasAlert + below-range', () => {
    expect(
      getStatusChipProps({ rangeStatusKind: 'below-range', hasAlert: true, nearEdge: false }),
    ).toEqual({ tone: 'breach', label: 'Breach · below' });
  });

  it('returns breach · above for hasAlert + above-range', () => {
    expect(
      getStatusChipProps({ rangeStatusKind: 'above-range', hasAlert: true, nearEdge: false }),
    ).toEqual({ tone: 'breach', label: 'Breach · above' });
  });

  it('returns Near edge for in-range positions near a bound', () => {
    expect(
      getStatusChipProps({ rangeStatusKind: 'in-range', hasAlert: false, nearEdge: true }),
    ).toEqual({ tone: 'warn', label: 'Near edge' });
  });

  it('returns In range for in-range positions not near any bound', () => {
    expect(
      getStatusChipProps({ rangeStatusKind: 'in-range', hasAlert: false, nearEdge: false }),
    ).toEqual({ tone: 'safe', label: 'In range' });
  });

  it('returns Below range when below-range without alert (no Near edge)', () => {
    expect(
      getStatusChipProps({ rangeStatusKind: 'below-range', hasAlert: false, nearEdge: true }),
    ).toEqual({ tone: 'warn', label: 'Below range' });
  });

  it('returns Above range when above-range without alert (no Near edge)', () => {
    expect(
      getStatusChipProps({ rangeStatusKind: 'above-range', hasAlert: false, nearEdge: true }),
    ).toEqual({ tone: 'warn', label: 'Above range' });
  });

  it('prefers breach over near-edge when an alert is present on an out-of-range position', () => {
    expect(
      getStatusChipProps({ rangeStatusKind: 'below-range', hasAlert: true, nearEdge: true }),
    ).toEqual({ tone: 'breach', label: 'Breach · below' });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm --filter @clmm/ui test -- PositionCardUtils.test.ts`
Expected: FAIL — `getStatusChipProps` is not exported.

- [ ] **Step 3: Implement `getStatusChipProps`**

Append to `packages/ui/src/components/PositionCardUtils.ts`:

```ts
export type StatusChipProps = {
  tone: 'safe' | 'warn' | 'breach';
  label: string;
};

export type StatusChipInput = {
  rangeStatusKind: 'in-range' | 'below-range' | 'above-range';
  hasAlert: boolean;
  nearEdge: boolean;
};

export function getStatusChipProps({
  rangeStatusKind,
  hasAlert,
  nearEdge,
}: StatusChipInput): StatusChipProps {
  if (hasAlert && rangeStatusKind === 'below-range') {
    return { tone: 'breach', label: 'Breach · below' };
  }
  if (hasAlert && rangeStatusKind === 'above-range') {
    return { tone: 'breach', label: 'Breach · above' };
  }
  if (rangeStatusKind === 'in-range') {
    return nearEdge ? { tone: 'warn', label: 'Near edge' } : { tone: 'safe', label: 'In range' };
  }
  if (rangeStatusKind === 'below-range') {
    return { tone: 'warn', label: 'Below range' };
  }
  return { tone: 'warn', label: 'Above range' };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `pnpm --filter @clmm/ui test -- PositionCardUtils.test.ts`
Expected: PASS — all 7 `getStatusChipProps` cases.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/PositionCardUtils.ts packages/ui/src/components/PositionCardUtils.test.ts
git commit -m "feat(ui): add getStatusChipProps mapping for redesigned position chip"
```

---

## Task 5: Pure helpers — `getMonitoringDisplay` and `getCardPlaceholderMetrics`

`getMonitoringDisplay` consolidates the existing inline mapping (`Monitoring Active` → `Live`, etc.) into one helper that returns `{ text, dotColor }`.
`getCardPlaceholderMetrics` returns deterministic local placeholder TVL / Fees-24h labels keyed by `poolId` so unit tests are stable.

**Files:**

- Modify: `packages/ui/src/components/PositionCardUtils.ts`
- Test: `packages/ui/src/components/PositionCardUtils.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/ui/src/components/PositionCardUtils.test.ts`:

```ts
import { getCardPlaceholderMetrics, getMonitoringDisplay } from './PositionCardUtils.js';

describe('getMonitoringDisplay', () => {
  it('maps the active label to Live with the safe tone color', () => {
    const r = getMonitoringDisplay('Monitoring Active');
    expect(r.text).toBe('Live');
    expect(r.tone).toBe('safe');
  });

  it('maps the degraded label to Degraded with the warn tone color', () => {
    const r = getMonitoringDisplay('Monitoring Degraded');
    expect(r.text).toBe('Degraded');
    expect(r.tone).toBe('warn');
  });

  it('falls back to Inactive with a faint tone for any other input', () => {
    const r = getMonitoringDisplay('Monitoring Inactive');
    expect(r.text).toBe('Inactive');
    expect(r.tone).toBe('faint');

    const u = getMonitoringDisplay('totally unknown');
    expect(u.text).toBe('Inactive');
    expect(u.tone).toBe('faint');
  });
});

describe('getCardPlaceholderMetrics', () => {
  it('returns the same metrics for the same poolId on repeated calls (deterministic)', () => {
    const a = getCardPlaceholderMetrics('pool-1');
    const b = getCardPlaceholderMetrics('pool-1');
    expect(a).toEqual(b);
  });

  it('returns shapes that look like USD-formatted strings', () => {
    const r = getCardPlaceholderMetrics('any-pool-id');
    expect(r.tvlLabel).toMatch(/^\$/);
    expect(r.fees24hLabel).toMatch(/^\+\$/);
  });

  it('returns deterministic fallback labels for unknown pool ids', () => {
    const r = getCardPlaceholderMetrics('definitely-not-known-7e7e');
    expect(typeof r.tvlLabel).toBe('string');
    expect(typeof r.fees24hLabel).toBe('string');
    expect(r.tvlLabel.length).toBeGreaterThan(0);
    expect(r.fees24hLabel.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm --filter @clmm/ui test -- PositionCardUtils.test.ts`
Expected: FAIL — neither helper is exported.

- [ ] **Step 3: Implement both helpers**

Append to `packages/ui/src/components/PositionCardUtils.ts`:

```ts
export type MonitoringTone = 'safe' | 'warn' | 'faint';
export type MonitoringDisplay = { text: string; tone: MonitoringTone };

export function getMonitoringDisplay(monitoringLabel: string): MonitoringDisplay {
  if (monitoringLabel === 'Monitoring Active') return { text: 'Live', tone: 'safe' };
  if (monitoringLabel === 'Monitoring Degraded') return { text: 'Degraded', tone: 'warn' };
  return { text: 'Inactive', tone: 'faint' };
}

export type CardPlaceholderMetrics = { tvlLabel: string; fees24hLabel: string };

const CARD_PLACEHOLDER_FALLBACKS: ReadonlyArray<CardPlaceholderMetrics> = [
  { tvlLabel: '$8,420.19', fees24hLabel: '+$12.40' },
  { tvlLabel: '$6,220.00', fees24hLabel: '+$4.82' },
  { tvlLabel: '$3,105.77', fees24hLabel: '+$1.95' },
];

function hashStringToIndex(input: string, modulo: number): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h % modulo;
}

export function getCardPlaceholderMetrics(poolId: string): CardPlaceholderMetrics {
  const idx = hashStringToIndex(poolId || '', CARD_PLACEHOLDER_FALLBACKS.length);
  return CARD_PLACEHOLDER_FALLBACKS[idx]!;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `pnpm --filter @clmm/ui test -- PositionCardUtils.test.ts`
Expected: PASS for all `getMonitoringDisplay` and `getCardPlaceholderMetrics` cases.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/PositionCardUtils.ts packages/ui/src/components/PositionCardUtils.test.ts
git commit -m "feat(ui): add monitoring + placeholder metric helpers for position card"
```

---

## Task 6: `RangeBar` reusable component

Renders an out-of-range/in-range track with a current-price tick and three labels (lower / current / upper) below. Consumes display-ready price-space props — never re-derives tick-to-price values.

**Files:**

- Create: `packages/ui/src/components/RangeBar.tsx`
- Test: `packages/ui/src/components/RangeBar.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/src/components/RangeBar.test.tsx`:

```tsx
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RangeBar } from './RangeBar.js';

afterEach(() => {
  cleanup();
});

describe('RangeBar', () => {
  it('renders the lower, current, and upper labels exactly as provided', () => {
    render(
      <RangeBar
        lowerBoundPrice={100}
        upperBoundPrice={200}
        currentPrice={150}
        lowerBoundLabel="USDC 100.00"
        upperBoundLabel="USDC 200.00"
        currentPriceLabel="USDC 150.00"
      />,
    );

    expect(screen.getByText('USDC 100.00')).toBeTruthy();
    expect(screen.getByText('USDC 200.00')).toBeTruthy();
    expect(screen.getByText('USDC 150.00')).toBeTruthy();
  });

  it('renders the tick element with testID when current price is well inside the visual domain', () => {
    render(
      <RangeBar
        lowerBoundPrice={100}
        upperBoundPrice={200}
        currentPrice={150}
        lowerBoundLabel="100"
        upperBoundLabel="200"
        currentPriceLabel="150"
      />,
    );

    expect(screen.getByTestId('range-bar-tick')).toBeTruthy();
  });

  it('still renders the tick when current price is far outside the visual domain (clamped)', () => {
    render(
      <RangeBar
        lowerBoundPrice={100}
        upperBoundPrice={200}
        currentPrice={1_000_000}
        lowerBoundLabel="100"
        upperBoundLabel="200"
        currentPriceLabel="1,000,000"
        breachSide="above"
      />,
    );

    expect(screen.getByTestId('range-bar-tick')).toBeTruthy();
    expect(screen.getByText('1,000,000')).toBeTruthy();
  });

  it('renders breach styling testID when breachSide is provided', () => {
    render(
      <RangeBar
        lowerBoundPrice={100}
        upperBoundPrice={200}
        currentPrice={250}
        lowerBoundLabel="100"
        upperBoundLabel="200"
        currentPriceLabel="250"
        breachSide="above"
      />,
    );

    expect(screen.getByTestId('range-bar-breach-above')).toBeTruthy();
  });

  it('does not render breach decoration when breachSide is undefined', () => {
    render(
      <RangeBar
        lowerBoundPrice={100}
        upperBoundPrice={200}
        currentPrice={150}
        lowerBoundLabel="100"
        upperBoundLabel="200"
        currentPriceLabel="150"
      />,
    );

    expect(screen.queryByTestId('range-bar-breach-above')).toBeNull();
    expect(screen.queryByTestId('range-bar-breach-below')).toBeNull();
  });

  it('renders labels without crashing when bounds collapse to a single point', () => {
    render(
      <RangeBar
        lowerBoundPrice={100}
        upperBoundPrice={100}
        currentPrice={100}
        lowerBoundLabel="100"
        upperBoundLabel="100"
        currentPriceLabel="100"
      />,
    );

    // Three identical labels, all rendered.
    expect(screen.getAllByText('100').length).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm --filter @clmm/ui test -- RangeBar.test.tsx`
Expected: FAIL — module `./RangeBar.js` does not exist.

- [ ] **Step 3: Implement `RangeBar.tsx`**

Create `packages/ui/src/components/RangeBar.tsx`:

```tsx
import { View, Text } from 'react-native';
import { colors, typography } from '../design-system/index.js';

export type RangeBarProps = {
  lowerBoundPrice: number;
  upperBoundPrice: number;
  currentPrice: number;
  lowerBoundLabel: string;
  upperBoundLabel: string;
  currentPriceLabel: string;
  breachSide?: 'below' | 'above';
};

const VISUAL_PAD_FRACTION = 0.35;
const TRACK_HEIGHT = 10;
const TICK_WIDTH = 2;
const TICK_HEIGHT = 22;

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function pricePercent(price: number, lo: number, hi: number): number {
  if (!Number.isFinite(price) || !Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) {
    return 50;
  }
  return clampPercent(((price - lo) / (hi - lo)) * 100);
}

export function RangeBar({
  lowerBoundPrice,
  upperBoundPrice,
  currentPrice,
  lowerBoundLabel,
  upperBoundLabel,
  currentPriceLabel,
  breachSide,
}: RangeBarProps): JSX.Element {
  const width = upperBoundPrice - lowerBoundPrice;
  const safeWidth = width > 0 ? width : 1;
  const pad = safeWidth * VISUAL_PAD_FRACTION;
  const lo = lowerBoundPrice - pad;
  const hi = upperBoundPrice + pad;

  const bandLeft = pricePercent(lowerBoundPrice, lo, hi);
  const bandRight = pricePercent(upperBoundPrice, lo, hi);
  const tickLeft = pricePercent(currentPrice, lo, hi);

  const tickColor = breachSide ? colors.breachAccent : colors.textPrimary;

  return (
    <View style={{ paddingTop: 8, paddingBottom: 32, paddingHorizontal: 4 }}>
      <View style={{ position: 'relative', height: TRACK_HEIGHT }}>
        {/* base track */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: 'rgba(255,255,255,0.05)',
            borderRadius: 999,
          }}
        />
        {/* out-of-range left */}
        <View
          testID={breachSide === 'below' ? 'range-bar-breach-below' : undefined}
          style={{
            position: 'absolute',
            left: 0,
            width: `${bandLeft}%`,
            top: 0,
            bottom: 0,
            backgroundColor:
              breachSide === 'below' ? 'rgba(245,148,132,0.30)' : 'rgba(245,148,132,0.12)',
            borderTopLeftRadius: 999,
            borderBottomLeftRadius: 999,
          }}
        />
        {/* out-of-range right */}
        <View
          testID={breachSide === 'above' ? 'range-bar-breach-above' : undefined}
          style={{
            position: 'absolute',
            right: 0,
            width: `${100 - bandRight}%`,
            top: 0,
            bottom: 0,
            backgroundColor:
              breachSide === 'above' ? 'rgba(245,148,132,0.30)' : 'rgba(245,148,132,0.12)',
            borderTopRightRadius: 999,
            borderBottomRightRadius: 999,
          }}
        />
        {/* in-range band */}
        <View
          style={{
            position: 'absolute',
            left: `${bandLeft}%`,
            width: `${Math.max(0, bandRight - bandLeft)}%`,
            top: 0,
            bottom: 0,
            backgroundColor: 'rgba(158,236,209,0.18)',
            borderLeftWidth: 1,
            borderRightWidth: 1,
            borderColor: colors.borderMedium,
          }}
        />
        {/* current tick */}
        <View
          testID="range-bar-tick"
          style={{
            position: 'absolute',
            left: `${tickLeft}%`,
            top: -6,
            width: TICK_WIDTH,
            height: TICK_HEIGHT,
            backgroundColor: tickColor,
            borderRadius: 2,
            transform: [{ translateX: -TICK_WIDTH / 2 }],
          }}
        />
      </View>

      {/* labels under track */}
      <View
        style={{
          position: 'relative',
          marginTop: 12,
          height: 14,
        }}
      >
        <Text
          style={{
            position: 'absolute',
            left: `${bandLeft}%`,
            transform: [{ translateX: -20 }],
            fontFamily: typography.fontFamily.mono,
            fontSize: typography.fontSize.micro,
            color: colors.textTertiary,
          }}
        >
          {lowerBoundLabel}
        </Text>
        <Text
          style={{
            position: 'absolute',
            left: `${tickLeft}%`,
            transform: [{ translateX: -20 }],
            fontFamily: typography.fontFamily.mono,
            fontSize: typography.fontSize.micro,
            color: breachSide ? colors.breachAccent : colors.textPrimary,
            fontWeight: typography.fontWeight.semibold,
          }}
        >
          {currentPriceLabel}
        </Text>
        <Text
          style={{
            position: 'absolute',
            left: `${bandRight}%`,
            transform: [{ translateX: -20 }],
            fontFamily: typography.fontFamily.mono,
            fontSize: typography.fontSize.micro,
            color: colors.textTertiary,
          }}
        >
          {upperBoundLabel}
        </Text>
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `pnpm --filter @clmm/ui test -- RangeBar.test.tsx`
Expected: PASS for all 6 `RangeBar` cases.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/RangeBar.tsx packages/ui/src/components/RangeBar.test.tsx
git commit -m "feat(ui): add reusable RangeBar component for position cards"
```

---

## Task 7: `PairGlyph` atom

Two overlapping circular `TokenGlyph`s built from token symbols. Pure display, no token-brand assets.

**Files:**

- Create: `packages/ui/src/components/PairGlyph.tsx`

- [ ] **Step 1: Implement `PairGlyph.tsx`**

Create `packages/ui/src/components/PairGlyph.tsx`:

```tsx
import { View, Text } from 'react-native';
import { colors, typography } from '../design-system/index.js';

type TokenGlyphProps = {
  symbol: string;
  size: number;
  tint?: string;
};

function TokenGlyph({ symbol, size, tint }: TokenGlyphProps): JSX.Element {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1,
        borderColor: colors.borderMedium,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: tint ?? colors.textBody,
          fontFamily: typography.fontFamily.mono,
          fontSize: size * 0.36,
          fontWeight: typography.fontWeight.semibold,
        }}
      >
        {symbol.slice(0, 3)}
      </Text>
    </View>
  );
}

export type PairGlyphProps = {
  a: string;
  b: string;
  size?: number;
};

export function PairGlyph({ a, b, size = 28 }: PairGlyphProps): JSX.Element {
  return (
    <View
      style={{
        position: 'relative',
        width: size * 1.55,
        height: size,
      }}
    >
      <View style={{ position: 'absolute', left: 0, top: 0 }}>
        <TokenGlyph symbol={a} size={size} tint={colors.safe} />
      </View>
      <View style={{ position: 'absolute', left: size * 0.55, top: 0 }}>
        <TokenGlyph symbol={b} size={size} tint={colors.accent} />
      </View>
    </View>
  );
}
```

No dedicated test — its rendering is covered by `PositionsListScreen.test.tsx` (token symbols appear as text).

- [ ] **Step 2: Verify the file compiles**

Run: `pnpm --filter @clmm/ui typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/PairGlyph.tsx
git commit -m "feat(ui): add PairGlyph token-pair display atom"
```

---

## Task 8: `PortfolioSummaryStrip` component

Two-card strip rendered above the active positions list. Values are local presentation constants per the spec (must NOT enter view models or DTOs).

**Files:**

- Create: `packages/ui/src/components/PortfolioSummaryStrip.tsx`

- [ ] **Step 1: Implement `PortfolioSummaryStrip.tsx`**

Create `packages/ui/src/components/PortfolioSummaryStrip.tsx`:

```tsx
import { View, Text } from 'react-native';
import { colors, typography } from '../design-system/index.js';

const PORTFOLIO_VALUE = '$24,812';
const FEES_EARNED_VALUE = '+$142.30';

function SummaryCard({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor: string;
}): JSX.Element {
  return (
    <View
      style={{
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: colors.card,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.borderLight,
      }}
    >
      <Text
        style={{
          fontSize: typography.fontSize.micro,
          textTransform: 'uppercase',
          letterSpacing: 0.08 * typography.fontSize.micro,
          color: colors.textTertiary,
          fontWeight: typography.fontWeight.semibold,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: typography.fontFamily.mono,
          fontSize: 17,
          marginTop: 2,
          color: valueColor,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export function PortfolioSummaryStrip(): JSX.Element {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 20,
        paddingTop: 14,
        paddingBottom: 4,
      }}
    >
      <SummaryCard label="Portfolio" value={PORTFOLIO_VALUE} valueColor={colors.textPrimary} />
      <SummaryCard label="Fees earned" value={FEES_EARNED_VALUE} valueColor={colors.safe} />
    </View>
  );
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `pnpm --filter @clmm/ui typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/PortfolioSummaryStrip.tsx
git commit -m "feat(ui): add PortfolioSummaryStrip with placeholder portfolio values"
```

---

## Task 9: Reorder `MarketContextPanel` so SR appears before Market Thesis

Smallest possible change — keep all loading/error/unavailable/mixed-pool/cached/degraded behavior, only flip the rendered order in the populated branch.

**Files:**

- Modify: `packages/ui/src/components/MarketContextPanel.tsx`
- Test: `packages/ui/src/components/MarketContextPanel.test.tsx`

- [ ] **Step 1: Write the failing ordering test**

Append to the `describe('MarketContextPanel', ...)` block in `packages/ui/src/components/MarketContextPanel.test.tsx`:

```tsx
it('renders Support & Resistance before Market Thesis when both are present', () => {
  const { container } = render(
    <MarketContextPanel
      srLevels={fixtureBlock()}
      isLoading={false}
      isError={false}
      isUnsupported={false}
      isMixedPools={false}
      poolLabel={null}
      now={fixtureBlock().capturedAtUnixMs + 5 * 60_000}
    />,
  );

  const text = container.textContent ?? '';
  const srIndex = text.indexOf('Support & Resistance');
  const thesisIndex = text.indexOf('Market Thesis');
  expect(srIndex).toBeGreaterThan(-1);
  expect(thesisIndex).toBeGreaterThan(-1);
  expect(srIndex).toBeLessThan(thesisIndex);
});
```

- [ ] **Step 2: Run tests to confirm the new test fails**

Run: `pnpm --filter @clmm/ui test -- MarketContextPanel.test.tsx`
Expected: FAIL on the ordering case (`srIndex` is currently greater than `thesisIndex`). All other cases PASS.

- [ ] **Step 3: Flip the rendering order in `MarketContextPanel.tsx`**

In `packages/ui/src/components/MarketContextPanel.tsx`, replace this block:

```tsx
{
  vm.summary ? <MarketThesisCard summary={vm.summary} /> : null;
}
<SrLevelsCard srLevels={vm} />;
```

with:

```tsx
<SrLevelsCard srLevels={vm} />;
{
  vm.summary ? <MarketThesisCard summary={vm.summary} /> : null;
}
```

Do NOT touch any other branch (`isMixedPools`, `isUnsupported`, `isLoading`, `srLevels == null`, the degraded text). The change is mechanical and minimal.

- [ ] **Step 4: Run tests to confirm they pass**

Run: `pnpm --filter @clmm/ui test -- MarketContextPanel.test.tsx`
Expected: PASS for all cases including the new ordering one.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/MarketContextPanel.tsx packages/ui/src/components/MarketContextPanel.test.tsx
git commit -m "refactor(ui): render SrLevelsCard before MarketThesisCard in market panel"
```

---

## Task 10: Rewrite `PositionCard` layout

Replaces the current chip+monitoring/pool/price/fee-rate layout with the issue #67 design: pair glyph + truncated pool ID up top, status chip on the right, `RangeBar` in the middle, three-column footer (TVL · Fees 24h · Monitor). All status logic flows through the new helpers.

**Files:**

- Modify: `packages/ui/src/components/PositionCard.tsx`

- [ ] **Step 1: Replace the contents of `PositionCard.tsx`**

Overwrite `packages/ui/src/components/PositionCard.tsx` with:

```tsx
import { View, Text, TouchableOpacity } from 'react-native';
import { colors, typography } from '../design-system/index.js';
import { Chip } from './Chip.js';
import { PairGlyph } from './PairGlyph.js';
import { RangeBar } from './RangeBar.js';
import {
  formatPoolId,
  getCardPlaceholderMetrics,
  getMonitoringDisplay,
  getStatusChipProps,
  isNearEdge,
  splitTokenPair,
} from './PositionCardUtils.js';

type Props = {
  poolId: string;
  poolLabel: string;
  currentPrice: number;
  currentPriceLabel: string;
  lowerBoundPrice: number;
  upperBoundPrice: number;
  lowerBoundLabel: string;
  upperBoundLabel: string;
  rangeStatusKind: 'in-range' | 'below-range' | 'above-range';
  hasAlert: boolean;
  monitoringLabel: string;
  onPress?: () => void;
};

function monitoringDotColor(tone: 'safe' | 'warn' | 'faint'): string {
  if (tone === 'safe') return colors.safe;
  if (tone === 'warn') return colors.warn;
  return colors.textFaint;
}

export function PositionCard({
  poolId,
  poolLabel,
  currentPrice,
  currentPriceLabel,
  lowerBoundPrice,
  upperBoundPrice,
  lowerBoundLabel,
  upperBoundLabel,
  rangeStatusKind,
  hasAlert,
  monitoringLabel,
  onPress,
}: Props): JSX.Element {
  const tokens = splitTokenPair(poolLabel);
  const truncatedPoolId = formatPoolId(poolId);
  const nearEdge = isNearEdge({ currentPrice, lowerBoundPrice, upperBoundPrice });
  const chip = getStatusChipProps({ rangeStatusKind, hasAlert, nearEdge });
  const monitoring = getMonitoringDisplay(monitoringLabel);
  const placeholders = getCardPlaceholderMetrics(poolId);

  const breachSide: 'below' | 'above' | undefined = hasAlert
    ? rangeStatusKind === 'below-range'
      ? 'below'
      : rangeStatusKind === 'above-range'
        ? 'above'
        : undefined
    : undefined;

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
      {/* Top row: pair glyph + label + pool id, chip on the right */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <PairGlyph a={tokens.a} b={tokens.b} size={30} />
          <View>
            <Text
              style={{
                fontWeight: typography.fontWeight.semibold,
                fontSize: typography.fontSize.md,
                color: colors.textPrimary,
                letterSpacing: -0.01 * typography.fontSize.md,
              }}
            >
              {poolLabel}
            </Text>
            <Text
              style={{
                fontFamily: typography.fontFamily.mono,
                fontSize: 11,
                color: colors.textTertiary,
              }}
            >
              {truncatedPoolId}
            </Text>
          </View>
        </View>
        <Chip tone={chip.tone}>{chip.label}</Chip>
      </View>

      {/* Range bar */}
      <RangeBar
        lowerBoundPrice={lowerBoundPrice}
        upperBoundPrice={upperBoundPrice}
        currentPrice={currentPrice}
        lowerBoundLabel={lowerBoundLabel}
        upperBoundLabel={upperBoundLabel}
        currentPriceLabel={currentPriceLabel}
        {...(breachSide ? { breachSide } : {})}
      />

      {/* Bottom row: TVL · Fees 24h · Monitor */}
      <View
        style={{
          flexDirection: 'row',
          marginTop: 4,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: 0.08,
              color: colors.textTertiary,
              fontWeight: typography.fontWeight.semibold,
            }}
          >
            TVL
          </Text>
          <Text
            style={{
              fontFamily: typography.fontFamily.mono,
              fontSize: 14,
              marginTop: 2,
              color: colors.textPrimary,
            }}
          >
            {placeholders.tvlLabel}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: 0.08,
              color: colors.textTertiary,
              fontWeight: typography.fontWeight.semibold,
            }}
          >
            Fees 24h
          </Text>
          <Text
            style={{
              fontFamily: typography.fontFamily.mono,
              fontSize: 14,
              marginTop: 2,
              color: colors.safe,
            }}
          >
            {placeholders.fees24hLabel}
          </Text>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: 0.08,
              color: colors.textTertiary,
              fontWeight: typography.fontWeight.semibold,
            }}
          >
            Monitor
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                backgroundColor: monitoringDotColor(monitoring.tone),
                marginRight: 5,
              }}
            />
            <Text
              style={{
                fontSize: typography.fontSize.caption,
                color: colors.textBody,
              }}
            >
              {monitoring.text}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}
```

- [ ] **Step 2: Run typecheck — `PositionsListScreen` will fail because the prop signature changed**

Run: `pnpm --filter @clmm/ui typecheck`
Expected: FAIL with errors at `PositionsListScreen.tsx` — `PositionCard` no longer accepts `feeRateLabel` / `rangeDistanceLabel` and now requires `poolId`, `currentPrice`, `lowerBoundPrice`, `upperBoundPrice`, `lowerBoundLabel`, `upperBoundLabel`. This is expected; Task 11 wires the screen up.

- [ ] **Step 3: Commit (typecheck still failing — that is wired up in the next task)**

```bash
git add packages/ui/src/components/PositionCard.tsx
git commit -m "feat(ui): redesign PositionCard with glyph, range bar, and footer metrics"
```

---

## Task 11: Update `PositionsListScreen` composition

Adds the portfolio summary strip in `ListHeaderComponent`, moves the `MarketContextPanel` into `ListFooterComponent`, and wires the new `PositionCard` props from the view-model.

**Files:**

- Modify: `packages/ui/src/screens/PositionsListScreen.tsx`

- [ ] **Step 1: Update the imports and `ConnectedPositionsList`**

In `packages/ui/src/screens/PositionsListScreen.tsx`:

Add this import alongside the existing imports:

```ts
import { PortfolioSummaryStrip } from '../components/PortfolioSummaryStrip.js';
```

Replace the entire `ConnectedPositionsList` function (currently around lines 190–247) with:

```tsx
function ConnectedPositionsList({
  positions,
  onSelectPosition,
  srLevels,
  srLevelsLoading,
  srLevelsError,
  srLevelsUnsupported,
  isMixedPools,
  poolLabel,
  now,
}: {
  positions: PositionSummaryDto[];
  onSelectPosition?: (positionId: string) => void;
  srLevels?: SrLevelsBlock | null | undefined;
  srLevelsLoading?: boolean | undefined;
  srLevelsError?: boolean | undefined;
  srLevelsUnsupported?: boolean | undefined;
  isMixedPools: boolean;
  poolLabel: string | null;
  now?: number | undefined;
}) {
  const viewModel = buildPositionListViewModel(positions);

  return (
    <FlatList
      contentContainerStyle={{ flexGrow: 1 }}
      data={viewModel.items}
      keyExtractor={(item) => item.positionId}
      removeClippedSubviews={false}
      ListHeaderComponent={
        <View>
          <PortfolioSummaryStrip />
          <SectionHeader title="Active positions" meta={`${positions.length} monitored`} />
        </View>
      }
      ListFooterComponent={
        <MarketContextPanel
          srLevels={srLevels}
          isLoading={srLevelsLoading ?? false}
          isError={srLevelsError ?? false}
          isUnsupported={srLevelsUnsupported ?? false}
          isMixedPools={isMixedPools}
          poolLabel={poolLabel}
          now={now ?? Date.now()}
        />
      }
      renderItem={({ item }) => (
        <PositionCard
          poolId={item.poolId}
          poolLabel={item.poolLabel}
          currentPrice={item.currentPrice}
          currentPriceLabel={item.currentPriceLabel}
          lowerBoundPrice={item.lowerBoundPrice}
          upperBoundPrice={item.upperBoundPrice}
          lowerBoundLabel={item.lowerBoundLabel}
          upperBoundLabel={item.upperBoundLabel}
          rangeStatusKind={item.rangeStatusKind}
          hasAlert={item.hasAlert}
          monitoringLabel={item.monitoringLabel}
          onPress={() => onSelectPosition?.(item.positionId)}
        />
      )}
    />
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @clmm/ui typecheck`
Expected: PASS. (`PositionCard` now receives all required props; `feeRateLabel` and `rangeDistanceLabel` are unused but still on the view-model — that is fine, they remain stable display fields used elsewhere if needed and removing them is out of scope.)

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/screens/PositionsListScreen.tsx
git commit -m "feat(ui): compose portfolio strip, redesigned cards, and market footer"
```

---

## Task 12: Update `PositionsListScreen.test.tsx` for new chip labels, summary strip, and section ordering

The existing test file references `In range`, `Below range`, `Above range`, `Breach` chip labels. After the redesign, the chip says `Breach · below` / `Breach · above`, and a new `Near edge` label can appear. We also add summary-strip and section-ordering assertions per the spec.

**Files:**

- Modify: `packages/ui/src/screens/PositionsListScreen.test.tsx`

- [ ] **Step 1: Replace the `renders position cards with correct status chip` test**

In `packages/ui/src/screens/PositionsListScreen.test.tsx`, replace the entire `it('renders position cards with correct status chip', ...)` block with:

```tsx
it('renders all six status-chip labels per the spec mapping', () => {
  render(
    <PositionsListScreen
      walletAddress="wallet-1"
      positions={[
        // In range — current price comfortably between bounds.
        makePosition({
          positionId: brand('position-in'),
          rangeState: 'in-range',
          currentPrice: 150,
          lowerBoundPrice: 100,
          upperBoundPrice: 200,
        }),
        // Near edge — in-range but within 10% of the upper bound.
        makePosition({
          positionId: brand('position-near'),
          poolId: brand('pool-near'),
          rangeState: 'in-range',
          currentPrice: 195,
          lowerBoundPrice: 100,
          upperBoundPrice: 200,
        }),
        // Non-actionable below.
        makePosition({
          positionId: brand('position-below'),
          poolId: brand('pool-below'),
          rangeState: 'below-range',
          hasActionableTrigger: false,
        }),
        // Non-actionable above.
        makePosition({
          positionId: brand('position-above'),
          poolId: brand('pool-above'),
          rangeState: 'above-range',
          hasActionableTrigger: false,
        }),
        // Actionable below.
        makePosition({
          positionId: brand('position-breach-below'),
          poolId: brand('pool-breach-below'),
          rangeState: 'below-range',
          hasActionableTrigger: true,
        }),
        // Actionable above.
        makePosition({
          positionId: brand('position-breach-above'),
          poolId: brand('pool-breach-above'),
          rangeState: 'above-range',
          hasActionableTrigger: true,
        }),
      ]}
    />,
  );

  expect(screen.getByText('In range')).toBeTruthy();
  expect(screen.getByText('Near edge')).toBeTruthy();
  expect(screen.getByText('Below range')).toBeTruthy();
  expect(screen.getByText('Above range')).toBeTruthy();
  expect(screen.getByText('Breach · below')).toBeTruthy();
  expect(screen.getByText('Breach · above')).toBeTruthy();
});
```

- [ ] **Step 2: Replace the `renders breach chip for positions with actionable trigger` test**

Replace the existing block:

```tsx
it('renders breach chip for positions with actionable trigger', () => {
  render(
    <PositionsListScreen
      walletAddress="wallet-1"
      positions={[makePosition({ hasActionableTrigger: true, rangeState: 'below-range' })]}
    />,
  );

  expect(screen.getByText('Breach')).toBeTruthy();
});
```

with:

```tsx
it('renders directional breach chip for positions with actionable trigger', () => {
  render(
    <PositionsListScreen
      walletAddress="wallet-1"
      positions={[makePosition({ hasActionableTrigger: true, rangeState: 'below-range' })]}
    />,
  );

  expect(screen.getByText('Breach · below')).toBeTruthy();
});
```

- [ ] **Step 3: Add a `Near edge` boundary test**

Append inside the `describe('PositionsListScreen', ...)` block:

```tsx
it('does not label out-of-range positions as Near edge even when current price is close to a bound', () => {
  render(
    <PositionsListScreen
      walletAddress="wallet-1"
      positions={[
        makePosition({
          rangeState: 'below-range',
          currentPrice: 99,
          lowerBoundPrice: 100,
          upperBoundPrice: 200,
          hasActionableTrigger: false,
        }),
      ]}
    />,
  );

  expect(screen.queryByText('Near edge')).toBeNull();
  expect(screen.getByText('Below range')).toBeTruthy();
});
```

- [ ] **Step 4: Add the portfolio-summary-strip test**

Append inside the `describe('PositionsListScreen', ...)` block:

```tsx
it('renders the portfolio summary strip above the active positions for connected wallets with positions', () => {
  render(<PositionsListScreen walletAddress="wallet-1" positions={[makePosition()]} />);

  expect(screen.getByText('Portfolio')).toBeTruthy();
  expect(screen.getByText('$24,812')).toBeTruthy();
  expect(screen.getByText('Fees earned')).toBeTruthy();
  expect(screen.getByText('+$142.30')).toBeTruthy();
});

it('does not render the portfolio summary strip when disconnected, loading, or empty', () => {
  const disconnected = render(<PositionsListScreen walletAddress={null} />);
  expect(disconnected.container.textContent).not.toContain('$24,812');
  cleanup();

  const loading = render(<PositionsListScreen walletAddress="wallet-1" positionsLoading />);
  expect(loading.container.textContent).not.toContain('$24,812');
  cleanup();

  const empty = render(<PositionsListScreen walletAddress="wallet-1" positions={[]} />);
  expect(empty.container.textContent).not.toContain('$24,812');
});
```

- [ ] **Step 5: Add the section-ordering test**

Append inside the `describe('PositionsListScreen', ...)` block:

```tsx
it('renders summary strip → cards → Support & Resistance → Market Thesis in that order', () => {
  const { container } = render(
    <PositionsListScreen
      walletAddress="wallet-1"
      positions={[makePosition()]}
      srLevels={{
        briefId: 'brief-1',
        sourceRecordedAtIso: null,
        summary: 'Bullish continuation.',
        capturedAtUnixMs: 1_745_712_000_000,
        supports: [{ price: 132 }],
        resistances: [{ price: 148 }],
      }}
      poolLabel="SOL / USDC"
      now={1_745_712_000_000 + 5 * 60_000}
    />,
  );

  const text = container.textContent ?? '';
  const portfolioIdx = text.indexOf('Portfolio');
  const cardIdx = text.indexOf('SOL / USDC');
  const srIdx = text.indexOf('Support & Resistance');
  const thesisIdx = text.indexOf('Market Thesis');

  expect(portfolioIdx).toBeGreaterThan(-1);
  expect(cardIdx).toBeGreaterThan(-1);
  expect(srIdx).toBeGreaterThan(-1);
  expect(thesisIdx).toBeGreaterThan(-1);

  expect(portfolioIdx).toBeLessThan(cardIdx);
  expect(cardIdx).toBeLessThan(srIdx);
  expect(srIdx).toBeLessThan(thesisIdx);
});
```

- [ ] **Step 6: Add a `RangeBar` integration assertion**

Append inside the `describe('PositionsListScreen', ...)` block:

```tsx
it('renders the RangeBar with lower, current, and upper bound labels from the view model', () => {
  render(
    <PositionsListScreen
      walletAddress="wallet-1"
      positions={[
        makePosition({
          lowerBoundLabel: 'USDC 100.00',
          upperBoundLabel: 'USDC 200.00',
          currentPriceLabel: 'USDC 142.35',
        }),
      ]}
    />,
  );

  expect(screen.getByText('USDC 100.00')).toBeTruthy();
  expect(screen.getByText('USDC 200.00')).toBeTruthy();
  expect(screen.getByText('USDC 142.35')).toBeTruthy();
});
```

- [ ] **Step 7: Run the full screen test file**

Run: `pnpm --filter @clmm/ui test -- PositionsListScreen.test.tsx`
Expected: PASS for every test, including the existing connect-wallet, loading, error, partial-data, empty, monitoring text, mixed-pools, and S/R-state cases plus the new ones above.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/screens/PositionsListScreen.test.tsx
git commit -m "test(ui): cover redesigned card chips, summary strip, and section order"
```

---

## Task 13: Export new symbols if (and only if) the app composition needs them

`PositionCard`, `RangeBar`, `PortfolioSummaryStrip`, `PairGlyph` are currently consumed only inside `packages/ui`. Only export new symbols if `apps/app` directly imports them.

**Files:**

- Maybe modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Check whether the app imports any of the new components**

Run: `cd /home/gary/.openclaw/workspace/clmm-superpowers-v2 && grep -rn "RangeBar\|PortfolioSummaryStrip\|PairGlyph" apps/app/ 2>/dev/null`
Expected: No results.

- [ ] **Step 2: If no results, skip — do not add unused exports**

If the grep returned nothing, **do not modify `index.ts`**. The redesigned `PositionCard` is already exported (it was before). YAGNI.

If the grep returned results (it should not), add a single export line per used component to `packages/ui/src/index.ts`. No re-exports of helpers/utilities.

- [ ] **Step 3: Commit only if `index.ts` was modified**

```bash
git add packages/ui/src/index.ts
git commit -m "feat(ui): export new components needed by app composition"
```

---

## Task 14: Final validation gate

Spec calls these out as the deciding checks: `pnpm typecheck`, `pnpm test`, `pnpm boundaries`. Run them from the repo root, not the package, so Turbo runs every workspace and `dependency-cruiser` runs against the full graph.

**Files:** none

- [ ] **Step 1: Run repo-wide typecheck**

Run: `pnpm typecheck`
Expected: PASS for every workspace, including `@clmm/ui` and `apps/app` which transitively depend on it.

- [ ] **Step 2: Run repo-wide tests**

Run: `pnpm test`
Expected: PASS, including `@clmm/ui` test suite (`PositionListViewModel`, `PositionCardUtils`, `RangeBar`, `MarketContextPanel`, `PositionsListScreen`, plus all unrelated suites).

- [ ] **Step 3: Run boundaries**

Run: `pnpm boundaries`
Expected: PASS — the new files only import from `react-native`, `react`, `../design-system`, sibling components, and the existing `view-models` module. No domain/application/adapter touches.

- [ ] **Step 4: Visual sanity check**

This is a UI feature. Type checking and tests do not verify visual fidelity. Start the app and verify in a browser:

Run: `pnpm --filter @clmm/app dev` (or whatever the project's dev script is — check `apps/app/package.json` first)

Walk the four states:

1. Connect a fixture wallet with mixed in-range, near-edge, below-range, above-range, and actionable-trigger positions.
2. Confirm the portfolio strip shows `$24,812` and `+$142.30` above the cards.
3. Confirm each card shows pair glyphs, truncated pool ID, the right chip label, a range bar with three mono labels and a tick, and TVL/Fees 24h/Monitor in the footer.
4. Confirm Support & Resistance renders below the cards, with Market Thesis below it.
5. Confirm disconnected, loading, error-no-positions, and empty states are unchanged.

If you cannot run the dev server in this environment, say so explicitly in the completion summary instead of claiming visual success.

- [ ] **Step 5: Commit nothing in this task**

This is a verification gate. There is nothing to commit unless a regression surfaced and was fixed — in that case, the fix is its own commit with its own message.

---

## Done criteria

All of the following must be true:

- `PositionListItemViewModel` exposes `poolId` and `currentPrice` and the mapper populates them.
- `PositionCardUtils.ts` exports `splitTokenPair`, `formatPoolId`, `isNearEdge`, `getStatusChipProps`, `getMonitoringDisplay`, `getCardPlaceholderMetrics`, all unit-tested.
- `RangeBar.tsx` is a self-contained reusable component with passing tests for label rendering, tick rendering, breach styling, and degenerate-bound safety.
- `PairGlyph.tsx` and `PortfolioSummaryStrip.tsx` exist and render correctly.
- `PositionCard.tsx` renders the new layout (glyph + label + truncated pool id + chip · range bar · TVL/Fees/Monitor footer).
- `MarketContextPanel.tsx` renders `SrLevelsCard` before `MarketThesisCard` and is otherwise unchanged.
- `PositionsListScreen.tsx` renders Portfolio summary → Active positions cards → Support & Resistance → Market Thesis in that order, with `MarketContextPanel` moved into `ListFooterComponent`.
- `PositionsListScreen.test.tsx` covers all chip labels, summary strip, ordering, near-edge boundary, and the existing wallet/loading/error/empty/partial/mixed-pool/S-R behavior continues to pass.
- `pnpm typecheck`, `pnpm test`, `pnpm boundaries` all pass at the repo root.
- No changes to `packages/domain`, `packages/application` DTOs/code, `packages/adapters`, `apps/app` API validation, trigger qualification, or directional exit policy.

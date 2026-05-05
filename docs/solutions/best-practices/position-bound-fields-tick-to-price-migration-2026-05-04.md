---
title: Position bound fields tick-to-price DTO migration
date: 2026-05-04
category: docs/solutions/best-practices
module: domain/positions, application/use-cases, adapters/http, ui/view-models
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - Migrating DTO fields from internal representation (ticks) to display representation (prices)
  - Adding shared contract fields to summary DTOs that detail DTOs already partially expose
  - Tightening DTO contracts where fallback values mask upstream data quality issues
tags: [dto-contract, tick-to-price, position-bounds, buildpositiondisplaybounds, list-supported-positions, getpositiondetail, promise-allsettled, tautological-assertions]
---

# Position bound fields tick-to-price DTO migration

## Context

`PositionSummaryDto` and `PositionDetailDto` exposed tick-index bounds (`lowerBound`, `upperBound`) as display fields. Tick indexes are internal CLMM math values unsuitable for UI rendering. The UI needed price-space bounds (`lowerBoundPrice`, `upperBoundPrice`) and formatted labels (`lowerBoundLabel`, `upperBoundLabel`) to render range bars and labels without re-deriving them — which would violate the architecture boundary (tick-to-price conversion belongs in application/domain, not UI).

The migration replaced tick fields with price-space fields across 6 packages, introduced a `buildPositionDisplayBounds` helper to centralize the conversion, added a `cannot-build-supported-detail-dto` result kind for positions that lack token decimals, and switched `ListSupportedPositions` from emitting fallback tick labels to excluding positions with incomplete metadata.

## Guidance

### 1. Centralize display-bound computation in a helper

When two use cases (`ListSupportedPositions` and `GetPositionDetail`) need the same tick-to-price conversion and label formatting, extract a helper rather than duplicating the logic:

```ts
// packages/application/src/use-cases/positions/buildPositionDisplayBounds.ts
import { tickToPrice } from '@clmm/domain';

export function buildPositionDisplayBounds(input: PositionDisplayBoundsInput): PositionDisplayBounds {
  const lowerBoundPrice = tickToPrice(input.lowerTick, input.decimalsA, input.decimalsB);
  const upperBoundPrice = tickToPrice(input.upperTick, input.decimalsA, input.decimalsB);
  return {
    lowerBoundPrice,
    upperBoundPrice,
    lowerBoundLabel: `${input.displayQuoteSymbol} ${lowerBoundPrice.toFixed(2)}`,
    upperBoundLabel: `${input.displayQuoteSymbol} ${upperBoundPrice.toFixed(2)}`,
  };
}
```

The helper depends only on `@clmm/domain`, preserving the application-layer boundary.

### 2. Use discriminated union failure kinds instead of nullable fallbacks

When a position exists but cannot produce a valid DTO (e.g., decimals are null), return a precise failure kind rather than emitting a partial DTO with fake values or conflating it with `not-found`:

```ts
export type GetPositionDetailResult =
  | { kind: 'found'; position: LiquidityPosition; detailDto: PositionDetailDto }
  | { kind: 'not-found' }
  | { kind: 'cannot-build-supported-detail-dto' };
```

The HTTP controller maps `cannot-build-supported-detail-dto` to 422 `UnprocessableEntityException`, distinguishing metadata failures from true missing records.

### 3. Exclude positions with incomplete metadata rather than emit fallback values

`ListSupportedPositions` should skip positions whose pool metadata or token decimals are missing rather than emitting tick-based fallback labels. This prevents fake prices in price-named fields:

```ts
for (const p of positions) {
  const poolData = poolDataMap.get(p.poolId);
  if (!poolData) continue;
  const { decimalsA, decimalsB } = poolData.tokenPair;
  if (decimalsA === null || decimalsB === null) continue;
  // ... build and push summaryDto
}
```

The raw `positions` array remains unchanged so callers can still access the full set.

### 4. Use Promise.allSettled for parallel downstream calls

When fetching pool metadata for multiple pools, use `Promise.allSettled` with per-pool try/catch so one pool failure does not cascade:

```ts
await Promise.allSettled(uniquePoolIds.map(async (poolId) => {
  try {
    const poolData = await params.positionReadPort.getPoolData(poolId);
    if (poolData) poolDataMap.set(poolId, poolData);
  } catch {
    // individual pool lookup failure — positions in this pool will be excluded
  }
}));
```

### 5. Test with independently computed expected values, not tautological assertions

When testing label formatting, compute the expected value independently (e.g., via `tickToPrice` from domain) rather than deriving it from the actual result:

```ts
// Bad: tautological — tests the implementation against itself
expect(dto.lowerBoundLabel).toBe(`USDC ${dto.lowerBoundPrice.toFixed(2)}`);

// Good: independently computed expected value
const expectedLower = tickToPrice(FIXTURE_POSITION_IN_RANGE.bounds.lowerBound, 9, 6);
expect(dto.lowerBoundPrice).toBe(expectedLower);
expect(dto.lowerBoundLabel).toBe(`USDC ${expectedLower.toFixed(2)}`);
```

## Why This Matters

- Tick-based fallback values in price-named fields create misleading UX (users see "tick 100" in a field labeled "price")
- Conflating `not-found` with "cannot build DTO" makes it harder to diagnose and signal metadata problems
- `Promise.all` cascading failures can take down the entire position list for one bad pool
- Tautological test assertions provide false confidence — the code could be computing wrong values and the test would still pass

## When to Apply

- When adding display-formatted fields to DTOs that currently expose internal representation values
- When multiple use cases share the same computation logic for DTO field production
- When downstream data lookups are parallelized and any single failure should not block the whole response
- When test assertions verify formatting logic that derives from a known computation function

## Examples

### Before: GetPositionDetail with tick fallbacks

```ts
const decimalsKnown = decimalsA !== null && decimalsB !== null;
const currentPrice = decimalsKnown
  ? priceFromSqrtPrice(poolData.sqrtPrice, decimalsA, decimalsB)
  : position.rangeState.currentPrice;
const lowerBoundLabel = decimalsKnown
  ? `${symbolB} ${tickToPrice(position.bounds.lowerBound, decimalsA, decimalsB).toFixed(2)}`
  : `tick ${position.bounds.lowerBound}`;
// Detail DTO includes: lowerBound: position.bounds.lowerBound (tick index)
```

### After: GetPositionDetail with precise failure kind

```ts
if (decimalsA === null || decimalsB === null) {
  return { kind: 'cannot-build-supported-detail-dto' };
}
const bounds = buildPositionDisplayBounds({
  lowerTick: position.bounds.lowerBound,
  upperTick: position.bounds.upperBound,
  decimalsA, decimalsB, displayQuoteSymbol: poolData.tokenPair.symbolB,
});
// Detail DTO includes: lowerBoundPrice, upperBoundPrice, lowerBoundLabel, upperBoundLabel
```

### Before: ListSupportedPositions with Promise.all

```ts
await Promise.all(uniquePoolIds.map(async (poolId) => {
  const poolData = await params.positionReadPort.getPoolData(poolId);
  if (poolData) poolDataMap.set(poolId, poolData);
}));
// One getPoolData rejection throws from the entire use case
```

### After: ListSupportedPositions with Promise.allSettled

```ts
await Promise.allSettled(uniquePoolIds.map(async (poolId) => {
  try {
    const poolData = await params.positionReadPort.getPoolData(poolId);
    if (poolData) poolDataMap.set(poolId, poolData);
  } catch {
    // positions in this pool excluded from summary
  }
}));
```

## Related

- [Enriching DTOs across clean-architecture layers](enriching-dtos-across-layers-2026-04-25.md) — additive DTO enrichment pattern, graceful degradation, tick=0 division-by-zero edge case
- [Read-only data API with discriminated unions](read-only-data-api-discriminated-unions-bff-2026-05-01.md) — discriminated union result types for use case returns, sequential reads vs Promise.all
- [S/R levels position-to-pool extraction](sr-levels-position-to-pool-extraction-2026-04-27.md) — two-phase additive-then-breaking DTO extraction pattern
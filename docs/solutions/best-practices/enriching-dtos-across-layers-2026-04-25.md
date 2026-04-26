---
title: "Enriching DTOs across clean-architecture layers: token labels, prices, fees, and range distance"
date: 2026-04-25
category: best-practices
module: domain/positions, application/ports, adapters/whirlpool, ui
problem_type: best_practice
component: service_object
severity: medium
applies_when:
  - Extending position or entity DTOs with enrichment fields across domain, application, adapter, and UI package boundaries
  - Adding a port abstraction where an external API provides display data not available from the primary data source
  - Computing derived metrics with math that has edge-case denominators (division by zero)
  - Ensuring enrichment fields degrade gracefully when external data is unavailable
  - Maintaining boundary compliance when new application-layer types must not import adapter types
related_components:
  - testing_framework
tags:
  - dto-enrichment
  - clean-architecture
  - boundary-safe-types
  - price-port
  - jupiter-adapter
  - ttl-cache
  - range-distance
  - division-by-zero
  - graceful-degradation
  - clmm
---

# Enriching DTOs across clean-architecture layers: token labels, prices, fees, and range distance

## Context

When building a Solana CLMM position exit assistant, positions were displayed with raw on-chain data — pool IDs instead of token pair labels, `sqrtPrice` bigints instead of human-readable prices, raw token amounts instead of USD values, and no range distance metrics. Users needed to see "SOL / USDC · $142.35 · 20.0% below lower" instead of "pool-7xKXtg2 · tick: 184467440737095516 · below-range".

The challenge: where does raw → human-readable transformation live when your architecture has a pure domain layer (no SDKs, no APIs), adapter implementations, and UI view models? Adding enrichment means threading a new port through the application layer, extending DTOs across package boundaries, and handling failures in external price feeds without breaking the UI.

This builds on the boundary-safe DTO extension pattern documented in [outbound-adapter-fire-and-forget-dual-seam-pattern](./outbound-adapter-fire-and-forget-dual-seam-pattern-2026-04-19.md), generalizing it from SR-levels enrichment to token labels, USD prices, fees, rewards, and range distance.

## Guidance

### 1. Enrich in the application layer, not in adapters or domain

Adapters return raw domain types. Use cases orchestrate enrichment by calling the enrichment port and domain pure functions. Domain stays free of side effects. Adapters stay dumb data fetchers.

```ts
// packages/application/src/use-cases/positions/ListSupportedPositions.ts
const priceMap = new Map<string, { usdValue: number; symbol: string }>();
try {
  const quotes = await params.pricePort.getPrices([...new Set(allMints)]);
  for (const q of quotes) {
    priceMap.set(q.tokenMint, { usdValue: q.usdValue, symbol: q.symbol });
  }
} catch {
  // Price fetch failed — degrade gracefully, USD values default to 0
}
```

The `try/catch` around the price fetch is the only place enrichment can fail, and it produces zero-valued USD fields while still showing raw token amounts and tick-based labels.

### 2. Add a focused port for each external concern

`PricePort` is a single-method interface that doesn't leak Jupiter API details. The adapter owns caching and batching; use cases never know about Jupiter, API keys, or TTLs.

```ts
// packages/application/src/ports/index.ts
export interface PricePort {
  getPrices(tokenMints: readonly string[]): Promise<readonly PriceQuote[]>;
}
```

### 3. Use range width as denominator to avoid division by zero

The original `rangeDistancePercent` divided by `Math.abs(lowerTick)` or `Math.abs(upperTick)`, which produces 0 when a tick equals 0. Tick 0 is valid in CLMM pools (it represents price = 1.0). The fix uses `(upperTick - lowerTick)` as the denominator — always positive for valid ranges:

```ts
// packages/domain/src/positions/enrichment.ts
export function rangeDistancePercent(
  currentTick: number,
  lowerTick: number,
  upperTick: number,
): { belowLowerPercent: number; aboveUpperPercent: number } {
  if (currentTick >= lowerTick && currentTick <= upperTick) {
    return { belowLowerPercent: 0, aboveUpperPercent: 0 };
  }
  const rangeWidth = upperTick - lowerTick;
  if (currentTick < lowerTick) {
    const belowLowerPercent = (Math.abs(currentTick - lowerTick) / rangeWidth) * 100;
    return { belowLowerPercent, aboveUpperPercent: 0 };
  }
  const aboveUpperPercent = (Math.abs(currentTick - upperTick) / rangeWidth) * 100;
  return { belowLowerPercent: 0, aboveUpperPercent };
}
```

### 4. Extend existing DTOs rather than creating parallel hierarchies

New fields were added to `PositionSummaryDto` and `PositionDetailDto` directly. No `EnrichedPositionSummaryDto` or inheritance chain. The DTO is the contract between application and UI — adding fields is additive and non-breaking when consumers handle the new fields.

```ts
export type PositionSummaryDto = {
  positionId: PositionId;
  poolId: PoolId;
  tokenPairLabel: string;        // new — "SOL / USDC" or "Pool <id>" fallback
  currentPrice: number;
  currentPriceLabel: string;     // new — "$142.35" or "tick: N" fallback
  feeRateLabel: string;           // new — "10 bps"
  rangeState: 'in-range' | 'below-range' | 'above-range';
  rangeDistance: {                 // new — with safe denominator
    belowLowerPercent: number;
    aboveUpperPercent: number;
  };
  hasActionableTrigger: boolean;
  monitoringStatus: 'active' | 'degraded' | 'inactive';
};
```

### 5. Test with fakes that match port signatures

`FakePricePort` and extended `FakeSupportedPositionReadPort` provide test doubles that implement the exact port interfaces, making use-case tests fast and deterministic:

```ts
export class FakePricePort implements PricePort {
  constructor(private readonly quotes: PriceQuote[] = []) {}
  async getPrices(tokenMints: readonly string[]): Promise<readonly PriceQuote[]> {
    return this.quotes.filter((q) => tokenMints.includes(q.tokenMint));
  }
}
```

For failure testing, inline a throwing stub: `{ getPrices: async () => { throw new Error('price unavailable'); } }`

### 6. Sequence commits by dependency order

Because enrichment is separated by layer, commits land cleanly without circular dependencies:

1. Domain enrichment types and pure functions
2. Application ports (PricePort) and extended DTOs
3. Adapter implementation (JupiterPriceAdapter)
4. Extended adapter methods (getPoolData, getPositionDetail)
5. Testing fakes and fixtures
6. Use case enrichment logic
7. DI wiring (controller passes PricePort to use cases)
8. UI view models and components

## Why This Matters

- **Boundary integrity**: Domain remains pure. No price API, no USD conversion, no Jupiter — just `priceFromSqrtPrice`, `rangeDistancePercent`, and `tokenAmountToUsd`, all pure functions.
- **Resilient UX**: Graceful degradation means the position list always renders. USD values are 0 and labels fall back to ticks when prices are unavailable — no blank screens, no spinner jams.
- **Testability**: Port-based fakes let you test enrichment logic without network calls, and inline throwing stubs verify degradation paths in one line.
- **Division-by-zero prevention**: The `rangeDistancePercent` fix prevents NaN/Infinity at tick=0, which is a valid tick index in CLMM pools where tick=0 means price = 1.0.
- **Commit sequencing works**: Because enrichment is separated by layer, 10 commits in dependency order land cleanly without circular dependencies.

## When to Apply

- Any time you need to augment raw protocol data with external data (prices, metadata, labels) before showing it to users.
- When a feature requires side-effectful data (API calls) to transform pure domain values into display-ready values.
- When your architecture has a pure domain layer and you need to keep it that way.
- When external data sources may be unavailable, rate-limited, or slow — and the UI must still function.
- When computing derived values where denominator edge cases exist (range distance, percentage calculations, price ratios).

## Examples

### Before: Raw data in the UI

Positions displayed as pool IDs, raw sqrtPrice values, and no USD context:

```
Position: pool-7xKXtg2  |  sqrtPrice: 184467440737095516n  |  Range: below-range
Unclaimed: 120000000 raw / 47230000 raw
```

### After: Enriched data with graceful fallback

With prices available:

```
SOL / USDC  |  $142.35  |  10 bps  |  below-range (20.0% below lower)
Unclaimed fees: $18.00 SOL + $47.23 USDC = $65.23
Pool depth: $2.4M pool depth
```

Without prices (degradation):

```
SOL / USDC  |  $142.35  |  10 bps  |  below-range (20.0% below lower)
Unclaimed fees: 0.12 SOL + 47.23 USDC (USD unavailable)
Pool depth: depth unavailable
```

`tokenPairLabel` degrades to `"Pool <poolId>"`, `currentPriceLabel` degrades to `"tick: <number>"`, and USD values fall back to 0 — but the position always renders.

## Related

- [Outbound adapter fire-and-forget dual-seam pattern](./outbound-adapter-fire-and-forget-dual-seam-pattern-2026-04-19.md) — prior instance of boundary-safe DTO extension for SR-levels enrichment, same pattern applied to a different enrichment domain
- GitHub Issue #43 — product-level requirements for position data display
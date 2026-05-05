# Position Bound Fields Design

**Issue**: https://github.com/opsclawd/clmm-v2/issues/66
**Date**: 2026-05-05
**Status**: Draft

## Problem

The positions list and position detail screen need to share a reusable position card that can render range bars and range labels from the same DTO shape. Today `PositionDetailDto` has bound labels, while `PositionSummaryDto` does not. The list card would either need detail-only data or would have to derive display values in the UI.

That would violate the existing architecture. Tick-to-price conversion requires CLMM math and token metadata, and label formatting requires token orientation knowledge. Those belong in the application/domain boundary, not in `packages/ui`.

## Scope

Implement the strict contract migration from issue #66:

- Add `lowerBoundPrice`, `upperBoundPrice`, `lowerBoundLabel`, and `upperBoundLabel` to `PositionSummaryDto`.
- Remove `lowerBound` and `upperBound` tick fields from `PositionDetailDto`.
- Let `PositionDetailDto` inherit the new bound price and label fields from `PositionSummaryDto`.
- Thread the new fields through application use cases, API validation, UI view models, presenters, and tests.
- Use TypeScript failures as the migration checklist.

Out of scope:

- Reusable position card layout work.
- Range bar rendering.
- New UI behavior beyond exposing the data needed by follow-up UI work.
- Backwards-compatible tick DTO fields unless a compile or test run proves an external client boundary cannot be updated in this PR.

## Contract

`PositionSummaryDto` becomes the shared position-card range contract:

```ts
type PositionSummaryDto = {
  positionId: PositionId;
  poolId: PoolId;
  tokenPairLabel: string;
  currentPrice: number;
  currentPriceLabel: string;
  feeRateLabel: string;
  lowerBoundPrice: number;
  upperBoundPrice: number;
  lowerBoundLabel: string;
  upperBoundLabel: string;
  rangeState: 'in-range' | 'below-range' | 'above-range';
  rangeDistance: {
    belowLowerPercent: number;
    aboveUpperPercent: number;
  };
  hasActionableTrigger: boolean;
  monitoringStatus: 'active' | 'degraded' | 'inactive';
};
```

`PositionDetailDto` continues to extend `PositionSummaryDto`, but it no longer declares tick-index bounds:

```ts
type PositionDetailDto = PositionSummaryDto & {
  currentPrice: number;
  sqrtPrice: string;
  unclaimedFees: { /* unchanged */ };
  unclaimedRewards: { /* unchanged */ };
  positionLiquidity: string;
  poolLiquidity: string;
  poolDepthLabel: string;
  triggerId?: ExitTriggerId;
  breachDirection?: BreachDirection;
};
```

The removed DTO fields are:

- `lowerBound`
- `upperBound`

The existing domain `LiquidityPosition.bounds.lowerBound` and `LiquidityPosition.bounds.upperBound` tick fields remain domain data. They are still the source for calculations, but they do not cross the application DTO boundary as display fields.

## Price And Label Semantics

`lowerBoundPrice` and `upperBoundPrice` are always price-space values. They must never contain raw tick indexes.

Application code computes bound prices with the same price orientation used for current price display:

```ts
const lowerBoundPrice = tickToPrice(lowerTick, decimalsA, decimalsB);
const upperBoundPrice = tickToPrice(upperTick, decimalsA, decimalsB);
```

Labels are formatted from those numeric price values and an orientation-safe display quote symbol:

```ts
const lowerBoundLabel = `${displayQuoteSymbol} ${lowerBoundPrice.toFixed(2)}`;
const upperBoundLabel = `${displayQuoteSymbol} ${upperBoundPrice.toFixed(2)}`;
```

The implementation should name or derive the display symbol in a way that makes the orientation explicit. Do not casually assume token B is always the displayed quote token unless the codebase explicitly guarantees that for the selected supported position set. For the current SOL/USDC display path, tests should verify the expected USDC-per-SOL orientation directly.

## Data Flow

`ListSupportedPositions`:

1. Read raw supported positions from `SupportedPositionReadPort.listSupportedPositions`.
2. Fetch pool metadata for each unique pool ID.
3. For each position with complete supported pool metadata and token decimals, compute current price, bound prices, labels, fee label, token pair label, and range distance.
4. Exclude positions that cannot produce honest price-space bound fields.
5. Return the raw `positions` array unchanged and return only valid display-ready `summaryDtos`.

`GetPositionDetail`:

1. Read position detail from `SupportedPositionReadPort.getPositionDetail`.
2. Preserve true missing records as `not-found`.
3. If the position exists but metadata, decimals, or orientation data is insufficient to construct the DTO honestly, return a precise internal failure such as `cannot-build-supported-detail-dto`.
4. When metadata is complete, compute the same bound prices and labels as the list use case.
5. Return `detailDto` without `lowerBound` or `upperBound` tick fields.

The HTTP controller may map `cannot-build-supported-detail-dto` to the existing external response shape, but the application use case should not conflate malformed DTO construction with true `not-found`.

## Error Handling

Missing pool metadata or missing token decimals is a contract failure for DTO construction. The system should not emit fake prices or tick-based fallback values in price-named fields.

List behavior:

- Keep raw domain positions available in the use-case result.
- Exclude unsupported or malformed entries from `summaryDtos`.
- Do not emit partial summary DTOs with fake bound prices.

Detail behavior:

- Return `not-found` only when the requested position does not exist or fails the existing identity check.
- Return a precise internal failure when the position exists but cannot produce a valid supported detail DTO.
- Do not construct a `PositionDetailDto` unless bound prices, labels, and current price semantics are valid.

## UI Changes

`PositionListItemViewModel` should expose the four new bound fields:

- `lowerBoundPrice`
- `upperBoundPrice`
- `lowerBoundLabel`
- `upperBoundLabel`

`buildPositionListViewModel` should map those fields from `PositionSummaryDto`. It should not derive them.

`PositionDetailViewModel` may continue using `dto.lowerBoundLabel` and `dto.upperBoundLabel` for the range bounds label because those fields now come from the shared summary contract.

`PositionDetailPresenter` should stop normalizing deleted tick fields. If it keeps fallback normalization for partial test fixtures, the fallback must create valid price-space fields and labels, not reintroduce tick DTO semantics.

## API Validation

`apps/app/src/api/positions.ts` should validate the new summary contract:

- Require finite `lowerBoundPrice`.
- Require finite `upperBoundPrice`.
- Require string `lowerBoundLabel`.
- Require string `upperBoundLabel`.
- No longer require `lowerBound` or `upperBound` tick fields on detail payloads.

Tests should assert emitted DTOs do not contain `lowerBound` or `upperBound`.

## Testing

Use compile failures as the migration checklist, then add focused behavioral coverage:

- `ListSupportedPositions` emits price-space `lowerBoundPrice` and `upperBoundPrice`.
- `ListSupportedPositions` emits labels derived from those numeric prices.
- `GetPositionDetail` emits the same bound price and label semantics as `ListSupportedPositions` for the same position.
- Domain-level fixtures preserve `lowerTick < upperTick`.
- Price ordering assertions match the actual `tickToPrice` display orientation used by the app. For SOL/USDC display, verify the expected USDC-per-SOL ordering explicitly.
- List mapping excludes positions whose metadata or decimals are unavailable.
- Detail mapping returns the precise internal failure kind when an existing position cannot produce a valid DTO.
- API validators require finite bound price fields and required label fields.
- API validators no longer require tick DTO fields.
- Tests assert emitted summary and detail DTOs do not contain `lowerBound` or `upperBound`.
- UI list and detail fixtures include the new bound fields and remove deleted detail tick fields.

Run the narrowest relevant tests during development, then verify the strict migration with:

- `pnpm typecheck`
- `pnpm test`
- `pnpm boundaries`

If the change touches broader shared contracts while resolving compile failures, also run the full repo validation set before PR readiness:

- `pnpm build`
- `pnpm lint`

## Implementation Notes

Prefer a small application-layer helper only if it removes real duplication between `ListSupportedPositions` and `GetPositionDetail`. The helper should accept raw bounds plus complete display metadata and return price-space fields and labels. It should not import adapters, Solana SDKs, React, React Native, browser APIs, or Expo APIs.

Keep the release-blocker directional exit mapping untouched. This issue is about display DTO shape only and must not modify exit policy behavior.

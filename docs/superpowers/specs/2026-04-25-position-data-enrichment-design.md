# Position Data Enrichment Design

**Issue**: https://github.com/opsclawd/clmm-v2/issues/43
**Date**: 2026-04-25
**Status**: Draft

## Problem

The `/positions` and `/positions/:walletId/:positionId` endpoints fetch substantial data from Orca whirlpool RPCs but discard most of it. Only `tickCurrentIndex` is extracted from whirlpool responses. Position accounts contain `feeOwedA/B`, `rewardInfos`, and `liquidity` that are never surfaced. Users see raw tick indices instead of human-readable prices, pool labels like "Pool <address>" instead of "SOL / USDC", and no fee or value information.

## Scope

Full issue scope as specified in #43:

- Display token pair symbols on list and detail views
- Display current price in human-readable terms (derived from sqrtPrice)
- Display pool fee tier, tick spacing, and pool depth
- Display unclaimed fees (feeOwedA/B) with USD values
- Display unclaimed rewards with USD values
- Display position size indicator
- Display range distance percentages
- Price source: sqrtPrice from whirlpool (primary), Jupiter Price API v6 (for USD values and token symbols)

**Out of scope** (per the issue): historical entry price / PnL, impermanent loss calculation, fee history over time, price chart / portfolio value over time.

## Architecture Decision: Application-Layer Enrichment

**Chosen approach**: Application-layer orchestration with a new `PricePort` in the domain layer.

- Adapters return raw on-chain data (token mints, fee amounts, sqrtPrice, etc.)
- Application use cases call `PricePort` to get prices, then compute USD values and human-readable prices
- Domain stays pure — it defines the port interface and computed-value functions
- Price failures don't break position reads — graceful degradation to raw values

This was chosen over:
- **Enrichment in adapter**: Couples position reads to price fetching, violates adapter isolation
- **Dedicated enrichment port**: Adds an extra port without much gain over application-layer orchestration

## Domain Layer Changes

### New types in `packages/domain/src/positions/`

#### `TokenPair`

```typescript
type TokenPair = {
  readonly mintA: string;    // base58 mint address
  readonly mintB: string;
  readonly symbolA: string;  // e.g. "SOL"
  readonly symbolB: string;  // e.g. "USDC"
  readonly decimalsA: number;
  readonly decimalsB: number;
};
```

#### `PoolData`

```typescript
type PoolData = {
  readonly poolId: PoolId;
  readonly tokenPair: TokenPair;
  readonly sqrtPrice: bigint;      // raw X64 from whirlpool
  readonly feeRate: number;         // basis points
  readonly tickSpacing: number;
  readonly liquidity: bigint;       // pool depth
  readonly tickCurrentIndex: number;
};
```

#### `PositionFees`

```typescript
type PositionFees = {
  readonly feeOwedA: bigint;
  readonly feeOwedB: bigint;
  readonly rewardInfos: readonly PositionRewardInfo[];
};

type PositionRewardInfo = {
  readonly mint: string;
  readonly amountOwed: bigint;
  readonly decimals: number;
};
```

#### `PositionDetail`

```typescript
type PositionDetail = {
  readonly position: LiquidityPosition;
  readonly poolData: PoolData;
  readonly fees: PositionFees;
  readonly positionLiquidity: bigint;
};
```

#### `PriceQuote`

```typescript
type PriceQuote = {
  readonly tokenMint: string;
  readonly usdValue: number;      // e.g. 142.35
  readonly symbol: string;        // e.g. "SOL"
  readonly quotedAt: ClockTimestamp;
};
```

### New port in `packages/application/src/ports/`

#### `PricePort`

```typescript
interface PricePort {
  getPrices(tokenMints: readonly string[]): Promise<readonly PriceQuote[]>;
}
```

`PricePort` lives in the application layer alongside `SupportedPositionReadPort` and `SwapQuotePort`. The domain layer has no knowledge of prices — it only provides pure computation functions (`tickToPrice`, `tokenAmountToUsd`, etc.) that the application layer calls with price data fetched through this port.

### Extended port (same location)

#### `SupportedPositionReadPort` (extended)

```typescript
interface SupportedPositionReadPort {
  listSupportedPositions(walletId: WalletId): Promise<LiquidityPosition[]>;
  getPosition(walletId: WalletId, positionId: PositionId): Promise<LiquidityPosition | null>;
  // NEW:
  getPositionDetail(walletId: WalletId, positionId: PositionId): Promise<PositionDetail | null>;
  getPoolData(poolId: PoolId): Promise<PoolData | null>;
}
```

### Computed value functions in `packages/domain/src/positions/`

Pure functions for display calculations. No external dependencies.

```typescript
function tickToPrice(tickIndex: number, decimalsA: number, decimalsB: number): number;
function priceFromSqrtPrice(sqrtPriceX64: bigint, decimalsA: number, decimalsB: number): number;
function rangeDistancePercent(
  currentTick: number,
  lowerTick: number,
  upperTick: number,
): { belowLowerPercent: number; aboveUpperPercent: number };
function tokenAmountToUsd(amount: bigint, decimals: number, usdPrice: number): number;
```

- `tickToPrice`: Converts a tick index to a human-readable price using `price = 1.0001^tick * 10^(decimalsA - decimalsB)`
- `priceFromSqrtPrice`: Converts X64 sqrtPrice to human-readable price using `price = (sqrtPriceX64 / 2^64)^2 * 10^(decimalsA - decimalsB)`
- `rangeDistancePercent`: Returns how far the current tick is from the lower and upper bounds as percentages. For out-of-range positions: `belowLowerPercent` is positive when below the lower bound, `aboveUpperPercent` is positive when above the upper bound. For in-range positions: both values are 0 (no breach).
- `tokenAmountToUsd`: Converts raw token amount + decimals to USD using `amount / 10^decimals * usdPrice`

## Application Layer Changes

### `ListSupportedPositions` use case (extended)

```typescript
async function listSupportedPositions(params: {
  walletId: WalletId;
  positionReadPort: SupportedPositionReadPort;
  pricePort: PricePort;
}): Promise<ListSupportedPositionsResult>
```

Orchestration:
1. Call `positionReadPort.listSupportedPositions(walletId)` to get position list
2. Collect unique pool IDs from positions
3. Call `positionReadPort.getPoolData()` for each unique pool
4. Collect all token mints from pool data
5. Call `pricePort.getPrices()` with all token mints (single batched call)
6. Compute: token pair labels, current prices from sqrtPrice, range distance percentages, fee rate labels, pool depth indicators
7. Return enriched `PositionSummaryDto[]`

### `GetPositionDetail` use case (extended)

```typescript
async function getPositionDetail(params: {
  walletId: WalletId;
  positionId: PositionId;
  positionReadPort: SupportedPositionReadPort;
  pricePort: PricePort;
}): Promise<GetPositionDetailResult>
```

Orchestration:
1. Call `positionReadPort.getPositionDetail(walletId, positionId)` to get position + pool data + fees
2. Collect token mints from pool data and reward infos
3. Call `pricePort.getPrices()` with all relevant token mints
4. Compute: USD fee values, USD reward values, position notional estimate, human-readable price, range distances
5. Return enriched `PositionDetailDto`

### Updated DTOs in `packages/application/src/dto/`

#### `PositionSummaryDto` (extended)

```typescript
type PositionSummaryDto = {
  positionId: PositionId;
  poolId: PoolId;
  tokenPairLabel: string;          // "SOL / USDC"
  currentPrice: number;            // human-readable, e.g. 142.35
  currentPriceLabel: string;       // "$142.35"
  feeRateLabel: string;            // "10 bps"
  rangeState: 'in-range' | 'below-range' | 'above-range';
  rangeDistance: {
    belowLowerPercent: number;    // e.g. 12.3 (or 0 if in-range/above)
    aboveUpperPercent: number;    // e.g. 8.7 (or 0 if in-range/below)
  };
  hasActionableTrigger: boolean;
  monitoringStatus: 'active' | 'degraded' | 'inactive';
};
```

#### `PositionDetailDto` (extended)

```typescript
type PositionDetailDto = PositionSummaryDto & {
  lowerBound: number;                // tick index (still needed for SR levels)
  upperBound: number;
  sqrtPrice: bigint;                  // raw X64 for precision needs
  unclaimedFees: {
    feeOwedA: TokenAmountValue;
    feeOwedB: TokenAmountValue;
    totalUsd: number;
  };
  unclaimedRewards: {
    rewards: RewardAmountValue[];
    totalUsd: number;
  };
  positionLiquidity: bigint;
  poolLiquidity: bigint;
  poolDepthLabel: string;           // e.g. "$2.4M pool depth"
};

type TokenAmountValue = {
  raw: bigint;
  decimals: number;
  symbol: string;
  usdValue: number;
};

type RewardAmountValue = {
  mint: string;
  amount: bigint;
  decimals: number;
  symbol: string;
  usdValue: number;
};
```

## Adapter Layer Changes

### `JupiterPriceAdapter` (new file)

Location: `packages/adapters/src/outbound/price/JupiterPriceAdapter.ts`

Implements `PricePort`. Uses Jupiter Price API v6 at `https://price-api.jup.ag/v6/price`.

```typescript
class JupiterPriceAdapter implements PricePort {
  constructor(config: { apiKey?: string; cacheTtlMs: number });

  async getPrices(tokenMints: readonly string[]): Promise<readonly PriceQuote[]>
}
```

Behavior:
- Accepts `JUPITER_API_KEY` env var (optional; unauthenticated mode works for low volume)
- In-memory TTL cache (default 30s): `Map<string, { price: number; symbol: string; fetchedAt: number }>`
- Batch request: Jupiter Price API accepts multiple mints in one call
- On cache hit for all mints, returns immediately without network call
- On partial cache miss, fetches only missing mints
- On API failure (429, 5xx, network), throws `PriceUnavailableError`; use case catches and degrades gracefully

### `SolanaPositionSnapshotReader` changes

#### `fetchWhirlpoolsBatched` extended return type

```typescript
// Before: Map<string, { tickCurrentIndex: number }>
// After:  Map<string, WhirlpoolData>

type WhirlpoolData = {
  tickCurrentIndex: number;
  sqrtPrice: bigint;
  tokenMintA: string;
  tokenMintB: string;
  feeRate: number;
  tickSpacing: number;
  liquidity: bigint;
};
```

No new RPC calls required — the data is already present in the whirlpool account response. We stop discarding it.

### `OrcaPositionReadAdapter` changes

#### New `getPoolData(poolId)` method

- Looks up the pool ID in cached whirlpool data, or makes a single fetch
- Maps to `PoolData` domain type with `TokenPair` using the known token map and Jupiter symbol fallback

#### New `getPositionDetail(walletId, positionId)` method

- Same ownership verification as existing `getPosition`
- Additionally reads from the position account: `feeOwedA`, `feeOwedB`, `rewardInfos[]`, `liquidity`
- Fetches associated whirlpool data
- Returns `PositionDetail` with all raw on-chain values

### Known token map

A static map in the adapter layer for supported tokens:

```typescript
const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  [SOL_MINT]:  { symbol: 'SOL',  decimals: 9  },
  [USDC_MINT]: { symbol: 'USDC', decimals: 6  },
};
```

Token mints not in this map get their symbol from Jupiter's price response (which includes `data.symbol`). This avoids adding a separate token metadata API dependency.

## UI Layer Changes

### Updated view models

#### `PositionListItemViewModel` (extended)

```typescript
type PositionListItemViewModel = {
  positionId: string;
  poolLabel: string;              // "SOL / USDC" (was "Pool <address>")
  currentPriceLabel: string;     // "$142.35" (was "Current: -18130")
  feeRateLabel: string;           // "10 bps"
  rangeStatusLabel: string;
  rangeStatusKind: 'in-range' | 'below-range' | 'above-range';
  rangeDistanceLabel: string;     // "12.3% below lower" or "8.7% above upper"
  hasAlert: boolean;
  monitoringLabel: string;
};
```

#### `PositionDetailViewModel` (extended)

```typescript
type PositionDetailViewModel = {
  positionId: string;
  poolLabel: string;              // "SOL / USDC"
  currentPriceLabel: string;     // "$142.35"
  feeRateLabel: string;           // "10 bps"
  rangeBoundsLabel: string;      // "$130.00 — $160.00" (was "-18130 — -17930")
  rangeStatusLabel: string;
  rangeStatusColorKey: string;
  rangeDistanceLabel: string;    // "12.3% below lower bound"
  unclaimedFeesLabel: string;    // "$64.50 in unclaimed fees"
  unclaimedFeesBreakdown: {
    feeA: string;                 // "47.23 USDC"
    feeB: string;                 // "0.12 SOL"
  };
  unclaimedRewardsLabel: string; // "$12.50 in rewards" or "No rewards"
  positionSizeLabel: string;     // "~$5,200 position" or raw liquidity
  poolDepthLabel: string;        // "$2.4M pool depth" (estimated from pool liquidity * price; shows "depth unavailable" without prices)
  hasAlert: boolean;
  alertLabel: string;
  breachDirectionLabel?: string;
  srLevels?: SrLevelsViewModelBlock;
};
```

### Component rendering

All formatting happens in the view model builders. Components render pre-formatted strings. No computation in React components.

### Fallback behavior (price unavailable)

| Field | With price | Without price |
|-------|-----------|---------------|
| `poolLabel` | "SOL / USDC" | "SOL / USDC" (from known token map) |
| `currentPriceLabel` | "$142.35" | "tick: -18130" |
| `unclaimedFeesLabel` | "$64.50 in unclaimed fees" | "0.12 SOL + 47.23 USDC unclaimed" |
| `unclaimedRewardsLabel` | "$12.50 in rewards" | "12.50 ORCA rewards" |
| `poolDepthLabel` | "$2.4M pool depth" | "depth unavailable" |
| `rangeBoundsLabel` | "$130.00 — $160.00" | "tick -18130 — -17930" |

## Error Handling

- **Price API failure**: Use case catches `PricePort` errors, returns `null` prices. View models format graceful fallbacks. Position list/detail never fails due to price unavailability.
- **Whirlpool fetch failure**: Positions referencing failed whirlpool fetches are excluded from the list (existing behavior). `getPoolData` returns `null`; use case skips pool enrichment for that position.
- **Position account fetch failure**: `getPositionDetail` returns `null`. Detail endpoint returns 404 (existing behavior).
- **Jupiter rate limiting (429)**: TTL cache minimizes requests. On 429 or 5xx, `JupiterPriceAdapter` throws `PriceUnavailableError`; use case catches and degrades.

## Testing

- **Domain**: Unit tests for `tickToPrice`, `priceFromSqrtPrice`, `rangeDistancePercent`, `tokenAmountToUsd`. Edge cases: tick = 0, sqrtPrice = 0, inverted decimals, boundary ticks.
- **Application**: Integration-style tests with mock ports. Verify orchestration of position + price data, null price handling, DTO formation.
- **Adapters**: `JupiterPriceAdapter` tested with recorded HTTP responses (no live API calls). Cache behavior tested with fake timers. Whirlpool data extraction tested with fixture account data.
- **UI**: View model builder tests with various DTO combinations (full data, partial data, price unavailable).

## Out of Scope

- Historical entry price / PnL
- Impermanent loss calculation
- Fee history over time
- Price chart / portfolio value over time
# Design: Pool Depth Calculation Fix

## Problem Being Solved

The position detail screen currently displays "Pool Depth: depth unavailable" for all positions. This is a deliberate placeholder left over from reverting an earlier, mathematically incorrect implementation that passed the raw concentrated-liquidity parameter (`L`) directly into a token-to-USD converter. The correct metric—the total USD value of in-range token reserves actively available for trading at the current price—is important to users for assessing liquidity and slippage risks, but is currently absent.

## Key Design Decisions & Trade-offs

- **Mathematical Precision vs. Complexity**: Calculating in-range reserves requires determining the current tick bucket boundaries, calculating the square root of prices at those boundaries, and multiplying by the liquidity parameter (`L`). We will use JavaScript `Number` (floating-point) for the price ratios and scalars, rather than pure `bigint` math.
  - _Trade-off_: Pure `bigint` math avoids precision loss, but calculating square roots and fractional ratios in `bigint` is complex and error-prone. Since this value is used strictly for a UI display label (formatted to millions or similar approximations) and not for on-chain transaction building, floating-point precision is entirely sufficient and significantly simpler.
- **Raw Math vs Scaled Prices**: The standard CLMM formulas (`amountA = L * (1/sqrt(P) - 1/sqrt(Pb))`) expect unscaled prices or raw sqrt-prices. If we use the already-scaled prices from `priceFromSqrtPrice`, the decimal adjustments will distort the square roots. Therefore, the internal helper will compute raw square root prices directly (`sqrtPriceX64 / 2^64` and `1.0001^(tick/2)`) before applying the math.

## Proposed Approach & Rationale

1. **New Domain Helper**: Add a `calculateInRangeReserves` function in `packages/domain/src/positions/enrichment.ts` with the signature:
   ```ts
   export function calculateInRangeReserves(
     liquidity: bigint,
     sqrtPriceX64: bigint,
     tickCurrentIndex: number,
     tickSpacing: number,
   ): { amountA: bigint; amountB: bigint };
   ```
2. **Tick Bucket Calculation**: Derive the current bucket boundaries safely:
   - `tickLower = Math.floor(tickCurrentIndex / tickSpacing) * tickSpacing` (Using `Math.floor` correctly handles negative ticks).
   - `tickUpper = tickLower + tickSpacing`
3. **Reserves Math**:
   - Compute `sqrt(P)` as `Number(sqrtPriceX64) / 2^64`.
   - Compute `sqrt(Pa)` as `Math.pow(1.0001, tickLower / 2)`.
   - Compute `sqrt(Pb)` as `Math.pow(1.0001, tickUpper / 2)`.
   - Calculate `amountA = Number(liquidity) * (1/sqrt(P) - 1/sqrt(Pb))`
   - Calculate `amountB = Number(liquidity) * (sqrt(P) - sqrt(Pa))`
   - Return `{ amountA: BigInt(Math.max(0, Math.floor(amountA))), amountB: BigInt(Math.max(0, Math.floor(amountB))) }`.
4. **Integration**: In `GetPositionDetail.ts`, call this helper. If `priceA`, `priceB`, and decimals are present, use the existing `tokenAmountToUsd` to convert both reserve amounts to USD and sum them.
5. **Formatting**: Format the resulting sum similar to the original intent (e.g., `$X.XM pool depth`).
6. **Fallback**: If decimals are null, prices are unavailable, or the position is out of range (meaning current tick is not actively trading in a bucket, though standard CLMM math handles this by zeroing one token), we degrade gracefully and output `'depth unavailable'`.

## Assumptions Made

- We assume that `tickCurrentIndex` represents the active tick in Orca CLMM and that the active bucket is `[Math.floor(tickCurrentIndex / tickSpacing) * tickSpacing, ... + tickSpacing)`.
- We assume standard formatting (e.g. `$1.2M pool depth`) is desired if the depth is large, or a reasonable fallback format if the depth is small (e.g. `<$1M`). We will implement a simple formatting logic matching the original intent.
- We assume that JS `Number` precision (up to `~9e15`) is large enough to hold `liquidity` and intermediate token amounts without severe precision loss. For Solana token amounts (usually max 9 decimals), total supplies rarely exceed `2^53 - 1`, making `Number` safe for this display-only heuristic.

## Scope

- **In Scope**:
  - Adding `calculateInRangeReserves` helper to `packages/domain/src/positions/enrichment.ts`.
  - Adding unit tests for the helper in `enrichment.test.ts` against known values.
  - Updating `GetPositionDetail.ts` to compute the depth, sum the USD values, format the label, and fallback appropriately.
  - Updating fallback tests for `GetPositionDetail`.
- **Out of Scope**:
  - Fetching new prices or integrating new APIs (we use the existing `pricePort` quotes).
  - Calculating depth outside of the _current_ active tick bucket (we are only calculating the immediate in-range bucket depth).

## Risks & Concerns

- **Negative Tick Arithmetic**: Standard division or `Math.trunc` behaves differently for negative numbers in JS. We must strictly use `Math.floor(tick / tickSpacing) * tickSpacing` to avoid miscalculating `tickLower` for negative ticks.
- **Out-of-Range Behavior**: If a position itself is out of range, this formula computes the _pool's_ total liquidity depth at the current tick, not the user's position depth. This aligns with "Pool Depth", but we must ensure we use the _pool's_ liquidity, not the _position's_ liquidity. `poolData.liquidity` is correctly provided for this.

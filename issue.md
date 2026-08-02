# Pool Depth is a hardcoded 'depth unavailable' placeholder — original calc was reverted for being mathematically wrong

## Summary

The position detail screen always shows "Pool Depth: depth unavailable" — this is a long-standing, deliberate placeholder (not a regression from the recent plan-submission fix chain), because the original implementation's pool-depth formula was mathematically wrong for a concentrated-liquidity pool and was reverted rather than shipped.

## History

Commit `c423a5d` (2026-04-25) originally computed it as:

```ts
const poolDepthUsd = priceB
  ? tokenAmountToUsd(poolData.liquidity, poolData.tokenPair.decimalsB, priceB.usdValue)
  : 0;
const poolDepthLabel =
  poolDepthUsd > 0 ? `$${(poolDepthUsd / 1_000_000).toFixed(1)}M pool depth` : 'depth unavailable';
```

`poolData.liquidity` is Orca's raw CLMM liquidity parameter `L` (a sqrt-price-scaled abstract unit, not a token quantity). Passing it directly into `tokenAmountToUsd` as if it were a raw token-B amount is not a valid conversion for concentrated liquidity and produces a meaningless number.

The very next commit, `1881bbc` (same day), reverted this to a hardcoded literal:

```ts
poolDepthLabel: 'depth unavailable',
```

in `packages/application/src/use-cases/positions/GetPositionDetail.ts:141`, without implementing a correct replacement. `poolLiquidity: poolData.liquidity.toString()` is still passed through the DTO, but nothing derives a depth label from it.

## What's needed for a correct fix

`PoolData` (`packages/domain/src/positions/index.ts`) already carries everything needed to compute real in-range liquidity depth without any new external integration:

```ts
export type PoolData = {
  readonly sqrtPrice: bigint;
  readonly tickSpacing: number;
  readonly liquidity: bigint;
  readonly tickCurrentIndex: number;
  readonly tokenPair: TokenPair; // decimalsA/decimalsB
  ...
};
```

Standard CLMM in-range depth math, using the current active tick's bucket `[tickLower, tickUpper)` (derived from `tickCurrentIndex` and `tickSpacing`):

```
amountA = L * (1/sqrt(P) - 1/sqrt(Pb))
amountB = L * (sqrt(P) - sqrt(Pa))
```

where `P` is the current price, and `Pa`/`Pb` are the prices at the current tick bucket's lower/upper bounds. This yields the real token reserves actively available for trading at the current price (a meaningful "depth" figure — how much can trade before price moves out of the current bucket), convertible to USD via the existing `priceA`/`priceB` already fetched in `getPositionDetail`.

This is self-contained (no new external API dependency, unlike pulling TVL from GeckoTerminal or a similar source) and uses data already fetched for this exact call.

## Fix

- Add a liquidity-to-in-range-reserves helper (likely alongside `priceFromSqrtPrice`/`tickToPrice` in the domain package, since it's the same class of CLMM math).
- Use it in `GetPositionDetail.ts` to replace the hardcoded `poolDepthLabel: 'depth unavailable'` with a real computed value, falling back to `'depth unavailable'` only when price/decimals are genuinely unknown (mirroring the existing `decimalsKnown`/`priceA`/`priceB` degrade-gracefully pattern already used elsewhere in this function).
- Add unit tests for the new helper (known L/sqrtPrice/tick-bucket inputs → known reserve amounts) and for `GetPositionDetail`'s degraded-data fallback path.

## Acceptance criteria

- [ ] `poolDepthLabel` reflects a real, correctly-computed USD value for positions with known decimals and prices.
- [ ] Falls back to `'depth unavailable'` only when decimals/price data is genuinely missing, not unconditionally.
- [ ] New CLMM depth-math helper has unit tests against known-correct values.
- [ ] Live-verified: the position detail screen shows a real, non-placeholder pool depth figure.

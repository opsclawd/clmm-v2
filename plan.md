<!-- plan-review-required -->

# Pool Depth Calculation Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unconditional `depth unavailable` position-detail label with the USD value of the Orca pool liquidity active in the current tick bucket, while preserving graceful degradation when token prices are unavailable.

**Architecture:** Keep concentrated-liquidity math as a pure exported domain helper in `packages/domain`, then let `getPositionDetail` in `packages/application` orchestrate the existing price quotes and `tokenAmountToUsd` conversion. The DTO, presenter, view model, and screen contracts remain unchanged because `poolDepthLabel` is already a string passed through to the Pool Depth card.

**Tech Stack:** TypeScript, bigint/JavaScript `Number` display math, Vitest, pnpm workspaces, ESLint, Turbo.

---

## Goal

For position details whose pool token decimals and both USD quotes are known, calculate the raw token A and token B reserves represented by `poolData.liquidity` inside the pool's current tick-spacing bucket, convert both reserves to USD, sum them, and render the established `$X.XM pool depth` label. Preserve `depth unavailable` when either required quote is absent or price retrieval fails.

## Non-goals

- Do not treat raw CLMM liquidity `L` as a token amount.
- Do not calculate whole-pool TVL or liquidity beyond the current active tick bucket.
- Do not fetch new prices or introduce another external API, adapter, port, cache, or dependency.
- Do not change `PositionDetailDto`, the presenter/view-model/UI contract, or screen layout.
- Do not alter the existing `cannot-build-supported-detail-dto` result when token decimals are null; no detail DTO, and therefore no depth label, is produced in that case.
- Do not use this approximate display calculation in transaction construction, quoting, slippage enforcement, or any on-chain decision.
- Do not touch directional exit policy logic.

## Affected files

- `packages/domain/src/positions/enrichment.ts` — define the pure current-bucket reserve calculation.
- `packages/domain/src/positions/enrichment.test.ts` — add known-value and negative-tick unit coverage for the reserve calculation.
- `packages/domain/src/positions/index.ts` — export the new domain helper through `@clmm/domain`.
- `packages/application/src/use-cases/positions/GetPositionDetail.ts` — derive and format the USD pool-depth label from pool reserves and existing quotes.
- `packages/application/src/use-cases/positions/GetPositionDetail.test.ts` — assert the computed label and missing-price degradation behavior.

Read-only references:

- `packages/domain/src/positions/index.ts` `PoolData` definition — confirms pool liquidity, square-root price, current tick, and tick spacing are already available. This file is also modified only at its enrichment export list.
- `packages/testing/src/fixtures/positions.ts` — reuse position IDs, token metadata, and price quotes without changing shared fixtures.
- `packages/application/src/dto/index.ts` — confirm `PositionDetailDto.poolDepthLabel` remains `string`.
- `packages/ui/src/presenters/PositionDetailPresenter.ts`, `packages/ui/src/view-models/PositionDetailViewModel.ts`, and `packages/ui/src/screens/PositionDetailScreen.tsx` — confirm the label passes through to the existing Pool Depth card without transformation.

## Behavioral invariants

The named cases below must be written before their implementations.

- `calculates both reserves for a price inside the current tick bucket`: for valid `L`, `sqrtPriceX64`, tick index, and positive tick spacing, derive `[tickLower, tickUpper)` using `Math.floor(tickCurrentIndex / tickSpacing)`, then return floored, non-negative raw token reserves from the standard CLMM formulas.
- `uses floor division to select the active bucket for negative ticks`: an index such as `-96` with spacing `64` belongs to `[-128, -64)`, never `[-64, 0)`.
- `clamps boundary rounding artifacts to zero`: if floating-point arithmetic makes either reserve negative at a bucket boundary, return `0n`, never a negative bigint.
- `returns a computed pool depth label when both pool token prices are available`: the use case must use `poolData.liquidity` and current pool tick data, value both reserve sides with their own decimals and quote, sum them, and emit `$X.XM pool depth` with one decimal place.
- `returns depth unavailable when either pool token price is missing`: a partial price response is insufficient to value total depth and must not be presented as a complete result.
- `degrades pool depth when price retrieval fails`: an exception from `PricePort` still returns `kind: found`, retains zero-valued fee/reward USD degradation, and emits `depth unavailable`.
- `keeps pool depth independent of the user position range state`: pool depth is defined by the pool's current active bucket and pool liquidity, so a user's below-range or above-range state does not change the calculation or force a fallback.

## Task 1: Add current-tick reserve math to the domain

**Files:**

- Modify: `packages/domain/src/positions/enrichment.test.ts` (`calculateInRangeReserves` import and a focused describe block after the price helpers)
- Modify: `packages/domain/src/positions/enrichment.ts` (new pure exported helper beside the existing CLMM price helpers)
- Modify: `packages/domain/src/positions/index.ts` (enrichment export list only)

**Exported API change:** Add the backward-compatible `calculateInRangeReserves` export with signature `(liquidity: bigint, sqrtPriceX64: bigint, tickCurrentIndex: number, tickSpacing: number) => { amountA: bigint; amountB: bigint }`. There are no port or adapter changes.

- [ ] **Step 1: Write failing known-value tests first**

  Extend the existing import and add a dedicated describe block with literal expected values so the test does not reproduce the implementation formula as its oracle:

  ```ts
  import {
    calculateInRangeReserves,
    // existing imports remain
  } from './enrichment.js';

  describe('calculateInRangeReserves', () => {
    it('calculates both reserves for a price inside the current tick bucket', () => {
      expect(
        calculateInRangeReserves(1_000_000_000_000n, 18_476_281_010_653_904_896n, 32, 64),
      ).toEqual({ amountA: 1_596_085_163n, amountB: 1_601_200_560n });
    });

    it('uses floor division to select the active bucket for negative ticks', () => {
      expect(
        calculateInRangeReserves(1_000_000_000_000n, 18_358_416_274_770_382_848n, -96, 64),
      ).toEqual({ amountA: 1_606_332_351n, amountB: 1_590_986_108n });
    });

    it('clamps boundary rounding artifacts to zero', () => {
      expect(calculateInRangeReserves(1_000_000_000_000n, 2n ** 64n, 0, 64)).toEqual({
        amountA: 3_194_725_978n,
        amountB: 0n,
      });
    });
  });
  ```

- [ ] **Step 2: Run only the new domain cases and confirm red**

  Run: `pnpm --filter @clmm/domain exec vitest run src/positions/enrichment.test.ts -t calculateInRangeReserves`

  Expected: FAIL because `calculateInRangeReserves` is not exported.

- [ ] **Step 3: Implement the minimal pure reserve helper**

  Add the exact bucket and raw-square-root calculation to `enrichment.ts`; do not call `priceFromSqrtPrice` because its decimal scaling is invalid for these formulas:

  ```ts
  export function calculateInRangeReserves(
    liquidity: bigint,
    sqrtPriceX64: bigint,
    tickCurrentIndex: number,
    tickSpacing: number,
  ): { amountA: bigint; amountB: bigint } {
    const tickLower = Math.floor(tickCurrentIndex / tickSpacing) * tickSpacing;
    const tickUpper = tickLower + tickSpacing;
    const sqrtPrice = Number(sqrtPriceX64) / 2 ** 64;
    const sqrtPriceLower = Math.pow(1.0001, tickLower / 2);
    const sqrtPriceUpper = Math.pow(1.0001, tickUpper / 2);
    const liquidityNumber = Number(liquidity);

    const amountA = liquidityNumber * (1 / sqrtPrice - 1 / sqrtPriceUpper);
    const amountB = liquidityNumber * (sqrtPrice - sqrtPriceLower);

    return {
      amountA: BigInt(Math.max(0, Math.floor(amountA))),
      amountB: BigInt(Math.max(0, Math.floor(amountB))),
    };
  }
  ```

  This helper assumes valid Orca `PoolData`: positive tick spacing, finite protocol tick values, and a positive X64 square-root price. Do not widen scope with defensive behavior for impossible adapter data unless a failing repository test demonstrates that contract is not enforced.

- [ ] **Step 4: Re-export the helper from the domain package**

  Add `calculateInRangeReserves` to the existing export block in `packages/domain/src/positions/index.ts`, allowing the application layer to import it only through `@clmm/domain`.

- [ ] **Step 5: Verify the focused domain change**

  Run: `pnpm --filter @clmm/domain exec vitest run src/positions/enrichment.test.ts`

  Expected: PASS, including all existing enrichment cases and the three new reserve cases.

  Run: `pnpm --filter @clmm/domain exec eslint src/positions/enrichment.ts src/positions/enrichment.test.ts src/positions/index.ts`

  Expected: PASS with no lint errors.

  Run: `pnpm --filter @clmm/domain typecheck`

  Expected: PASS with the new exported signature represented in the domain build surface.

- [ ] **Step 6: Commit the domain unit**

  ```bash
  git add packages/domain/src/positions/enrichment.ts packages/domain/src/positions/enrichment.test.ts packages/domain/src/positions/index.ts
  git commit -m "feat(domain): calculate current tick pool reserves"
  ```

## Task 2: Build the USD pool-depth label in position details

**Files:**

- Modify: `packages/application/src/use-cases/positions/GetPositionDetail.test.ts` (computed-label, partial-price, failure, and position-range cases within the existing `GetPositionDetail` describe block)
- Modify: `packages/application/src/use-cases/positions/GetPositionDetail.ts` (domain import and pool-depth derivation before DTO construction)
- Reference only: `packages/testing/src/fixtures/positions.ts`
- Reference only: `packages/application/src/dto/index.ts`
- Reference only: `packages/ui/src/presenters/PositionDetailPresenter.ts`
- Reference only: `packages/ui/src/view-models/PositionDetailViewModel.ts`
- Reference only: `packages/ui/src/screens/PositionDetailScreen.tsx`

**Exported API change:** None. `getPositionDetail` and `PositionDetailDto.poolDepthLabel` retain their existing signatures.

- [ ] **Step 1: Make the happy-path assertion exact and add missing-price tests first**

  In the first test, create coherent active-bucket pool data locally rather than changing the shared fixture, and pass the corresponding detail to the fake read port:

  ```ts
  const poolData = {
    ...FIXTURE_POOL_DATA,
    sqrtPrice: 2n ** 64n,
    tickCurrentIndex: 0,
    tickSpacing: 64,
    liquidity: 1_000_000_000_000_000n,
  };
  const positionDetail = { ...FIXTURE_POSITION_DETAIL, poolData };
  const positionReadPort = new FakeSupportedPositionReadPort(
    [FIXTURE_POSITION_IN_RANGE],
    { [FIXTURE_POSITION_IN_RANGE.poolId]: poolData },
    positionDetail,
  );
  ```

  Preserve the existing fee assertions and replace the weak `toBeDefined()` depth assertion with:

  ```ts
  expect(result.detailDto.poolDepthLabel).toBe('$0.5M pool depth');
  ```

  Add one test that exercises both partial response shapes without duplicating the setup. Each result must still be `kind: found` and use the exact fallback label:

  ```ts
  it('returns depth unavailable when either pool token price is missing', async () => {
    for (const quotes of [[FIXTURE_SOL_PRICE_QUOTE], [FIXTURE_USDC_PRICE_QUOTE]]) {
      const result = await getPositionDetail({
        walletId: FIXTURE_WALLET_ID,
        positionId: FIXTURE_POSITION_ID,
        positionReadPort: new FakeSupportedPositionReadPort(
          [FIXTURE_POSITION_IN_RANGE],
          { [FIXTURE_POSITION_IN_RANGE.poolId]: FIXTURE_POOL_DATA },
          FIXTURE_POSITION_DETAIL,
        ),
        pricePort: new FakePricePort(quotes),
      });

      expect(result.kind).toBe('found');
      if (result.kind === 'found') {
        expect(result.detailDto.poolDepthLabel).toBe('depth unavailable');
      }
    }
  });
  ```

  Keep the existing throwing-price test named `degrades gracefully when price fetch fails` and its exact fallback assertion.

- [ ] **Step 2: Add the pool-versus-position scope regression first**

  Add `keeps pool depth independent of the user position range state`, building a detail whose `position.rangeState` is `below-range` while retaining coherent pool data and both quotes:

  ```ts
  it('keeps pool depth independent of the user position range state', async () => {
    const position = {
      ...FIXTURE_POSITION_IN_RANGE,
      rangeState: { kind: 'below-range' as const, currentPrice: -1 },
    };
    const poolData = {
      ...FIXTURE_POOL_DATA,
      sqrtPrice: 2n ** 64n,
      tickCurrentIndex: 0,
      tickSpacing: 64,
      liquidity: 1_000_000_000_000_000n,
    };
    const result = await getPositionDetail({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      positionReadPort: new FakeSupportedPositionReadPort(
        [position],
        { [position.poolId]: poolData },
        { ...FIXTURE_POSITION_DETAIL, position, poolData },
      ),
      pricePort: new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]),
    });

    expect(result.kind).toBe('found');
    if (result.kind === 'found') {
      expect(result.detailDto.poolDepthLabel).toBe('$0.5M pool depth');
    }
  });
  ```

  This locks the metric to `poolData.tickCurrentIndex` and `poolData.liquidity`; never use the user's bounds, range state, or `positionLiquidity` to calculate Pool Depth.

- [ ] **Step 3: Run only the depth-related application cases and confirm red**

  Run: `pnpm --filter @clmm/application exec vitest run src/use-cases/positions/GetPositionDetail.test.ts -t "pool depth|enriched detail|price fetch"`

  Expected: FAIL because the happy path still returns the unconditional placeholder.

- [ ] **Step 4: Compute, value, and format current-bucket pool reserves**

  Import `calculateInRangeReserves` from `@clmm/domain`. After resolving `priceA` and `priceB`, calculate a complete label only when both quotes exist:

  ```ts
  let poolDepthLabel = 'depth unavailable';
  if (priceA && priceB) {
    const reserves = calculateInRangeReserves(
      poolData.liquidity,
      poolData.sqrtPrice,
      poolData.tickCurrentIndex,
      poolData.tickSpacing,
    );
    const poolDepthUsd =
      tokenAmountToUsd(reserves.amountA, decimalsA, priceA.usdValue) +
      tokenAmountToUsd(reserves.amountB, decimalsB, priceB.usdValue);
    poolDepthLabel = `$${(poolDepthUsd / 1_000_000).toFixed(1)}M pool depth`;
  }
  ```

  Assign this local `poolDepthLabel` in the DTO instead of the literal. A known zero depth is still known data and therefore formats as `$0.0M pool depth`; reserve `depth unavailable` for missing quotes or a failed quote request. The existing early null-decimal result remains unchanged.

- [ ] **Step 5: Verify the application behavior and unchanged presentation path**

  Run: `pnpm --filter @clmm/application exec vitest run src/use-cases/positions/GetPositionDetail.test.ts`

  Expected: PASS, including the computed `$0.5M pool depth`, both partial-quote fallbacks, the throwing-price fallback, and the range-state-independent case.

  Run: `pnpm --filter @clmm/application exec eslint src/use-cases/positions/GetPositionDetail.ts src/use-cases/positions/GetPositionDetail.test.ts`

  Expected: PASS with no lint errors.

  Run: `pnpm --filter @clmm/application typecheck`

  Expected: PASS against the new `@clmm/domain` export and unchanged DTO contract.

  Inspect only the existing Pool Depth binding sections in the reference files (presenter normalization, view-model assignment, and screen card) during review; no edits are expected because all three already forward the string unchanged.

- [ ] **Step 6: Commit the application unit**

  ```bash
  git add packages/application/src/use-cases/positions/GetPositionDetail.ts packages/application/src/use-cases/positions/GetPositionDetail.test.ts
  git commit -m "fix(application): show current bucket pool depth"
  ```

## Tests to add or update

- `packages/domain/src/positions/enrichment.test.ts`
  - Known midpoint in `[0, 64)` produces exact non-zero token A and B reserves.
  - Negative current tick uses floor division and the correct negative bucket.
  - Lower-bound calculation clamps the inactive side to `0n`.
- `packages/application/src/use-cases/positions/GetPositionDetail.test.ts`
  - Known pool state and both prices produce exact `$0.5M pool depth` output.
  - Missing either token A or token B quote produces `depth unavailable`.
  - A thrown price request continues to produce `depth unavailable` without failing position detail.
  - A user position outside its range still reports pool depth from the pool's active bucket.
- No UI test update is required: the screen already renders the supplied label verbatim, and neither the DTO nor UI contract changes.

## Validation commands

Task-local commands are listed in each task and target only that task's changed package/files. After both implementation tasks, the dedicated validate phase should run the repository-required broad checks because the change adds a shared domain export consumed across a package boundary:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
```

For the live acceptance check, run the existing application normally with `pnpm dev`, open a supported position detail with live price quotes, and verify that the Pool Depth card contains a `$...M pool depth` value rather than `depth unavailable`. Also exercise price unavailability in a non-production environment and confirm that the screen remains usable with the fallback label. Record the pool ID, observed label, and verification time in the issue or PR; this is operational evidence, not a source-code task.

## Risk areas

- `Number(bigint)` loses integer precision for sufficiently large liquidity. This is accepted only because the result is a one-decimal-million UI estimate; raw amounts are floored back to bigint before the existing bigint-safe USD conversion.
- Raw square-root prices must remain unscaled. Reusing `priceFromSqrtPrice`, which applies token-decimal scaling, would silently corrupt the CLMM formulas.
- Negative tick bucket selection must use `Math.floor`; truncation toward zero selects the wrong interval.
- Pool fixture values can be internally inconsistent (tick index and X64 price from different states). New exact tests must use coherent local values and must not rewrite broadly shared testing fixtures.
- Missing one side's quote cannot produce a trustworthy total and must fall back rather than show a partial value.
- The label format rounds every known value to one decimal million, including values below one million and exact zero. This deliberately matches the established UI intent and avoids expanding scope into a new formatting system.
- Pool depth is pool-scoped, not position-scoped. Do not substitute `positionLiquidity` or condition the result on the user's range state.

## Stop conditions

- Abort if official Orca semantics show that `poolData.liquidity` is not the active liquidity at `tickCurrentIndex`, or that the bucket boundaries cannot be derived from `tickSpacing` as specified; shipping plausible-looking but directionally or mathematically wrong liquidity is worse than preserving the placeholder.
- Abort if repository data permits `tickSpacing <= 0`, non-positive `sqrtPrice`, or non-finite tick values; those invalid states require an explicit domain-contract design instead of silently extending this display helper.
- Abort if a required token quote is intentionally absent for supported pools in production; product direction is needed before showing partial depth or introducing another price source.
- Abort if implementing this plan requires changing a port/interface, adapter, DTO signature, UI contract, or external API integration; that is outside the reviewed design and requires replanning. If a port change is later approved, its declaration and every implementation must be kept in the same task.
- Abort live verification if no supported live position or safe way to simulate price unavailability exists; report that acceptance item as unverified rather than fabricating evidence.

## Assumptions and design reconciliation

- The issue's acceptance language and the design's risk analysis define Pool Depth as pool-scoped. Therefore, an out-of-range user position does not force `depth unavailable`; the pool still has an active current tick bucket.
- Existing null-decimal behavior takes precedence over the design's shorthand fallback statement: `getPositionDetail` returns `cannot-build-supported-detail-dto` before enrichment, so there is no DTO label to populate.
- Both pool-token quotes are required even if one reserve rounds to zero at a bucket boundary, because the complete-depth rule must not depend on floating-point boundary artifacts.
- The plan-review marker is required because the implementation changes and tests the missing/failed-price degradation path. It adds no retry loop, explicit state machine, irreversible side effect, database write, or external post.

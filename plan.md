<!-- plan-review-required -->

# SOL/USDC Intelligence Bundle Raw LP Facts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend both successful SOL/USDC position-insight responses with truthful full-liquidity principal token amounts and reusable USD quote lineage, while preserving zero values and degrading optional fact failures to scoped warnings.

**Architecture:** Keep Orca-specific principal math in a focused adapter helper and attach its nullable result to the existing domain `PositionDetail`; do not add another wallet scan, endpoint, or execution quote. Extend `PriceQuote` with provider provenance and preserve the cache entry's actual fetch time, then let the existing application position builder serialize principal and price facts, compute compatibility totals from those same facts, and own consumer-facing warnings. The controller remains a pass-through over the shared `/positions` and `/bundle` use-case path.

**Tech Stack:** TypeScript, Vitest, pnpm workspaces, `@solana/kit` v6, `@orca-so/whirlpools-core` v3.1.0, `@orca-so/whirlpools-client` v6.2.1, Jupiter Price API v3, NestJS.

---

## Goal

Expose the raw facts CLMM V2 owns for downstream inventory-composition and valuation-lineage derivation: principal-only token A/B amounts for 100% of position liquidity, and every successfully returned pool/reward mint USD quote with provider and actual quote time. A successful raw `0n` must serialize as `'0'`; unavailable enrichment must remain absent or `null` and produce an explicit scoped warning.

## Non-goals

- Do not add inventory-skew labels, dominant-asset/one-sided judgments, position USD value, fee APR/APY, fee-to-volatility ratios, recommendations, target posture, or swap direction.
- Do not change routes, authentication, top-level S/R placement, trigger behavior, primary pool/list/detail failure unions, or existing 503 responses.
- Do not add a composition endpoint, bundle-only DTO fork, second owner scan, duplicate position-account fetch, execution instruction construction, or `closePositionInstructions` reuse.
- Do not change the existing live fee/reward fail-closed behavior or fall back to checkpointed Orca accumulators.
- Do not add retries, historical fee/deposit/withdrawal data, wallet balances, pool TVL/24-hour fees, on-chain receipts, attestations, or UI work.
- Do not derive the release-blocker lower/upper-bound exit mapping anywhere in this read path.

## Affected files

- `packages/domain/src/positions/index.ts` — add `PriceQuote.source` and nullable principal amounts on `PositionDetail`.
- `packages/testing/src/fixtures/positions.ts` — provide explicit quote provenance and representative principal amounts for shared typed fixtures.
- `packages/adapters/src/outbound/price/JupiterPriceAdapter.ts` — emit `jupiter_price_v3` and return each cache entry's real fetch timestamp.
- `packages/adapters/src/outbound/price/JupiterPriceAdapter.test.ts` — cover provider provenance and cache-hit timestamp truthfulness.
- `packages/adapters/src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.ts` — new adapter-local full-liquidity principal quote helper.
- `packages/adapters/src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.test.ts` — cover success, zeros, invalid input, and sanitized failures.
- `packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts` — invoke the principal helper with already-fetched position/pool state and fail soft with structured logging.
- `packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts` — cover principal success and optional-failure behavior in the existing `fetchPositionDetail` block.
- `packages/adapters/src/composition/AdaptersModule.ts` — update `SolanaPositionSnapshotReader` constructor call to pass the principal helper (位置 after fee/reward helper).
- `packages/adapters/src/inbound/http/AppModule.ts` — update `SolanaPositionSnapshotReader` provider registration to match new constructor signature.
- `packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.test.ts` — update test fixtures and assertions that reference `PositionDetail` or `SolanaPositionSnapshotReader`.
- `packages/adapters/src/outbound/solana-position-reads/SolanaReadPathEfficiency.integration.test.ts` — update integration test assertions that reference `PositionDetail` fields.
- `packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.test.ts` — update test fixtures referencing position detail types.
- `packages/application/src/dto/index.ts` — add raw principal/price DTOs, position fields, warning codes, and `scope.tokenMint`.
- `packages/application/src/use-cases/insights/buildSolUsdcPositionInsight.ts` — serialize facts, preserve zero/null semantics, sort quote facts, and emit position/token-scoped warnings.
- `packages/application/src/use-cases/insights/buildSolUsdcPositionInsight.test.ts` — cover the new builder contract and compatibility valuations.
- `packages/application/src/use-cases/insights/GetSolUsdcInsightPositions.ts` — retain quote time/source in the shared price map without changing read ordering.
- `packages/application/src/use-cases/insights/GetSolUsdcInsightPositions.test.ts` — cover missing/throwing quote enrichment and shared snapshot semantics.
- `packages/application/src/use-cases/insights/GetSolUsdcInsightBundle.test.ts` — verify bundle propagation, top-level S/R placement, and aggregate data quality.
- `packages/adapters/src/inbound/http/InsightsDataController.test.ts` — verify both successful HTTP surfaces expose the identical additive position shape.
- `docs/superpowers/specs/2026-05-01-sol-usdc-insights-data-api-design.md` — document the additive raw-fact schema, warning semantics, and compatibility guidance.

## Behavioral invariants

The named invariants below are mandatory tests written before implementation in the task that owns them:

1. **Cached quote time is truthful:** a cache hit returns the original entry `fetchedAt` as `quotedAt`, never the later lookup time, and always reports `source: 'jupiter_price_v3'`.
2. **Principal quote is principal-only:** valid full-liquidity inputs return Orca `tokenEstA`/`tokenEstB` unchanged and never add fee/reward amounts or expose minimum/slippage amounts.
3. **Principal zero is data:** a successful quote containing zero on either side remains an `ok` result with `0n`; it is never converted to unavailable.
4. **Principal invalid input is classified:** negative liquidity or non-ascending ticks returns `unavailable` with `reason: 'quote-input-invalid'` without calling Orca quote math; zero liquidity remains a valid quote input so an empty position can report real zeros.
5. **Principal quote failure is bounded:** thrown Orca errors return `reason: 'principal-quote-failed'` with error name and a message capped at 200 characters.
6. **Principal failure is optional:** when live fee/reward quoting succeeds but principal quoting is unavailable, the detail read still succeeds with `principalTokenAmounts: null` and emits exactly one bounded structured warning.
7. **Primary detail failures remain primary:** position/pool/ownership/live fee-reward failures still return `null`; principal enrichment must not weaken those paths.
8. **Missing principal is explicit:** a null detail fact serializes as `principalTokenAmounts: null` and adds one `principal_token_amounts_unavailable` warning scoped to position and pool.
9. **Principal values preserve exactness:** successful bigint amounts, including either or both zeros, serialize as decimal strings with the pool mint/symbol/decimals and the helper completion time.
10. **Missing price is token-scoped:** every requested pool or non-empty reward mint without a returned quote is absent from `usdPriceQuotes` and adds one `usd_price_quote_unavailable` warning scoped to position and token mint.
11. **Quote facts are deterministic and authoritative:** successful quote entries are sorted lexicographically by mint and carry the exact source and `quotedAt` returned by `PricePort`.
12. **Compatibility totals share lineage:** `unclaimedFeesUsd` and `unclaimedRewardsUsd` use the same retained map serialized as `usdPriceQuotes`; missing required decimals/quotes yields `null`, while known zero raw amounts with complete quotes yields `0`.
13. **Partial is warnings-derived:** on both positions and bundle responses, `dataQuality.partial` equals `warnings.length > 0` after the new warnings are composed.
14. **Shared HTTP shape remains additive:** `/positions/:walletId` and `/bundle/:walletId` expose the same new position fields while S/R remains only at bundle top level and existing fields/errors remain unchanged.

## Task 1: Preserve USD price source and cache observation time

**Files:**

- Modify: `packages/domain/src/positions/index.ts` (`PriceQuote` only)
- Modify: `packages/testing/src/fixtures/positions.ts` (`FIXTURE_SOL_PRICE_QUOTE` and `FIXTURE_USDC_PRICE_QUOTE` only)
- Modify: `packages/adapters/src/outbound/price/JupiterPriceAdapter.ts`
- Modify: `packages/adapters/src/outbound/price/JupiterPriceAdapter.test.ts`

**Invariants to test first:** `returns Jupiter source on every quote`, `reuses the original fetchedAt as quotedAt on a cache hit`.

- [ ] **Step 1: Add failing provider and cache-time tests.** In `JupiterPriceAdapter.test.ts`, use `vi.spyOn(Date, 'now')` with values `1_000` for the first request and `2_000` for the cache hit. Assert the first and second quote both equal `makeClockTimestamp(1_000)` and both have `source === 'jupiter_price_v3'`; restore the spy in `afterEach`.

- [ ] **Step 2: Run the focused test before implementation.**

  ```bash
  pnpm --filter @clmm/adapters test -- src/outbound/price/JupiterPriceAdapter.test.ts -t 'source|original fetchedAt'
  ```

  Expected: FAIL because `source` is absent and cache hits currently stamp a new `quotedAt`.

- [ ] **Step 3: Extend the exported domain quote and all typed producers together.** Add the required member to `PriceQuote`:

  ```ts
  export type PriceQuote = {
    readonly tokenMint: string;
    readonly usdValue: number;
    readonly symbol: string;
    readonly quotedAt: ClockTimestamp;
    readonly source: string;
  };
  ```

  Add `source: 'test_price_fixture'` to both shared fixtures. In `JupiterPriceAdapter.getPrices`, delete the request-wide `quotedAt` variable and build each result from its cache entry:

  ```ts
  results.push({
    tokenMint: mint,
    usdValue: entry.price,
    symbol: entry.symbol,
    quotedAt: makeClockTimestamp(entry.fetchedAt),
    source: 'jupiter_price_v3',
  });
  ```

- [ ] **Step 4: Verify only this contract slice.**

  ```bash
  pnpm --filter @clmm/adapters test -- src/outbound/price/JupiterPriceAdapter.test.ts
  pnpm exec eslint packages/domain/src/positions/index.ts packages/testing/src/fixtures/positions.ts packages/adapters/src/outbound/price/JupiterPriceAdapter.ts packages/adapters/src/outbound/price/JupiterPriceAdapter.test.ts
  pnpm exec prettier --check packages/domain/src/positions/index.ts packages/testing/src/fixtures/positions.ts packages/adapters/src/outbound/price/JupiterPriceAdapter.ts packages/adapters/src/outbound/price/JupiterPriceAdapter.test.ts
  ```

  Expected: all Jupiter tests pass, including unchanged batching/error behavior; lint and formatting pass. The implement loop's automatic `pnpm -r typecheck` gate must also pass before commit.

- [ ] **Step 5: Commit the truthful quote contract.**

  ```bash
  git add packages/domain/src/positions/index.ts packages/testing/src/fixtures/positions.ts packages/adapters/src/outbound/price/JupiterPriceAdapter.ts packages/adapters/src/outbound/price/JupiterPriceAdapter.test.ts
  git commit -m "feat: preserve price quote provenance"
  ```

## Task 2: Add the Orca full-liquidity principal quote helper

**Files:**

- Create: `packages/adapters/src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.ts`
- Create: `packages/adapters/src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.test.ts`

**Invariants to test first:** `returns estimated principal amounts for full liquidity`, `preserves successful zero principal amounts`, `rejects invalid principal quote inputs before calling Orca`, `sanitizes a thrown principal quote failure`.

- [ ] **Step 1: Consult the installed-version official Orca API before coding.** Use Context7/current official Orca documentation for `@orca-so/whirlpools-core` v3.1.0 and confirm the installed `decreaseLiquidityQuote(liquidity, slippageToleranceBps, sqrtPrice, tickLowerIndex, tickUpperIndex)` signature and that `tokenEstA`/`tokenEstB` are estimated principal amounts. Do not use `closePositionInstructions`, `tokenMinA`, `tokenMinB`, fee quotes, or reward quotes. If the official v3.1.0 API does not expose an instruction-free estimated-amount function with these semantics, stop under the documented stop condition instead of improvising protocol math.

- [ ] **Step 2: Write the new helper tests first.** Mock `decreaseLiquidityQuote` and test exact forwarding of liquidity, current sqrt price, lower tick, and upper tick; assert returned estimates are unchanged. Add separate zero, invalid-liquidity/invalid-bounds, and thrown-error cases. Use these exact test names:

  ```ts
  it('returns estimated principal amounts for full liquidity', async () => {});
  it('preserves successful zero principal amounts', async () => {});
  it('rejects invalid principal quote inputs before calling Orca', async () => {});
  it('sanitizes a thrown principal quote failure', async () => {});
  ```

- [ ] **Step 3: Run the new test and verify it fails because the helper is absent.**

  ```bash
  pnpm --filter @clmm/adapters test -- src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.test.ts
  ```

  Expected: FAIL with the helper module missing.

- [ ] **Step 4: Implement the focused discriminated-union helper.** Keep it synchronous internally because the core quote is pure, but expose `quote` as a normal method. Use the documented estimated fields and a zero-bps argument only because the SDK signature requires it; the returned contract must never expose minimum amounts:

  ```ts
  import { decreaseLiquidityQuote } from '@orca-so/whirlpools-core';

  export type PrincipalTokenAmountsQuoteResult =
    | { kind: 'ok'; amountA: bigint; amountB: bigint }
    | {
        kind: 'unavailable';
        reason: 'quote-input-invalid' | 'principal-quote-failed';
        errorName?: string;
        errorMessage?: string;
      };

  export type PrincipalQuoteArgs = {
    liquidity: bigint;
    sqrtPrice: bigint;
    tickLowerIndex: number;
    tickUpperIndex: number;
  };

  export class OrcaPositionPrincipalQuoteHelper {
    quote(args: PrincipalQuoteArgs): PrincipalTokenAmountsQuoteResult {
      if (args.liquidity < 0n || args.tickLowerIndex >= args.tickUpperIndex) {
        return { kind: 'unavailable', reason: 'quote-input-invalid' };
      }
      try {
        const quote = decreaseLiquidityQuote(
          args.liquidity,
          0,
          args.sqrtPrice,
          args.tickLowerIndex,
          args.tickUpperIndex,
        );
        return { kind: 'ok', amountA: quote.tokenEstA, amountB: quote.tokenEstB };
      } catch (error) {
        const described =
          error instanceof Error
            ? { errorName: error.name, errorMessage: error.message.slice(0, 200) }
            : { errorMessage: String(error).slice(0, 200) };
        return { kind: 'unavailable', reason: 'principal-quote-failed', ...described };
      }
    }
  }
  ```

  If official typing uses a named bps wrapper or a different parameter order, mirror that exact official signature while preserving the tested inputs and `tokenEstA`/`tokenEstB` output contract.

- [ ] **Step 5: Verify the helper only.**

  ```bash
  pnpm --filter @clmm/adapters test -- src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.test.ts
  pnpm exec eslint packages/adapters/src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.ts packages/adapters/src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.test.ts
  pnpm exec prettier --check packages/adapters/src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.ts packages/adapters/src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.test.ts
  ```

  Expected: all four named cases pass; lint and formatting pass. The automatic workspace typecheck gate must pass before commit.

- [ ] **Step 6: Commit the adapter-local quote primitive.**

  ```bash
  git add packages/adapters/src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.ts packages/adapters/src/outbound/solana-position-reads/OrcaPositionPrincipalQuoteHelper.test.ts
  git commit -m "feat: quote Orca position principal amounts"
  ```

## Task 3: Attach optional principal amounts to the existing detail read

**Files:**

- Modify: `packages/domain/src/positions/index.ts` (`PositionDetail` only)
- Modify: `packages/testing/src/fixtures/positions.ts` (`FIXTURE_POSITION_DETAIL` only)
- Modify: `packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts`
- Modify: `packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts` (`fetchPositionDetail` describe block only)
- Modify: `packages/adapters/src/composition/AdaptersModule.ts` (constructor call for `SolanaPositionSnapshotReader`; add principal helper as 4th arg)
- Modify: `packages/adapters/src/inbound/http/AppModule.ts` (provider registration for `SolanaPositionSnapshotReader`; add principal helper as 4th arg)
- Modify: `packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.test.ts` (update reader instantiation to pass 4th principal helper arg)
- Modify: `packages/adapters/src/outbound/solana-position-reads/SolanaReadPathEfficiency.integration.test.ts` (integration assertions; update reader instantiation)
- Modify: `packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.test.ts` (position detail fixture updates; update reader instantiation)

**Invariants to test first:** `returns principal amounts and their completion time with a successful detail`, `preserves zero amounts from a successful principal quote`, `returns detail with null principal amounts and one warning when principal quoting is unavailable`, `keeps live fee reward failure as a null detail`.

- [ ] **Step 1: Extend the existing reader test setup with an injected principal helper.** Add the four named cases above only inside `describe('fetchPositionDetail')`. Stub `Date.now()` at `1_700_000_000_123` for the success case and assert the principal helper receives `pos.liquidity`, `w.sqrtPrice`, and the fetched bounds. In the unavailable case, assert the detail is non-null, principal is null, and the sole new log call is:

  ```ts
  expect(observability.log).toHaveBeenCalledWith(
    'warn',
    'orca_position_principal_quote_unavailable',
    expect.objectContaining({
      positionId: MOCK_POSITION_MINT,
      walletId: MOCK_WALLET,
      poolId: MOCK_WHIRLPOOL,
      lowerTick: -18304,
      upperTick: -17956,
      currentTick: -18130,
      reason: 'principal-quote-failed',
    }),
  );
  ```

  Also serialize the log arguments with a bigint-safe replacer and prove they contain no raw account/RPC payload.

- [ ] **Step 2: Run only the new reader cases and confirm failure.**

  ```bash
  pnpm --filter @clmm/adapters test -- src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts -t 'principal|live fee reward failure'
  ```

  Expected: FAIL because the reader has no principal helper/result yet.

- [ ] **Step 3: Change the exported `PositionDetail` shape and its shared fixture in the same task.** Add:

  ```ts
  readonly principalTokenAmounts: {
    readonly amountA: bigint;
    readonly amountB: bigint;
    readonly observedAt: ClockTimestamp;
  } | null;
  ```

  Set the shared fixture to `{ amountA: 250_000_000n, amountB: 12_500_000n, observedAt: makeClockTimestamp(1_000_100) }`. Do not add these fields to the older `PositionDetailDto`; this issue extends the insight read model, while the existing position-detail endpoint may continue ignoring the additional raw domain member.

- [ ] **Step 4: Inject and invoke the helper without refetching accounts.** Add a fourth optional constructor parameter after the existing fee/reward helper:

  ```ts
  private readonly principalQuoteHelper: OrcaPositionPrincipalQuoteHelper =
    new OrcaPositionPrincipalQuoteHelper(),
  ```

  After the live fee/reward quote succeeds, call it with `pos.liquidity`, `w.sqrtPrice`, `pos.tickLowerIndex`, and `pos.tickUpperIndex`. On `ok`, capture `makeClockTimestamp(Date.now())` immediately after completion. On `unavailable`, set the field to `null`, emit one bounded `orca_position_principal_quote_unavailable` warning with position/wallet/pool IDs, bounds, current tick, stable reason, and already-sanitized optional error metadata, then continue returning the detail. Do not include account objects, RPC responses, or liquidity values in the log.

- [ ] **Step 5: Update all `SolanaPositionSnapshotReader` call sites to pass the principal helper (or let the optional default apply).** In `AdaptersModule.ts` and `AppModule.ts`, pass the principal helper as the 4th constructor argument after the fee/reward helper. In `OrcaPositionReadAdapter.test.ts`, `SolanaReadPathEfficiency.integration.test.ts`, and `SolanaExecutionPreparationAdapter.test.ts`, update each `new SolanaPositionSnapshotReader(...)` instantiation to pass the principal helper (or a mock thereof). Since the parameter is optional with a default, 1-arg test instantiations remain valid TypeScript — but test files that want to control or verify the helper should explicitly construct and pass it.

- [ ] **Step 6: Keep primary failure ordering unchanged.** Position fetch, ownership, Whirlpool fetch, and live fee/reward quote must still return `null` before principal quoting. Return the new member beside the existing fields:

  ```ts
  return {
    position,
    poolData,
    fees: quote.fees,
    positionLiquidity: pos.liquidity,
    principalTokenAmounts,
  };
  ```

- [ ] **Step 7: Verify the modified detail slice.** Although `SolanaPositionSnapshotReader.test.ts` exceeds 500 lines, this is an implementation task and touches only its existing `fetchPositionDetail` block; do not refactor unrelated reader cases.

  ```bash
  pnpm --filter @clmm/adapters test -- src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts
  pnpm --filter @clmm/testing test -- src/contracts/PositionReadPortContract.ts
  pnpm exec eslint packages/domain/src/positions/index.ts packages/testing/src/fixtures/positions.ts packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts packages/adapters/src/composition/AdaptersModule.ts packages/adapters/src/inbound/http/AppModule.ts packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.test.ts packages/adapters/src/outbound/solana-position-reads/SolanaReadPathEfficiency.integration.test.ts packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.test.ts
  pnpm exec prettier --check packages/domain/src/positions/index.ts packages/testing/src/fixtures/positions.ts packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts packages/adapters/src/composition/AdaptersModule.ts packages/adapters/src/inbound/http/AppModule.ts packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.test.ts packages/adapters/src/outbound/solana-position-reads/SolanaReadPathEfficiency.integration.test.ts packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.test.ts
  ```

  Expected: reader and port-contract tests pass; lint and formatting pass; no owner/position/pool refetch is introduced. The automatic workspace typecheck gate must pass before commit.

- [ ] **Step 8: Commit the complete domain-to-adapter detail contract.**

  ```bash
  git add packages/domain/src/positions/index.ts packages/testing/src/fixtures/positions.ts packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts packages/adapters/src/composition/AdaptersModule.ts packages/adapters/src/inbound/http/AppModule.ts packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.test.ts packages/adapters/src/outbound/solana-position-reads/SolanaReadPathEfficiency.integration.test.ts packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.test.ts
  git commit -m "feat: enrich position details with principal amounts"
  ```

## Task 4: Expose raw facts and scoped warnings through both insight responses

**Files:**

- Modify: `packages/application/src/dto/index.ts` (insight warning and SOL/USDC position DTO section only)
- Modify: `packages/application/src/use-cases/insights/buildSolUsdcPositionInsight.ts`
- Modify: `packages/application/src/use-cases/insights/buildSolUsdcPositionInsight.test.ts`
- Modify: `packages/application/src/use-cases/insights/GetSolUsdcInsightPositions.ts` (`fetchPriceMap` and builder call only)
- Modify: `packages/application/src/use-cases/insights/GetSolUsdcInsightPositions.test.ts`
- Modify: `packages/application/src/use-cases/insights/GetSolUsdcInsightBundle.test.ts`
- Modify: `packages/adapters/src/inbound/http/InsightsDataController.test.ts` (successful positions/bundle cases only)
- Modify: `docs/superpowers/specs/2026-05-01-sol-usdc-insights-data-api-design.md` (DTO, valuation, warning, test, compatibility sections only)

**Invariants to test first:** `serializes exact principal amounts including zero`, `warns and returns null when principal amounts are unavailable`, `serializes returned price quotes in mint order with exact lineage`, `warns once per requested missing mint and omits its quote`, `computes known zero compatibility totals from serialized quotes`, `sets affected totals null while retaining compatibility warnings`, `sets partial exactly when raw-fact warnings exist`, `returns the same additive facts from positions and bundle without copying S/R`.

- [ ] **Step 1: Add builder tests first.** Enrich the test-local price maps with `quotedAt` and `source`. Add the first six named cases above. Assert exact DTO objects, including `'0'`, mint/symbol/decimals, `source: 'orca_full_liquidity_quote'`, `basis: 'principal-only'`, quote times as numbers, and lexicographic mint order. For missing SOL and reward quotes, assert one new token-scoped warning per missing mint plus the existing single `fee_reward_usd_unavailable` compatibility warning; do not fabricate zero quote entries.

- [ ] **Step 2: Add use-case, bundle, and controller contract tests before implementation.** In `GetSolUsdcInsightPositions.test.ts`, prove a partial price response preserves its returned lineage and emits missing-mint warnings, and a thrown price port yields an empty quote list plus token warnings. In `GetSolUsdcInsightBundle.test.ts`, assert principal and prices propagate unchanged and `partial === (warnings.length > 0)`. In the two existing successful `InsightsDataController.test.ts` cases, assert the same new position fields are returned from `/positions` and `/bundle`, and assert `srLevels` remains absent from each position.

- [ ] **Step 3: Run the focused application/HTTP tests and confirm the contract is absent.**

  ```bash
  pnpm --filter @clmm/application test -- src/use-cases/insights/buildSolUsdcPositionInsight.test.ts src/use-cases/insights/GetSolUsdcInsightPositions.test.ts src/use-cases/insights/GetSolUsdcInsightBundle.test.ts
  pnpm --filter @clmm/adapters test -- src/inbound/http/InsightsDataController.test.ts -t 'returns the snapshot DTO|returns the bundle DTO'
  ```

  Expected: FAIL on missing DTO fields, quote lineage, and warning codes.

- [ ] **Step 4: Extend the exported application DTOs.** Add the two warning codes and `scope.tokenMint?: string`. Define and attach:

  ```ts
  export type SolUsdcRawTokenAmountDto = {
    raw: string;
    decimals: number;
    symbol: string;
    mint: string;
  };

  export type SolUsdcPrincipalTokenAmountsDto = {
    tokenA: SolUsdcRawTokenAmountDto;
    tokenB: SolUsdcRawTokenAmountDto;
    observedAtUnixMs: number;
    source: 'orca_full_liquidity_quote';
    basis: 'principal-only';
  };

  export type SolUsdcUsdPriceQuoteDto = {
    mint: string;
    symbol: string;
    usdPerToken: number;
    quotedAtUnixMs: number;
    source: string;
  };
  ```

  Add required `principalTokenAmounts: SolUsdcPrincipalTokenAmountsDto | null` and `usdPriceQuotes: SolUsdcUsdPriceQuoteDto[]` to `SolUsdcPositionInsightDto`. Keep all existing fields unchanged.

- [ ] **Step 5: Retain the complete quote lineage in the shared price map.** Change `PriceMapEntry` to `{ usdValue: number; symbol: string; quotedAt: ClockTimestamp; source: string }` and have `fetchPriceMap` retain all four `PriceQuote` properties. Continue one deduplicated price-port call after sequential detail reads. A thrown price call still produces an empty map for fail-soft building.

- [ ] **Step 6: Build principal facts and warnings without inventing values.** In `buildSolUsdcPositionInsight`, if `detail.principalTokenAmounts` is non-null and both pool decimals are known, serialize exact strings and pool metadata. If it is null—or decimals are unexpectedly unavailable—return `principalTokenAmounts: null` and add one `principal_token_amounts_unavailable` warning scoped to `positionId` and `poolId`. Never use position liquidity as a token amount.

- [ ] **Step 7: Build deterministic price facts and token-scoped warnings.** Construct the requested mint set from pool mints plus every non-empty reward mint, sort it, map only present quotes into `usdPriceQuotes`, and add exactly one `usd_price_quote_unavailable` warning for each absent requested mint with `{ positionId, tokenMint }`. Existing fee/reward totals must continue using `priceMap` and existing fail-closed decimal checks, so their price inputs are identical to the serialized quote facts. Preserve one `fee_reward_usd_unavailable` warning per affected position during the compatibility window.

- [ ] **Step 8: Preserve response composition and document migration.** Do not change controller production code. Update the existing insights API spec with the three additive DTO types, requested-mint behavior, deterministic ordering, zero/null rules, actual quote-time meaning, optional principal failure, retained compatibility totals/warnings, and old-server migration rule: consumers treat absent new fields as unavailable during rollout. Retain the documented top-level S/R and primary 503 behavior.

- [ ] **Step 9: Verify this complete shared contract slice.**

  ```bash
  pnpm --filter @clmm/application test -- src/use-cases/insights/buildSolUsdcPositionInsight.test.ts src/use-cases/insights/GetSolUsdcInsightPositions.test.ts src/use-cases/insights/GetSolUsdcInsightBundle.test.ts
  pnpm --filter @clmm/adapters test -- src/inbound/http/InsightsDataController.test.ts
  pnpm exec eslint packages/application/src/dto/index.ts packages/application/src/use-cases/insights/buildSolUsdcPositionInsight.ts packages/application/src/use-cases/insights/buildSolUsdcPositionInsight.test.ts packages/application/src/use-cases/insights/GetSolUsdcInsightPositions.ts packages/application/src/use-cases/insights/GetSolUsdcInsightPositions.test.ts packages/application/src/use-cases/insights/GetSolUsdcInsightBundle.test.ts packages/adapters/src/inbound/http/InsightsDataController.test.ts
  pnpm exec prettier --check packages/application/src/dto/index.ts packages/application/src/use-cases/insights/buildSolUsdcPositionInsight.ts packages/application/src/use-cases/insights/buildSolUsdcPositionInsight.test.ts packages/application/src/use-cases/insights/GetSolUsdcInsightPositions.ts packages/application/src/use-cases/insights/GetSolUsdcInsightPositions.test.ts packages/application/src/use-cases/insights/GetSolUsdcInsightBundle.test.ts packages/adapters/src/inbound/http/InsightsDataController.test.ts docs/superpowers/specs/2026-05-01-sol-usdc-insights-data-api-design.md
  ```

  Expected: all focused tests pass; both endpoints share the additive facts; warning/partial/zero/null assertions pass; lint and formatting pass. The automatic workspace typecheck gate must pass before commit.

- [ ] **Step 10: Commit the application and HTTP contract.**

  ```bash
  git add packages/application/src/dto/index.ts packages/application/src/use-cases/insights/buildSolUsdcPositionInsight.ts packages/application/src/use-cases/insights/buildSolUsdcPositionInsight.test.ts packages/application/src/use-cases/insights/GetSolUsdcInsightPositions.ts packages/application/src/use-cases/insights/GetSolUsdcInsightPositions.test.ts packages/application/src/use-cases/insights/GetSolUsdcInsightBundle.test.ts packages/adapters/src/inbound/http/InsightsDataController.test.ts docs/superpowers/specs/2026-05-01-sol-usdc-insights-data-api-design.md
  git commit -m "feat: expose raw LP valuation facts"
  ```

## Tests to add or update

- Add a new pure helper suite for all `PrincipalTokenAmountsQuoteResult` arms and exact Orca estimate forwarding.
- Extend Jupiter adapter tests for stable source and original cache-fetch timestamp.
- Extend only the existing `fetchPositionDetail` reader block for success, zero, fail-soft principal enrichment, bounded logging, and unchanged live-fee hard failure.
- Extend builder tests for exact bigint serialization, unavailable principal, deterministic quote order/lineage, missing requested mints, compatibility totals, and zero preservation.
- Extend positions and bundle use-case tests for shared partial-data behavior and warning-derived `partial`.
- Extend successful controller tests to lock the additive response shape without changing production controller logic.
- Do not create broad test-only tasks. The only touched test file above 500 lines is part of the reader implementation task and is restricted to one existing describe block.

## Validation commands

Each task contains file-scoped tests, lint, and formatting commands as acceptance criteria. After all implementation tasks, the repository's dedicated validate phase should run the standard broad checks (not as a standalone implementation task):

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
```

## Risk areas

- Orca core quote API drift or misunderstanding `tokenEstA`/`tokenEstB` versus minimum/slippage outputs could expose incorrect composition; official installed-version semantics must be confirmed before implementation.
- Capturing `observedAt` before the quote finishes, or stamping cache hits with lookup time, would overstate temporal freshness.
- Treating `0n` as falsy/unavailable would erase valid one-sided or empty-liquidity evidence.
- Adding required members to exported `PositionDetail`, `PriceQuote`, and insight DTOs can break fixtures or downstream exhaustive consumers unless all repository producers are updated in the same task and migration is documented.
- Duplicate requested reward mints could create duplicate warnings unless the builder uses a set before sorting.
- Price totals and serialized quote facts could diverge if separate maps or fallback prices are introduced.
- The reader constructor already has an injected fee/reward helper; adding the principal helper in the wrong parameter position can silently break test/composition call sites.
- Directional mapping is release-critical and unrelated; any attempt to infer posture from token order, range state, or composition is forbidden.

## Stop conditions

- Stop if current official Orca documentation for the installed packages does not establish an instruction-free full-liquidity estimate whose outputs exclude fees and rewards; do not reimplement CLMM math or reuse execution preparation.
- Stop if the chosen quote requires another position-account/owner scan or execution instruction construction; return to design rather than duplicate the authoritative detail read.
- Stop if the position/pool state required by the quote cannot be supplied from the accounts already fetched by `fetchPositionDetail`.
- Stop if any implementation would move Orca/Jupiter/Solana imports into domain or application, or make UI/app shell own business logic.
- Stop if any task's required exported-type change cannot include all affected repository producers/implementations while keeping the automatic `pnpm -r typecheck` gate green.
- Stop if tests reveal existing primary detail failures or live fee/reward quote failures have become fail-soft, or if principal-only failure becomes an HTTP 503.
- Stop if a proposed field or warning requires deriving target asset, exit posture, or swap direction outside `DirectionalExitPolicyService`.

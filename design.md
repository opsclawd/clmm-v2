# SOL/USDC Intelligence Bundle Raw LP Facts Design

**Issue:** #91 — extend the SOL/USDC intelligence bundle with missing raw LP facts

**Status:** Design only

**Primary surface:** `GET /insights/sol-usdc/bundle/:walletId`

## Summary

Extend the existing read-only SOL/USDC insights read model with the two raw fact families that are currently missing for downstream LP evidence derivation:

1. the principal SOL and USDC amounts represented by each position's full liquidity at the observed pool state; and
2. the per-token USD price quotes, source, and quote times used to value those amounts and the position's live unclaimed fees.

The application continues to expose raw inputs, not inventory-skew labels, fee APR, fee-to-volatility ratios, or recommendations. Principal amount calculation belongs at the Orca adapter boundary and reuses the position and pool accounts already fetched by the existing position-detail read. The application use case maps those facts into additive, nullable DTO fields and emits explicit warnings when an optional fact is unavailable. A real raw zero remains a serialized zero; unavailability is represented by `null` plus a scoped warning.

The existing routes, top-level S/R placement, live fee/reward semantics, trigger behavior, and hard-failure behavior for primary pool/list/detail reads remain unchanged.

## Problem and why it matters

The intelligence pipeline is expected to derive evidence about inventory skew, fee capture, unclaimed-fee value, and current position composition. The existing bundle supplies much of the necessary context, but it stops short of exposing two inputs that CLMM is best placed to provide.

`SolUsdcPositionInsightDto` includes position liquidity, pool liquidity, ticks, range state, live raw unclaimed fees, raw rewards, and nullable aggregate USD values. It does not include the current token A/token B amounts represented by the position's liquidity. Concentrated-liquidity units are not token balances, so a downstream consumer cannot safely infer SOL/USDC composition from `positionLiquidity`. Asking the intelligence service to perform its own Orca reads would duplicate wallet-scoped chain work and create a second interpretation of position state.

The DTO also exposes `unclaimedFeesUsd` but not the USD prices, provider identity, or price observation times used to calculate it. The application currently discards `PriceQuote.quotedAt` when building its internal price map, and `PriceQuote` itself does not identify the provider. A downstream consumer can therefore see a total but cannot establish its valuation lineage, reuse the inputs to value principal amounts, or judge the temporal alignment of the chain and price observations.

These gaps matter because plausible derived metrics built from incomplete or unlabeled inputs are more dangerous than explicit absence. The API must let downstream evidence distinguish a true zero-token or zero-fee state from a quote that could not be produced.

## Current-state gap audit

| Evidence need                   | Facts already present                                                                         | Missing or insufficient fact                                                                                  | Design outcome                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Inventory skew                  | Token mints/symbols/decimals, current tick/price, bounds, range state, raw position liquidity | Current principal token A and token B amounts represented by the position liquidity                           | Add nullable principal token amounts with source, basis, and observation time                                           |
| Position token composition      | Same range and pool facts; out-of-range direction is already explicit                         | Raw withdrawable principal amounts; liquidity units alone cannot express composition                          | Same principal-amount addition; downstream derives one-sidedness and dominance                                          |
| Snapshot fee capture            | Live raw claimable fees, pool fee rate, position liquidity, pool liquidity                    | A usable principal-value denominator and price inputs                                                         | Principal amounts plus USD price quote lineage enable downstream snapshot ratios; no temporal capture judgment is added |
| Unclaimed-fee valuation lineage | Raw live fee amounts and nullable aggregate `unclaimedFeesUsd`                                | Per-token USD price, provider/source, and actual quote time                                                   | Add reusable per-token USD price quote facts; preserve the existing aggregate for compatibility                         |
| Rewards                         | Live raw non-zero rewards, mint, decimals, nullable aggregate USD value                       | Price provenance is also useful for reward valuation, but not required by the issue's named evidence families | Include every successfully returned requested mint in the shared position valuation inputs, including reward mints      |
| Alerts and directional context  | Filtered actionable alerts, trigger ID, breach direction, observed timestamps                 | Nothing needed for this issue                                                                                 | No change; never derive exit posture or swap direction here                                                             |
| Pool and S/R context            | Pool snapshot and one top-level S/R block                                                     | Nothing needed for this issue                                                                                 | Keep S/R top-level and do not copy it per position                                                                      |
| Historical fee capture          | No collected-fee ledger or position-value time series                                         | Windowed fees, lifetime fees, collected fees, deposits/withdrawals, and a time-aligned denominator            | Explicitly not added; CLMM does not currently own enough authoritative history                                          |

The audit therefore does not justify adding pool TVL, pool 24-hour fees, wallet balances, historical P&L, or recommendation fields. The repository's separate financial-metrics contract deliberately leaves those values unavailable because no authoritative producer exists.

## Design decisions

### 1. Add minimum typed facts to the existing position DTO

The existing `/positions/:walletId` and `/bundle/:walletId` insight routes share `SolUsdcPositionInsightDto`. They must continue to share one builder and one position-detail read path. Add the facts to that DTO rather than introducing a bundle-only fork.

Conceptually, the additive fields are:

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

export type SolUsdcPositionInsightDto = {
  // existing fields remain unchanged
  principalTokenAmounts: SolUsdcPrincipalTokenAmountsDto | null;
  usdPriceQuotes: SolUsdcUsdPriceQuoteDto[];
};
```

`principalTokenAmounts` is principal-only: it excludes unclaimed fees, rewards, wallet balances, and swap output. This fixed basis is essential because execution preparation currently combines close-position principal and fees when determining a possible swap amount; that combined value is not position composition.

The `orca_full_liquidity_quote` source literal describes a read-only quote over 100% of the position liquidity. It does not mean an execution quote was requested, an instruction was built, or slippage was selected. The contract retains the full-liquidity and principal-only semantics regardless of the underlying Orca utility name.

`usdPriceQuotes` contains the reusable raw valuation inputs returned for pool and reward mints. The array must be deterministically ordered by mint so snapshots and tests remain stable. A missing requested quote is not represented by a fabricated zero-valued entry; it is absent and accompanied by a warning.

The existing `unclaimedFeesUsd` and `unclaimedRewardsUsd` fields stay in place. Removing or renaming them would create unnecessary consumer migration. Their values must be computed from the same `usdPriceQuotes` facts serialized on the position, so the total and lineage cannot silently diverge.

### 2. Produce principal composition inside the existing detail read

Extend the domain-facing `PositionDetail` returned by `SupportedPositionReadPort.getPositionDetail` with nullable principal token amounts:

```ts
principalTokenAmounts: {
  amountA: bigint;
  amountB: bigint;
  observedAt: ClockTimestamp;
} | null;
```

The adapter records `observedAt` when the principal quote completes successfully. `SolanaPositionSnapshotReader.fetchPositionDetail` already fetches and verifies the position account and fetches its Whirlpool account. The new quote logic must consume that already-fetched state and the position liquidity; it must not perform a second owner scan or refetch the wallet's position account through a separate insight-only port.

Orca-specific quote math remains in `packages/adapters`, preferably in a focused helper next to `OrcaPositionFeeRewardQuoteHelper`. The helper returns a discriminated result:

```ts
type PrincipalTokenAmountsQuoteResult =
  | { kind: 'ok'; amountA: bigint; amountB: bigint }
  | {
      kind: 'unavailable';
      reason: 'quote-input-invalid' | 'principal-quote-failed';
      errorName?: string;
      errorMessage?: string;
    };
```

The implementation must consult current official Orca documentation before selecting the quote utility. It should expose estimated token amounts for removing the full liquidity at the observed state, not minimum amounts after a slippage tolerance. It must not reuse `closePositionInstructions`, because that path constructs execution instructions, applies execution-oriented parameters, and mixes principal with fees in its downstream token context.

If principal quoting succeeds, the reader returns the two bigint amounts on `PositionDetail`. If only principal quoting fails, the reader still returns the rest of the detail with principal amounts set to `null`. This is optional enrichment failure, unlike the existing live fee/reward quote failure. The latter continues to fail the complete detail read closed because falling back to checkpointed fee accumulators would expose stale values as current.

The adapter logs a bounded structured warning for quote failure with position ID, wallet ID, pool ID, bounds, current tick, reason, and sanitized error metadata. It must not log raw accounts or RPC payloads.

### 3. Preserve and expose truthful price provenance

Extend the domain `PriceQuote` contract with a non-empty `source` string. `JupiterPriceAdapter` supplies the stable value `jupiter_price_v3`. Testing fakes and fixtures supply explicit sources rather than relying on application-layer knowledge of the concrete adapter.

The adapter cache currently records each entry's actual `fetchedAt` time but returns a fresh `quotedAt` time on every cache hit. That overstates freshness. The implementation should return the cached entry's `fetchedAt` as `quotedAt`, so serialized lineage reflects when that price was actually obtained from the provider.

`GetSolUsdcInsightPositions.fetchPriceMap` retains `usdValue`, symbol, `quotedAt`, and source instead of discarding the latter two. The position builder uses that enriched map for both existing aggregate USD calculations and `usdPriceQuotes` serialization.

No bundle-wide price block is introduced. Although token prices may repeat across positions, they participate in each position's valuation lineage and the existing position DTO is also returned independently by `/positions/:walletId`. Keeping the facts with the position avoids a second contract shape and makes partial position data self-describing. The payload cost is negligible for the single supported pair and small position counts.

### 4. Use null plus warnings for unavailable facts; preserve zero

Extend `InsightDataWarning` with these two warning codes and the token-mint scope field:

```ts
code:
  | ExistingWarningCodes
  | 'principal_token_amounts_unavailable'
  | 'usd_price_quote_unavailable';

scope?: {
  poolId?: string;
  positionId?: string;
  tokenMint?: string;
};
```

Rules:

- A successful principal quote returning `0n` for either or both sides serializes as raw string `'0'`. This is how one-sided and empty-liquidity states remain distinguishable from unavailable composition.
- An unavailable principal quote serializes `principalTokenAmounts: null` and emits one `principal_token_amounts_unavailable` warning scoped to the position and pool.
- A requested mint without a returned price quote has no `usdPriceQuotes` entry and emits `usd_price_quote_unavailable` scoped to the position and mint.
- Existing aggregate valuation behavior remains fail-closed: if any price or decimal required for a total is unavailable, that total is `null`, never `0`.
- A known zero raw fee amount with complete zero-or-positive prices produces an aggregate USD value of `0`.
- Existing `fee_reward_usd_unavailable` warnings remain during the compatibility window because current consumers may recognize them. The new token-scoped warning adds diagnosis rather than replacing that stable signal without notice.
- `dataQuality.partial` remains exactly equivalent to `warnings.length > 0`.

Warnings report missing promised enrichment. They must not warn about facts that the contract intentionally does not promise, such as lifetime collected fees or wallet balances.

### 5. Keep derivation and judgment downstream

The bundle must not add fields such as:

- `inventorySkewPercent`, `dominantAsset`, or `oneSided`;
- `positionValueUsd`;
- `feeCaptureRate`, fee APR/APY, or fee-to-volatility;
- `recommendedAction`, target posture, or swap direction.

Those values are derivable from raw composition, raw fees, price inputs, and downstream time series or policy, but their definitions belong to the intelligence/regime layers. In particular, the application must not infer a target asset from token order, range state, or composition. The release-blocker directional mapping remains exclusively in `DirectionalExitPolicyService` and is not involved in this read path.

## Approaches considered

### Recommended: additive facts on the existing shared insight position DTO

This approach reuses the authoritative detail read, adds only the missing principal composition and valuation lineage, and preserves the current route and orchestration boundaries. It gives downstream consumers enough information to derive the named evidence families while keeping optional quote failures local and visible.

Trade-off: extending `PositionDetail` and `PriceQuote` propagates through domain types, fakes, and tests. That is intentional contract work, not a reason to compute the facts in the controller or duplicate Orca calls.

### Alternative: add a separate composition endpoint or read port

A new `/composition/:walletId` endpoint or an insight-only adapter port could isolate the contract change. It would also force callers to join snapshots, risk different observation times, and likely repeat wallet ownership and position account reads. It conflicts with the issue's goal of avoiding duplicated wallet-specific chain reads and creates another partial-failure domain. This approach is rejected.

### Alternative: expose raw liquidity and let intelligence calculate composition

The bundle already exposes raw position liquidity, pool sqrt price, and ticks. A consumer could import Orca math and derive token amounts. That duplicates protocol-specific rounding and price-orientation knowledge outside the authoritative adapter and makes downstream behavior sensitive to SDK drift. It is rejected.

### Alternative: expose derived skew and fee metrics directly

This would minimize work in the intelligence service, but it would move evidence taxonomy and recommendation-adjacent semantics into CLMM. Snapshot fee ratios can also be mistaken for time-windowed fee capture. It violates the raw-facts guardrail and is rejected.

### Alternative: introduce a generic `facts: Record<string, unknown>` bag

A generic bag would make future additions easy but would discard compile-time guarantees, weaken partial-data semantics, and invite undocumented judgments. The existing API uses explicit DTOs and warning unions; this design follows that pattern.

## Proposed data and control flow

```text
GET /insights/sol-usdc/bundle/:walletId
  -> getSolUsdcInsightBundle (application)
      -> existing pool snapshot read
      -> getSolUsdcInsightPositions (shared with /positions)
          -> list supported positions once
          -> for each allowlisted position, sequentially:
              -> getPositionDetail once
                  -> fetch/verify position account
                  -> fetch Whirlpool account
                  -> existing live fee/reward quote
                  -> principal-only full-liquidity amount quote
              -> detail contains live fees plus nullable principal amounts
          -> fetch prices once for the deduplicated mint set
          -> build each position insight
              -> raw principal amounts or null
              -> raw live fee/reward amounts
              -> price quotes with source and actual quote time
              -> compatibility USD totals from those same quotes
              -> scoped warnings for unavailable enrichment
          -> enrich actionable triggers
      -> fetch S/R once at bundle level
      -> combine warnings; partial = warnings.length > 0
  -> InsightsDataController serializes the use-case result unchanged
```

The controller remains thin. It performs wallet validation and maps the existing primary failure union to HTTP responses; it does not calculate token amounts, prices, skew, or fee metrics.

## Compatibility and migration

This is an additive response change:

- no route or authentication change;
- no removal or rename of current fields;
- no change to top-level S/R placement;
- no change to existing 503 error codes for primary reads;
- new nullable `principalTokenAmounts`, new `usdPriceQuotes`, and new warning-code members.

JSON consumers that ignore unknown fields remain compatible. Typed consumers should update their generated/static DTO and any exhaustive warning-code switch. During a coordinated rollout, consumers must treat absent `principalTokenAmounts` or `usdPriceQuotes` from an older server the same as unavailable enrichment, not as zero. After the server rollout is established, the fields are always present in successful current-version responses (`null`/empty when unavailable), so ambiguity is carried by values and warnings rather than field omission.

No route-level v2 is warranted because the existing semantics are preserved and the new facts are optional enrichment. If a downstream consumer requires a strict schema identifier, that should be handled by the parent integration-contract work rather than inventing a CLMM-local evidence wire version here.

## Error handling and observability

Primary reads retain current behavior:

- pool snapshot unavailable -> existing `503 pool_snapshot_unavailable`;
- position list unavailable -> existing `503 position_list_unavailable`;
- position detail absent or live fee/reward quote unavailable -> existing `503 position_detail_unavailable`.

New enrichment failures are fail-soft:

- principal amount quote unavailable -> successful response, null principal amounts, warning;
- one or more price quotes unavailable -> successful response, absent quote entries, null affected aggregate valuation, warnings;
- S/R or triggers unavailable -> current successful partial response behavior.

The principal quote helper and price adapter should emit operational logs only at the layer with useful request context, using stable event names and sanitized metadata. API `dataQuality` warnings remain consumer-facing facts about availability; logs remain operational diagnostics. Neither should contain wallet-private data beyond the wallet/position identifiers already required to diagnose this authenticated backend path.

## Testing strategy

### Adapter and domain-facing read contract

- Full-liquidity principal quoting returns exact bigint token A/B amounts from mocked Orca state.
- In-range, below-range, and above-range fixtures cover two-sided and one-sided outputs without deriving an asset-dominance label.
- Exact zero amounts remain `0n`.
- Quote failure returns an unavailable result with a stable reason and no fabricated fallback.
- `fetchPositionDetail` still returns detail when only principal quoting fails, with principal amounts null and one structured warning.
- Existing fee/reward quote failure still fails detail closed and never falls back to checkpointed owed fields.
- The principal path reuses the fetched position/Whirlpool context and does not perform another owner scan or wallet-position account read.

### Application DTO and use case

- The builder serializes principal bigints as decimal strings with mint, symbol, decimals, basis, source, and observation time.
- A null principal fact emits `principal_token_amounts_unavailable`; a real zero does not.
- Price quotes retain source and the actual adapter quote time.
- Missing prices emit token-scoped warnings and keep affected totals null.
- Complete zero fees plus complete price facts produce `unclaimedFeesUsd: 0`.
- `unclaimedFeesUsd` equals the value derived from the serialized raw fees and serialized USD price inputs.
- `/positions/:walletId` and `/bundle/:walletId` continue to use the same position shape and builder.
- S/R remains absent from positions and present only once at bundle top level.
- `dataQuality.partial` is true if and only if warnings are non-empty.

### Adapter/BFF contract

- Successful controller responses preserve the additive fields and warning scopes without transformation.
- Existing success and primary 503 tests remain unchanged in meaning.
- A principal-only quote failure does not become `position_detail_unavailable`.
- Existing consumers' fields, especially raw fees and aggregate USD totals, remain present.

Implementation should run focused domain/application/adapter tests during development and the full repository verification suite before completion because shared domain and application port contracts are affected: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm boundaries`, and `pnpm test`.

## Assumptions

- `issue-comments.md` is empty, so it adds no constraints beyond `issue.md`.
- The final INT-TAXONOMY and INT-FEATURES artifacts are not present in this worktree. The named evidence families in this issue are treated as the authoritative minimum dependency contract.
- Inventory skew means a downstream comparison of current principal SOL and USDC exposure, normally after applying price inputs; CLMM need not publish the percentage or dominance judgment.
- Fee capture in this issue means the raw inputs for a current snapshot comparison of live claimable fees against principal exposure. Windowed/lifetime fee capture requires history not owned by the current bundle and is not silently approximated.
- The existing live fee/reward quote is authoritative for currently claimable amounts and remains fail-closed on quote failure.
- Orca provides a current, read-only way to quote token A/B amounts for the position's full liquidity without building or submitting instructions. Current official documentation must be verified before adapter implementation.
- Principal token amounts exclude fees and rewards even if an Orca close-position helper can return all three in one result.
- Token decimals for the allowlisted SOL/USDC pool remain required primary data, as in the current pool snapshot flow.
- A bundle is a best-effort composition of sequential chain reads and external price reads, not an atomic on-chain snapshot. Per-fact observation and quote times are therefore retained instead of claiming exact simultaneity.
- Existing external consumers tolerate additive JSON fields. Typed exhaustive consumers may need the documented warning-union migration.
- The supported pair and pool remain the current single allowlisted Orca SOL/USDC Whirlpool; generic multi-pool design is not introduced.

## In scope

- A documented gap audit of existing and missing raw LP facts.
- Additive insight DTOs for principal token amounts and reusable USD price quote lineage.
- Domain/application port contract changes needed to carry nullable principal amounts through the existing detail read.
- A read-only Orca adapter helper for principal-only full-liquidity token amount quoting.
- Price quote source and truthful cached quote timestamps.
- Application builder/use-case mapping and deterministic serialization.
- Explicit data-quality warnings that distinguish unavailable principal/price facts from true zeros.
- Thin BFF/controller response coverage.
- Tests for complete, zero, one-sided, and partial-data cases.
- Consumer migration documentation for additive fields and warning codes.

## Explicitly out of scope

- Inventory-skew percentages, dominant-asset labels, one-sided judgments, or recommendations.
- Fee APR/APY, fee-to-volatility, fee-to-TVL, or any final fee-capture score.
- Lifetime or collected fee accounting, P&L, deposits/withdrawals, wallet balances, or historical position-value series.
- Pool TVL or pool 24-hour-fee providers; raw Whirlpool liquidity must not be relabeled as USD TVL.
- Execution slippage, minimum withdrawal amounts, swap routes, transaction instruction construction, signing, or submission.
- Changes to alerts, trigger qualification, previews, execution policy, or the directional exit invariant.
- New app UI or changes to the existing positions-screen financial metrics contract.
- Copying S/R onto each position.
- Generic pair/pool registries, a general wallet API, or multi-protocol support.
- Changes to the downstream evidence wire contract or canonical Regime Engine PolicyInsight contract.

## Risks and concerns

### Principal amount semantics

Orca quote APIs may expose estimated amounts, minimum amounts after slippage, or close-position totals that combine principal and fees. Selecting the wrong field would corrupt inventory evidence. The helper must use full-liquidity principal estimates only, lock the choice with fixtures, and document the SDK function/version used.

### Token orientation and the release-blocker invariant

Token A/B order is safe for labeling raw mint-bound amounts but must never be used to infer exit posture or swap direction. Every amount carries its mint and symbol. The design does not touch `DirectionalExitPolicyService`.

### Non-atomic observation times

Position details are read sequentially and USD prices may come from cache. A single bundle timestamp cannot make those observations atomic. Returning actual principal observation and price quote times reduces ambiguity, but downstream feature logic must still enforce its own temporal-alignment policy.

### Cache provenance accuracy

The current Jupiter adapter stamps cache hits with the request time rather than the upstream fetch time. If left unchanged, newly exposed lineage would look fresher than it is. Returning the cache entry's `fetchedAt` is required for truthful provenance and may reveal older quotes than current tests expect.

### Partial-warning duplication

Keeping `fee_reward_usd_unavailable` while adding token-scoped `usd_price_quote_unavailable` can produce multiple warnings for one root cause. This is acceptable for compatibility, but tests should define exact deduplication: at most one aggregate valuation warning per position and one price warning per missing position/mint pair.

### Shared-contract blast radius

Adding principal facts to `PositionDetail` and source to `PriceQuote` affects testing fakes and consumers outside the insights feature. Keep the fields narrowly typed, update fixtures through public contracts, and run boundaries/typecheck across the repository.

### Adapter performance

The insights use case already reads details sequentially to avoid unbounded RPC pressure. Principal quoting must reuse fetched account state and should add no wallet scan. If current Orca APIs require extra pool/tick reads, they must be bounded and reused where possible; an efficiency regression test should count position and Whirlpool reads.

### Downstream over-interpretation

A snapshot ratio of claimable fees to principal value is not a time-windowed fee-capture rate. The field names and basis metadata intentionally avoid `APR`, `yield`, or `earned`. Downstream taxonomy must preserve that distinction.

## Completion boundary

The future implementation satisfies this design when successful insight position records expose truthful principal token amounts when available, expose the source and actual time of the USD price facts used for valuation, preserve real zeros, warn explicitly on unavailable enrichment, and continue to obtain all wallet-scoped position facts through the existing single detail-read path. It is not required to publish any derived skew, fee performance metric, recommendation, or UI change.

<!-- plan-review-required -->

# Authoritative Financial Metrics for the Positions Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every fabricated positions-list financial value and carry a source-aware, nullable application contract through HTTP, the Expo client, UI view models, and components so loading, unavailable, exact-zero, and populated authoritative values remain distinct.

**Architecture:** Add metric-specific DTOs at the application boundary, validate claimed metrics strictly, and have the current list use case emit explicit unavailable values because no authoritative provider exists. Preserve response-level aggregate scope and pool-ID keyed pool scope through the controller and Expo client, then convert nullable transport values into a closed UI display union before rendering. Do not derive values from raw Orca liquidity, position detail fields, card data, or partial subsets.

**Tech Stack:** TypeScript, Vitest, NestJS controller responses, Expo/React Query, React Native, Testing Library, pnpm/Turbo.

---

**Goal details**

- Rename the summary concepts to `Position value` and `Unclaimed fees`.
- Rename card concepts to `Pool TVL` and `Pool fees · 24h`.
- Render authoritative zero as `$0.00`, missing data as `—`, and populated values as consistently formatted USD.
- Keep available financial amounts neutral; do not use green to imply performance.
- Leave initial request loading in the existing screen-level loading state, with no summary strip or cards rendered.

**Non-goals**

- Do not add an Orca analytics, pricing, indexer, accounting, or market-data provider.
- Do not fetch position details from the list path or calculate portfolio value, P&L, yield, lifetime fees, collected fees, rewards, or performance history.
- Do not use `PoolData.liquidity` as TVL or reuse `PositionDetailDto.unclaimedFees.totalUsd`.
- Do not change domain code, execution behavior, range/monitoring behavior, PairGlyph behavior, or the directional-exit invariant.
- Do not add an independent metrics request, loading spinner, cache, retry loop, or staleness policy.
- Do not broaden the product into wallet-wide portfolio analytics.

**Affected files (repository-relative full paths)**

- `packages/application/src/dto/index.ts` — declare metric-specific DTOs and response-level metrics shape.
- `packages/application/src/dto/validation.ts` — validate non-null metrics, timestamps, source metadata, windows, and pool-map consistency.
- `packages/application/src/dto/validation.test.ts` — add focused contract-validation tests.
- `packages/application/src/public/index.ts` — expose the DTOs and validator to the app/UI public boundary.
- `packages/application/src/use-cases/positions/ListSupportedPositions.ts` — return all-unavailable metrics without new reads or calculations.
- `packages/application/src/use-cases/positions/ListSupportedPositions.test.ts` — prove pool coverage and prohibit raw-liquidity derivation.
- `packages/adapters/src/inbound/http/PositionController.ts` — serialize financial metrics on successful list responses.
- `packages/adapters/src/inbound/http/PositionController.test.ts` — cover the successful HTTP envelope and existing error behavior.
- `apps/app/src/api/positions.ts` — validate current responses and normalize legacy responses that omit the metrics block.
- `apps/app/src/api/positions.test.ts` — cover omitted, null, zero, populated, malformed, and pool-mismatch responses.
- `apps/app/app/(tabs)/positions.tsx` — pass the response-level metrics through unchanged.
- `packages/ui/src/view-models/PositionListViewModel.ts` — define the closed display union, format USD, and perform pool-ID lookup.
- `packages/ui/src/view-models/PositionListViewModel.test.ts` — test unavailable, zero, populated, invalid, and pool-scoped mapping.
- `packages/ui/src/screens/PositionsListScreen.tsx` — accept metrics, build the view model, and pass display states to components only after positions load.
- `packages/ui/src/screens/PositionsListScreen.test.tsx` — test screen state distinctions, labels, order, and no fabricated values.
- `packages/ui/src/components/PortfolioSummaryStrip.tsx` — replace constants with display-state props and neutral styling.
- `packages/ui/src/components/PositionCard.tsx` — render pool metric view models instead of generated placeholders.
- `packages/ui/src/components/PositionCard.test.tsx` — cover unavailable, zero, populated, labels, and neutral display.
- `packages/ui/src/components/PositionCardUtils.ts` — delete the placeholder type, fallback deck, hash, and lookup helper only.
- `packages/ui/src/components/PositionCardUtils.test.ts` — remove placeholder-only imports and tests while preserving unrelated helper coverage.
- `packages/ui/src/index.ts` — export the new financial metric view-model type used by composition code/tests.
- `docs/product-scope.md` — document metric scope, source, inclusions/exclusions, and observation-time requirements.

**Behavioral invariants shared across tasks**

- `positionsLoading=true` means the existing loading screen renders; metric components do not render.
- A completed list response with a null metric means unavailable and renders `—`.
- A non-null metric with `valueUsd=0` is available and renders `$0.00`.
- A finite positive metric renders its formatted USD value.
- Negative, `NaN`, infinite, incomplete, or scope-inconsistent claimed metrics fail closed and are never displayed as authoritative.
- Summary aggregates are response-level values and are never calculated from cards or a known subset.
- Pool values are selected only by exact `poolId`; positions sharing a pool share its values, and different pools do not leak values to one another.
- Available and unavailable financial values use neutral/tertiary text, never positive-performance green.

## Task 1: Define and strictly validate the financial metrics contract

**Files:**

- Modify: `packages/application/src/dto/index.ts`
- Modify: `packages/application/src/dto/validation.ts`
- Create: `packages/application/src/dto/validation.test.ts`
- Modify: `packages/application/src/public/index.ts`

**Exported signature changes:** Add and publicly export `PositionValueMetricDto`, `UnclaimedFeesMetricDto`, `PoolTvlMetricDto`, `PoolFees24hMetricDto`, `PoolFinancialMetricsDto`, `PositionListFinancialMetricsDto`, and `isPositionListFinancialMetricsDto` from the application public boundary.

**Behavioral invariants to write as named tests first:**

- `accepts unavailable financial metrics` — both response aggregates may be null and every pool metric may be null.
- `accepts exact zero when required metric metadata is present` — zero is a valid non-null USD measurement for all four metric types.
- `accepts populated metrics with matching pool ids and a trailing 24 hour window` — complete positive values pass validation.
- `rejects negative or non-finite financial values` — negative, `NaN`, and infinity fail validation rather than becoming zero or unavailable.
- `rejects incomplete source scope or timestamp metadata` — empty sources, invalid Unix milliseconds, incorrect fixed basis/scope declarations, and missing required metadata fail.
- `rejects pool metric ids that do not match their poolsById keys` — keyed map scope cannot drift from embedded pool identity.
- `rejects pool fee windows that are not exactly 24 hours` — require finite integer timestamps with `windowEndUnixMs - windowStartUnixMs === 86_400_000`.

- [ ] **Step 1: Write the failing validator tests**

Create `packages/application/src/dto/validation.test.ts` with factories for valid metrics and the exact test names above. Use literal zero and positive cases, mutate one field at a time for rejection cases, and include both `Number.NaN` and `Number.POSITIVE_INFINITY`.

```ts
const validMetrics: PositionListFinancialMetricsDto = {
  positionValue: {
    valueUsd: 0,
    valuedAtUnixMs: 1_800_000_000_000,
    source: 'authoritative-test-source',
    basis: 'principal-token-amounts',
    scope: 'returned-supported-positions',
    excludes: ['wallet-balances', 'fees', 'rewards', 'collected-history', 'pnl'],
  },
  unclaimedFees: {
    valueUsd: 0,
    valuedAtUnixMs: 1_800_000_000_000,
    source: 'authoritative-test-source',
    basis: 'currently-claimable-trading-fees',
    scope: 'returned-supported-positions',
    excludes: ['rewards', 'collected-fees', 'lifetime-fees'],
  },
  poolsById: {
    'pool-1': {
      tvl: {
        poolId: 'pool-1' as PoolId,
        valueUsd: 0,
        observedAtUnixMs: 1_800_000_000_000,
        source: 'authoritative-test-source',
        scope: 'whole-orca-pool',
      },
      fees24h: {
        poolId: 'pool-1' as PoolId,
        valueUsd: 0,
        source: 'authoritative-test-source',
        windowStartUnixMs: 1_799_913_600_000,
        windowEndUnixMs: 1_800_000_000_000,
        scope: 'whole-orca-pool',
      },
    },
  },
};
```

- [ ] **Step 2: Run the new tests and confirm the contract is absent**

Run: `pnpm --filter @clmm/application test -- src/dto/validation.test.ts`

Expected: FAIL because the metric DTOs and `isPositionListFinancialMetricsDto` are not yet exported.

- [ ] **Step 3: Add metric-specific DTO declarations**

Add exact literal semantics rather than a generic metric bag:

```ts
export type PositionValueMetricDto = {
  valueUsd: number;
  valuedAtUnixMs: number;
  source: string;
  basis: 'principal-token-amounts';
  scope: 'returned-supported-positions';
  excludes: readonly ['wallet-balances', 'fees', 'rewards', 'collected-history', 'pnl'];
};

export type UnclaimedFeesMetricDto = {
  valueUsd: number;
  valuedAtUnixMs: number;
  source: string;
  basis: 'currently-claimable-trading-fees';
  scope: 'returned-supported-positions';
  excludes: readonly ['rewards', 'collected-fees', 'lifetime-fees'];
};

export type PoolTvlMetricDto = {
  poolId: PoolId;
  valueUsd: number;
  observedAtUnixMs: number;
  source: string;
  scope: 'whole-orca-pool';
};

export type PoolFees24hMetricDto = {
  poolId: PoolId;
  valueUsd: number;
  source: string;
  windowStartUnixMs: number;
  windowEndUnixMs: number;
  scope: 'whole-orca-pool';
};

export type PoolFinancialMetricsDto = {
  tvl: PoolTvlMetricDto | null;
  fees24h: PoolFees24hMetricDto | null;
};

export type PositionListFinancialMetricsDto = {
  positionValue: PositionValueMetricDto | null;
  unclaimedFees: UnclaimedFeesMetricDto | null;
  poolsById: Readonly<Record<string, PoolFinancialMetricsDto>>;
};
```

- [ ] **Step 4: Implement strict runtime validation and public exports**

In `validation.ts`, use focused helpers: a USD amount is finite and non-negative; Unix milliseconds are finite, non-negative integers; source is a non-empty trimmed string; fixed literal fields and ordered exclusion tuples must match exactly. Iterate `Object.entries(poolsById)`, require each entry to contain both nullable keys, and require every non-null embedded `poolId` to equal the map key. Export `isPositionListFinancialMetricsDto` from `packages/application/src/public/index.ts` alongside all seven DTO types.

```ts
const DAY_MS = 86_400_000;

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isUnixMs(value: unknown): value is number {
  return isNonNegativeFinite(value) && Number.isInteger(value);
}

function hasSource(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
```

- [ ] **Step 5: Run focused validation and package gates**

Run: `pnpm --filter @clmm/application test -- src/dto/validation.test.ts`

Expected: PASS for all named contract invariants.

Run: `pnpm --filter @clmm/application typecheck`

Expected: PASS with the new public DTO and validator declarations.

- [ ] **Step 6: Commit the contract**

```bash
git add packages/application/src/dto/index.ts packages/application/src/dto/validation.ts packages/application/src/dto/validation.test.ts packages/application/src/public/index.ts
git commit -m "feat(application): define authoritative position metrics contract"
```

## Task 2: Produce unavailable metrics and serialize the success envelope

**Files:**

- Modify: `packages/application/src/use-cases/positions/ListSupportedPositions.ts`
- Modify: `packages/application/src/use-cases/positions/ListSupportedPositions.test.ts`
- Modify: `packages/adapters/src/inbound/http/PositionController.ts`
- Modify: `packages/adapters/src/inbound/http/PositionController.test.ts`

**Exported signature changes:** Add `financialMetrics: PositionListFinancialMetricsDto` to `ListSupportedPositionsResult`, changing the declared result of `listSupportedPositions`; add the same field to the successful return shape of `PositionController.listPositions`. No port or adapter interface method is added.

**Behavioral invariants to write as named tests first:**

- `returns unavailable financial metrics for every returned unique pool` — aggregates are null and every pool represented by a returned summary has `{ tvl: null, fees24h: null }`.
- `does not derive financial metrics from raw pool liquidity` — changing `PoolData.liquidity` cannot change the all-unavailable metric object.
- `deduplicates unavailable pool metrics when positions share a pool` — one map entry per pool, not one per position.
- `serializes financial metrics on successful position list responses` — the controller success envelope includes the use-case block alongside positions and warnings.
- `keeps transient list failures as error envelopes without claimed financial metrics` — existing error behavior remains distinct from a successful unavailable measurement.

- [ ] **Step 1: Add failing use-case and controller tests**

Extend the existing test files with the exact names above. Build a second position sharing `FIXTURE_POOL_DATA.poolId` for deduplication. For the raw-liquidity test, run the use case against otherwise identical pool data with different `liquidity` strings and assert equal financial metrics.

```ts
expect(result.financialMetrics).toEqual({
  positionValue: null,
  unclaimedFees: null,
  poolsById: {
    [FIXTURE_POOL_DATA.poolId]: { tvl: null, fees24h: null },
  },
});
```

- [ ] **Step 2: Run the focused tests and confirm the new response field is missing**

Run: `pnpm --filter @clmm/application test -- src/use-cases/positions/ListSupportedPositions.test.ts`

Expected: FAIL on `result.financialMetrics`.

Run: `pnpm --filter @clmm/adapters test -- src/inbound/http/PositionController.test.ts`

Expected: FAIL because successful list responses do not yet serialize `financialMetrics`.

- [ ] **Step 3: Build unavailable metrics from unique successfully summarized pool IDs**

After summary creation, derive keys only from `summaryDtos` so the map matches positions actually returned to the client. Do not read `poolData.liquidity`, call another port method, catch a metrics failure, or calculate a total.

```ts
const poolsById = Object.fromEntries(
  [...new Set(summaryDtos.map((dto) => dto.poolId))].map((poolId) => [
    poolId,
    { tvl: null, fees24h: null },
  ]),
);

const financialMetrics: PositionListFinancialMetricsDto = {
  positionValue: null,
  unclaimedFees: null,
  poolsById,
};

return { positions, summaryDtos, poolMetadataFailures, financialMetrics };
```

- [ ] **Step 4: Thread the block through the controller success response**

Add `financialMetrics` to `ListPositionsSuccessResponse`, capture it from the use-case result, and include it unchanged in the success object. Leave transient and pool-metadata error responses unchanged, because they represent request failure rather than a successfully measured unavailable state.

```ts
type ListPositionsSuccessResponse = {
  positions: PositionSummaryDto[];
  financialMetrics: PositionListFinancialMetricsDto;
  warning?: string;
};
```

- [ ] **Step 5: Run focused tests and package gates**

Run: `pnpm --filter @clmm/application test -- src/use-cases/positions/ListSupportedPositions.test.ts`

Expected: PASS, including unavailable, raw-liquidity independence, and deduplication cases.

Run: `pnpm --filter @clmm/adapters test -- src/inbound/http/PositionController.test.ts`

Expected: PASS, including the successful envelope and unchanged error cases.

Run: `pnpm --filter @clmm/application typecheck && pnpm --filter @clmm/adapters typecheck`

Expected: PASS across the changed producer and transport packages.

- [ ] **Step 6: Commit the producer and transport change**

```bash
git add packages/application/src/use-cases/positions/ListSupportedPositions.ts packages/application/src/use-cases/positions/ListSupportedPositions.test.ts packages/adapters/src/inbound/http/PositionController.ts packages/adapters/src/inbound/http/PositionController.test.ts
git commit -m "feat(positions): return explicit unavailable financial metrics"
```

## Task 3: Validate current responses and normalize legacy Expo responses

**Files:**

- Modify: `apps/app/src/api/positions.ts`
- Modify: `apps/app/src/api/positions.test.ts`

**Exported signature changes:** Add required `financialMetrics: PositionListFinancialMetricsDto` to exported `PositionsResult`, changing the return shape of exported `fetchSupportedPositions`.

**Behavioral invariants to write as named tests first:**

- `normalizes a legacy response without financialMetrics to unavailable metrics for every returned pool` — omission is the only backward-compatible fallback.
- `preserves exact zero and populated authoritative financial metrics` — valid claimed values survive parsing unchanged.
- `preserves null financial metrics as unavailable` — explicit nulls are not coerced to zero.
- `rejects malformed non-null financial metrics instead of normalizing them` — invalid values, source/timing metadata, or windows reject the whole claimed response.
- `rejects a present financialMetrics block that omits a returned pool` — current-contract responses cover every returned pool.
- `rejects pool metrics whose embedded pool id differs from the response map key` — no cross-pool display leakage.

- [ ] **Step 1: Add failing `fetchSupportedPositions` cases in its existing describe block**

Keep changes within the `describe('fetchSupportedPositions', ...)` section of the 448-line test file; do not alter `fetchPositionDetail` cases. Add a local valid metrics factory that returns fresh objects for mutation.

```ts
function unavailableMetricsFor(poolId: string): PositionListFinancialMetricsDto {
  return {
    positionValue: null,
    unclaimedFees: null,
    poolsById: { [poolId]: { tvl: null, fees24h: null } },
  };
}
```

- [ ] **Step 2: Run only the changed API describe block and confirm failure**

Run: `pnpm --filter @clmm/app test -- src/api/positions.test.ts -t "fetchSupportedPositions"`

Expected: FAIL because `PositionsResult` has no financial metrics validation or legacy normalization.

- [ ] **Step 3: Add the response contract and a pool-coverage guard**

Import `PositionListFinancialMetricsDto` and `isPositionListFinancialMetricsDto`. Treat `financialMetrics?: unknown` as transport input. After positions validation and successful-error handling:

```ts
const financialMetrics =
  payload.financialMetrics === undefined
    ? unavailableMetricsForPositions(payload.positions)
    : payload.financialMetrics;

if (!isPositionListFinancialMetricsDto(financialMetrics)) {
  throw new Error('Malformed positions financial metrics');
}

const returnedPoolIds = new Set(payload.positions.map((position) => position.poolId));
if ([...returnedPoolIds].some((poolId) => financialMetrics.poolsById[poolId] === undefined)) {
  throw new Error('Malformed positions financial metrics: missing returned pool');
}
```

The local legacy helper must create one null entry per unique returned `poolId`; it must not inspect position prices, fee labels, or raw liquidity and must not accept malformed present data as legacy.

- [ ] **Step 4: Return validated metrics with existing warning behavior intact**

Return `{ positions, financialMetrics, warning? }`. Preserve the current rule that an error with zero positions rejects and an error with partial positions becomes a warning. Do not modify `fetchPositionDetail`.

- [ ] **Step 5: Run focused API tests and app package gates**

Run: `pnpm --filter @clmm/app test -- src/api/positions.test.ts -t "fetchSupportedPositions"`

Expected: PASS for legacy omission, explicit null, zero, populated, malformed, coverage, existing warning, and existing error cases.

Run: `pnpm --filter @clmm/app typecheck`

Expected: PASS with the enriched `PositionsResult` signature.

- [ ] **Step 6: Commit the Expo boundary change**

```bash
git add apps/app/src/api/positions.ts apps/app/src/api/positions.test.ts
git commit -m "feat(app): validate and normalize position financial metrics"
```

## Task 4: Map financial metrics into closed UI display states

**Files:**

- Modify: `packages/ui/src/view-models/PositionListViewModel.ts`
- Modify: `packages/ui/src/view-models/PositionListViewModel.test.ts`
- Modify: `packages/ui/src/screens/PositionsListScreen.tsx`
- Modify: `packages/ui/src/screens/PositionsListScreen.test.tsx`
- Modify: `packages/ui/src/components/PositionCard.test.tsx`
- Modify: `packages/ui/src/index.ts`
- Modify: `apps/app/app/(tabs)/positions.tsx`
- Modify: `apps/app/src/appShellDependencies.test.ts`

**Exported signature changes:** Add exported `FinancialMetricViewModel`; add pool metric fields to `PositionListItemViewModel` and summary fields to `PositionListViewModel`; change `buildPositionListViewModel` to require `(positions, financialMetrics)`; change `PositionsListScreen` to accept `financialMetrics`; update the app route call site in the same task so workspace typecheck remains green.

**Behavioral invariants to write as named tests first:**

- `maps null financial metrics to unavailable display states` — output is exactly `{ kind: 'unavailable', label: '—' }`.
- `maps exact zero financial metrics to available $0.00 display states` — truthiness cannot erase zero.
- `formats positive financial metrics consistently in USD` — all four surfaces share one formatter.
- `fails closed when a view model receives negative or non-finite values` — defense in depth yields unavailable, never a displayed invalid amount.
- `matches pool metrics by exact pool id for shared and distinct pools` — shared-pool items reuse one mapping; different pools retain their own values.
- `does not compute summary metrics from pool metrics or position fields` — null aggregates stay unavailable even when every pool metric is populated.
- `passes response financial metrics through the Expo route without derivation` — composition forwards `positionsResult.financialMetrics`.

- [ ] **Step 1: Add failing view-model tests and update the card fixture shape**

Extend `PositionListViewModel.test.ts` using a metrics factory. Add the exact mapping invariant test names above. Update `baseItem` in `PositionCard.test.tsx` with unavailable `poolTvl` and `poolFees24h` fields so the additive required item shape typechecks before components consume the fields. Add `it('passes response financial metrics through the Expo route without derivation', ...)` to the existing app-shell guard; inspect `app/(tabs)/positions.tsx` and require both `financialMetrics={financialMetrics}` and assignment from `positionsResult?.financialMetrics`.

```ts
export type FinancialMetricViewModel =
  | { kind: 'unavailable'; label: '—' }
  | { kind: 'available'; valueUsd: number; label: string };
```

- [ ] **Step 2: Run view-model tests and confirm the new mapping API is absent**

Run: `pnpm --filter @clmm/ui test -- src/view-models/PositionListViewModel.test.ts`

Expected: FAIL because `buildPositionListViewModel` does not accept or map financial metrics.

- [ ] **Step 3: Implement one closed-state mapper and one USD formatter**

Use `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })`. Map null and invalid defensive inputs to unavailable; map finite non-negative numbers, including zero, to available. Do not export nullable numbers to components.

```ts
function toFinancialMetricViewModel(
  metric: { valueUsd: number } | null | undefined,
): FinancialMetricViewModel {
  if (metric == null || !Number.isFinite(metric.valueUsd) || metric.valueUsd < 0) {
    return { kind: 'unavailable', label: '—' };
  }
  return {
    kind: 'available',
    valueUsd: metric.valueUsd,
    label: USD_FORMATTER.format(metric.valueUsd),
  };
}
```

- [ ] **Step 4: Extend the list view model without aggregating**

Require `PositionListFinancialMetricsDto` as the second builder argument. Map `positionValue` and `unclaimedFees` directly at response level. For each item, read `financialMetrics.poolsById[p.poolId]`; absent entries defensively become unavailable. Never sum `items`, pool values, or known subsets.

```ts
export type PositionListViewModel = {
  items: PositionListItemViewModel[];
  isEmpty: boolean;
  positionValue: FinancialMetricViewModel;
  unclaimedFees: FinancialMetricViewModel;
};
```

- [ ] **Step 5: Update all signature call sites atomically**

Add `financialMetrics?: PositionListFinancialMetricsDto` to `PositionsListScreen` only at the outer state boundary, but require it inside `ConnectedPositionsList`. Use an all-unavailable empty object only as a defensive default for direct UI callers; the Expo route passes `positionsResult?.financialMetrics` unchanged. Update the UI index export and every builder call in the view-model/screen tests. Do not render metric labels in this task; Task 5 changes the components.

- [ ] **Step 6: Run focused mapping tests and cross-package type gates**

Run: `pnpm --filter @clmm/ui test -- src/view-models/PositionListViewModel.test.ts src/components/PositionCard.test.tsx`

Expected: PASS for the mapping invariants and the updated item fixture.

Run: `pnpm --filter @clmm/app test -- src/appShellDependencies.test.ts -t "passes response financial metrics through the Expo route without derivation"`

Expected: PASS for route-level pass-through without calculations.

Run: `pnpm --filter @clmm/ui typecheck && pnpm --filter @clmm/app typecheck`

Expected: PASS with the updated exported UI signatures and route call site.

- [ ] **Step 7: Commit the UI contract plumbing**

```bash
git add packages/ui/src/view-models/PositionListViewModel.ts packages/ui/src/view-models/PositionListViewModel.test.ts packages/ui/src/screens/PositionsListScreen.tsx packages/ui/src/screens/PositionsListScreen.test.tsx packages/ui/src/components/PositionCard.test.tsx packages/ui/src/index.ts 'apps/app/app/(tabs)/positions.tsx' apps/app/src/appShellDependencies.test.ts
git commit -m "feat(ui): map position metrics to explicit display states"
```

## Task 5: Render truthful metrics and remove fabricated placeholders

**Files:**

- Modify: `packages/ui/src/components/PortfolioSummaryStrip.tsx`
- Modify: `packages/ui/src/components/PositionCard.tsx`
- Modify: `packages/ui/src/components/PositionCard.test.tsx`
- Modify: `packages/ui/src/components/PositionCardUtils.ts`
- Modify: `packages/ui/src/components/PositionCardUtils.test.ts`
- Modify: `packages/ui/src/screens/PositionsListScreen.tsx`
- Modify: `packages/ui/src/screens/PositionsListScreen.test.tsx`

**Exported signature changes:** Change exported `PortfolioSummaryStrip` from a no-argument component to require `positionValue` and `unclaimedFees` display-state props. Remove internal module symbols `CardPlaceholderMetrics`, `CARD_PLACEHOLDER_FALLBACKS`, `hashStringToIndex`, and `getCardPlaceholderMetrics` from `PositionCardUtils.ts` (these are not exported; they are module-internal implementation details). `PositionCard` continues to receive `PositionListItemViewModel`, whose required metric fields were added in Task 4.

**Behavioral invariants to write as named tests first:**

- `renders unavailable financial metrics as em dashes with neutral styling` — loaded null values show `—`, not zero and not green.
- `renders exact zero financial metrics as $0.00` — all four surfaces preserve true zero.
- `renders populated authoritative financial metrics with corrected labels` — labels are `Position value`, `Unclaimed fees`, `Pool TVL`, and `Pool fees · 24h`.
- `does not render metric components while positions are loading` — loading remains screen-owned and separate from unavailable.
- `does not calculate unavailable summary values from populated pool cards` — null aggregates remain dashes.
- `renders shared pool metrics on each matching card without double counting the summary` — lookup is display-only.
- `contains none of the removed fabricated financial labels` — `$24,812`, `+$142.30`, `$8,420.19`, `$6,220.00`, `$3,105.77`, `+$12.40`, `+$4.82`, and `+$1.95` disappear from production and test fixtures.
- `preserves summary cards positions and market sections ordering` — the existing list layout remains summary, cards, S/R, thesis.

- [ ] **Step 1: Replace old screen expectations with failing semantic state tests**

Within the existing `describe('PositionsListScreen', ...)` block, replace only the portfolio-summary and ordering cases around the current summary section; add zero, populated, null, loading, and no-derived-total cases with the exact names above. In `PositionCard.test.tsx`, add direct unavailable/zero/populated rendering cases. Do not split unrelated market, navigation, range, or status tests out of the 574-line screen file.

- [ ] **Step 2: Run only the changed component and screen cases and confirm failure**

Run: `pnpm --filter @clmm/ui test -- src/components/PositionCard.test.tsx src/screens/PositionsListScreen.test.tsx -t "financial metrics|exact zero|authoritative|summary cards|loading|shared pool"`

Expected: FAIL while the hard-coded constants and generated placeholder helper still drive rendering.

- [ ] **Step 3: Make the summary strip render display-state props**

Delete `PORTFOLIO_VALUE` and `FEES_EARNED_VALUE`. Accept two `FinancialMetricViewModel` props, render their labels verbatim, and select `colors.textPrimary` for available values and `colors.textTertiary` for unavailable values. Use the corrected semantic labels and stable test IDs such as `position-summary-value` and `position-summary-unclaimed-fees`.

```tsx
<SummaryCard
  testID="position-summary-value"
  label="Position value"
  metric={positionValue}
/>
<SummaryCard
  testID="position-summary-unclaimed-fees"
  label="Unclaimed fees"
  metric={unclaimedFees}
/>
```

- [ ] **Step 4: Make cards render pool display states and remove green performance styling**

Destructure `poolTvl` and `poolFees24h` from the item. Render `Pool TVL` and `Pool fees · 24h`; use `colors.textPrimary` for available and `colors.textTertiary` for unavailable. Do not prefix fees with `+`, and do not call any utility to invent a value.

- [ ] **Step 5: Surgically delete placeholder-only utilities and tests**

From `PositionCardUtils.ts`, remove only `CardPlaceholderMetrics`, `CARD_PLACEHOLDER_FALLBACKS`, `hashStringToIndex`, and `getCardPlaceholderMetrics`. Remove their import and `describe('getCardPlaceholderMetrics', ...)` block from `PositionCardUtils.test.ts`. Retain and rerun all tests for token splitting, pool formatting, near-edge status, monitoring display, and breach side.

- [ ] **Step 6: Connect screen summary props and verify loaded-state control flow**

Pass `viewModel.positionValue` and `viewModel.unclaimedFees` to `PortfolioSummaryStrip`; cards already receive item-scoped metrics. Do not render the connected list for disconnected, loading, error-without-cache, or empty states, preserving the existing conditional control flow.

- [ ] **Step 7: Run focused UI tests and package gates**

Run: `pnpm --filter @clmm/ui test -- src/components/PositionCard.test.tsx src/components/PositionCardUtils.test.ts src/screens/PositionsListScreen.test.tsx src/view-models/PositionListViewModel.test.ts`

Expected: PASS for truthful state rendering plus all retained range, monitoring, selection, warning, and market-order behavior in the touched files.

Run: `pnpm --filter @clmm/ui typecheck && pnpm --filter @clmm/ui lint`

Expected: PASS with no placeholder imports or invalid component props.

- [ ] **Step 8: Commit the truthful rendering change**

```bash
git add packages/ui/src/components/PortfolioSummaryStrip.tsx packages/ui/src/components/PositionCard.tsx packages/ui/src/components/PositionCard.test.tsx packages/ui/src/components/PositionCardUtils.ts packages/ui/src/components/PositionCardUtils.test.ts packages/ui/src/screens/PositionsListScreen.tsx packages/ui/src/screens/PositionsListScreen.test.tsx
git commit -m "fix(ui): remove fabricated position financial values"
```

## Task 6: Document financial metric semantics and source requirements

**Files:**

- Modify: `docs/product-scope.md`

**Behavioral invariants:** None; this task changes documentation only.

- [ ] **Step 1: Add a focused `Displayed financial metric semantics` section**

Document the four contracts in a compact table:

| Display label   | Scope                        | Required timing            | Included                                | Excluded                                               | Current production source |
| --------------- | ---------------------------- | -------------------------- | --------------------------------------- | ------------------------------------------------------ | ------------------------- |
| Position value  | Returned supported positions | `valuedAtUnixMs`           | Principal token amounts                 | Wallet balances, fees, rewards, collected history, P&L | None; unavailable         |
| Unclaimed fees  | Returned supported positions | `valuedAtUnixMs`           | Currently claimable trading fees        | Rewards, collected/lifetime fees                       | None; unavailable         |
| Pool TVL        | Whole identified Orca pool   | `observedAtUnixMs`         | Source-reported USD TVL                 | Raw concentrated-liquidity scalar                      | None; unavailable         |
| Pool fees · 24h | Whole identified Orca pool   | Explicit 24-hour start/end | Source-reported pool fees in the window | Position fees and lifetime fees                        | None; unavailable         |

State that `null` means unavailable, zero is authoritative, claimed values require a named source, and summary totals must be complete rather than sums of available subsets.

- [ ] **Step 2: Inspect only the added documentation section**

Run: `sed -n '/^## Displayed Financial Metric Semantics$/,/^## /p' docs/product-scope.md`

Expected: The section contains all four labels, scopes, timing rules, exclusions, null/zero distinction, and the statement that no production source exists yet.

- [ ] **Step 3: Commit the semantic documentation**

```bash
git add docs/product-scope.md
git commit -m "docs: define displayed financial metric semantics"
```

**Tests to add or update**

- Add `packages/application/src/dto/validation.test.ts` for strict metric-contract validation.
- Update the list use-case tests for explicit null metrics, unique pool coverage, and independence from raw liquidity.
- Update controller tests for the success envelope and unchanged request-failure envelope.
- Update only the `fetchSupportedPositions` section of the large app API test for legacy omission, null, zero, populated, malformed, and coverage cases.
- Update view-model tests for the closed union, USD formatting, defensive invalid handling, exact pool lookup, and no aggregation.
- Update card tests for corrected labels and unavailable/zero/populated rendering.
- Remove only placeholder-specific utility tests; retain all unrelated `PositionCardUtils` tests.
- Update only financial-summary/loading/order cases in the large screen test, leaving unrelated market and interaction coverage intact.

**Validation commands after all implementation tasks complete**

These are final cross-package checks for the explicitly affected application, adapter, app, UI, and documentation change set; they are not a standalone implementation task:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
```

Expected: all commands exit 0. Before these checks in a fresh worktree, run `pnpm install --frozen-lockfile` if `node_modules` is absent; if workspace build outputs are absent after installation, run `pnpm build` before focused downstream-package tests.

**Risk areas**

- Contract rollout: new clients must normalize only an absent legacy block; malformed claimed values must still reject.
- False zero: no `value || 0`, `value ?? 0`, default-zero DTO, or subset sum is permitted.
- Semantic drift: raw liquidity and claimable detail totals must not be relabeled as TVL, position value, or lifetime earnings.
- Pool identity: map keys and embedded metric pool IDs must match, and the current response must cover every returned pool.
- Partial aggregates: summary values remain null unless a future producer can value the complete returned supported-position set.
- Existing large tests: edit only the targeted describe blocks/cases in `apps/app/src/api/positions.test.ts` and `packages/ui/src/screens/PositionsListScreen.test.tsx`; do not opportunistically rewrite them.
- UI styling: green currently suggests positive performance; financial amounts must use neutral/tertiary colors.
- Surgical cleanup: preserve unrelated `PositionCardUtils` range, monitoring, pool-format, token-pair, and breach helpers.

**Stop conditions**

- Stop if implementation would require a new external provider, position-detail fan-out, price quote, database write, cache, or retry/recovery subsystem; that needs separate design.
- Stop if any proposed value can only be sourced from `PoolData.liquidity`, `PositionDetailDto.unclaimedFees.totalUsd`, UI calculation, a fixture deck, or a hash.
- Stop if a metric's source, scope, inclusion set, or observation/valuation time cannot satisfy its metric-specific DTO.
- Stop if a summary aggregate would include only the positions with available prices or otherwise represent an incomplete subset.
- Stop if a change reaches `packages/domain`, execution/directional policy code, PairGlyph behavior, or broader portfolio analytics.
- Stop if a required exported signature cannot be updated together with every call site needed to keep the automatic workspace `pnpm -r typecheck` gate passing after that task.
- Stop if unrelated user changes overlap a listed file and cannot be preserved with a narrow edit.

**Plan self-review outcome**

- Spec coverage: all acceptance criteria map to Tasks 1–6; no authoritative producer is invented.
- Placeholder scan: the plan contains no deferred implementation placeholders; every code-changing task includes exact types, behavior, test names, commands, and expected results.
- Type consistency: `PositionListFinancialMetricsDto` is the sole transport shape; `FinancialMetricViewModel` is the sole component-facing shape; Task 4 updates all builder/screen call sites atomically.
- Task sizing: no task exists solely to run validation or repair CI. Large existing test files are changed only inside named feature sections as support for implementation tasks, not as oversized test-only tasks.

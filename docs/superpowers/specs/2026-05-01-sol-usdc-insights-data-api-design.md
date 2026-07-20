# SOL/USDC Insights Data API Design

## Goal

Expose a minimal read-only CLMM data API from the existing backend so the external `clmm-autopilot-pipeline` can generate daily SOL/USDC insights, range reviews, emergency volatility checks, and weekly performance reviews without making its own Solana RPC calls.

This is not an execution feature. The API must not sign transactions, submit swaps, rebalance liquidity, withdraw or deposit liquidity, request wallet private keys, or introduce any autonomous trading behavior.

The backend remains the deterministic data authority. The OpenClaw/LLM pipeline consumes clean snapshots from this API and produces analysis only.

## Context

The backend entrypoint is `packages/adapters/src/inbound/http/main.ts`, with Nest + Fastify controllers in `packages/adapters/src/inbound/http/`.

Relevant current pieces:

- `SupportedPositionReadPort` already exposes `listSupportedPositions`, `getPosition`, `getPositionDetail`, and `getPoolData`.
- `OrcaPositionReadAdapter` implements `SupportedPositionReadPort` with Orca Whirlpool and `@solana/kit`.
- `TriggerRepository` exposes actionable triggers.
- `PricePort` supports token price enrichment.
- `SrLevelsController` already exposes `GET /sr-levels/pools/:poolId/current`.
- S/R types are currently duplicated in application DTOs and adapter regime-engine types to preserve package boundaries.
- `SR_LEVELS_POOL_ALLOWLIST_MAP` currently contains the Orca SOL/USDC Whirlpool `Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE`.

Prior S/R work intentionally extracted pool-scoped S/R data away from position detail. This design preserves that scope: S/R levels are pool-level context and must not be copied onto each position.

## Design Choice

Use an application-layer use case with application DTOs and an application S/R read port.

The implementation should add:

- insight DTOs in `packages/application`
- an application-layer `SrLevelsReadPort`
- SOL/USDC insight read-model use cases in `packages/application`
- a thin `InsightsDataController` in `packages/adapters`

The controller maps HTTP params and primary failures to status codes. It does not own orchestration.

## Rejected Alternatives

### Adapter/controller composition

Composing pool, positions, triggers, prices, and S/R directly in `InsightsDataController` would reduce the initial diff, but it would put orchestration in HTTP, weaken boundary discipline, make testing harder, and risk duplicated logic across `/pool`, `/positions`, and `/bundle`.

### Provenance expansion before v1

Adding cache provenance and richer pool snapshot result types before exposing the API is useful later, but it delays the pipeline contract and risks scope creep. V1 must not fake `usedCache`, `rpcProvider`, `fresh`, or `cached` fields. Provenance can be added after the adapter exposes truthful metadata.

## Endpoint Contract

Add three read-only endpoints:

```text
GET /insights/sol-usdc/pool
GET /insights/sol-usdc/positions/:walletId
GET /insights/sol-usdc/bundle/:walletId
```

The API is deliberately narrow:

- `pair`: `SOL/USDC`
- `source`: `orca`
- pool: `Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE`

No generic multi-pool registry is part of v1.

## Endpoint Behavior Rules

Primary snapshot failures return `503`:

- allowlisted SOL/USDC pool snapshot unavailable
- position list read unavailable
- any allowlisted SOL/USDC position detail unavailable

HTTP `503` responses use `SolUsdcInsightErrorDto` with stable error codes, not framework-default error payloads.

Partial data is only for non-critical enrichment failures:

- S/R levels unavailable
- actionable triggers unavailable
- USD fee/reward valuation unavailable
- optional price-distance unavailable

`dataQuality.partial` is `true` if and only if `dataQuality.warnings.length > 0`.

`srLevels` lives once at the bundle top level, next to `pool`. It must not be copied onto each position. If the external pipeline wants self-contained per-position records, it can join `bundle.srLevels` at its own boundary.

`GET /insights/sol-usdc/positions/:walletId` and `GET /insights/sol-usdc/bundle/:walletId` use the same detail-backed `SolUsdcPositionInsightDto` shape.

USD valuation fields are nullable:

- `0` means the USD value is known and truly zero.
- `null` means raw fee/reward data exists, but USD valuation is unavailable because price enrichment failed or a required token price/decimals value is missing.

Do not include fake cache or provider provenance in v1.

## DTOs

Add the following DTOs to `packages/application/src/dto/index.ts`.

```ts
export type InsightDataWarning = {
  code:
    | 'sr_levels_unavailable'
    | 'actionable_triggers_unavailable'
    | 'fee_reward_usd_unavailable'
    | 'price_distance_unavailable'
    | 'principal_token_amounts_unavailable'
    | 'usd_price_quote_unavailable';
  message: string;
  scope?: {
    poolId?: string;
    positionId?: string;
    tokenMint?: string;
  };
};

export type InsightDataQualityDto = {
  partial: boolean;
  warnings: InsightDataWarning[];
};

export type SolUsdcPoolSnapshotDto = {
  poolId: string;
  pair: 'SOL/USDC';
  source: 'orca';
  observedAtUnixMs: number;
  tokenPairLabel: string;
  currentPrice: number;
  currentPriceLabel: string;
  sqrtPrice: string;
  tickCurrentIndex: number;
  tickSpacing: number;
  feeRate: number;
  feeRateLabel: string;
  poolLiquidity: string;
  priceSource: 'orca_whirlpool_sqrt_price';
};

export type SolUsdcFeeAmountDto = {
  raw: string;
  decimals: number | null;
  symbol: string;
  mint?: string;
};

export type SolUsdcRewardAmountDto = {
  mint: string;
  raw: string;
  decimals: number | null;
  symbol: string;
};

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

export type ExternalBreachDirection = 'lower-bound-breach' | 'upper-bound-breach';

export type SolUsdcPositionInsightDto = {
  walletId: string;
  positionId: string;
  poolId: string;
  pair: 'SOL/USDC';
  source: 'orca';
  observedAtUnixMs: number;
  rangeState: 'in-range' | 'below-range' | 'above-range';
  lowerTick: number;
  upperTick: number;
  currentTick: number;
  lowerPriceLabel: string;
  upperPriceLabel: string;
  currentPrice: number;
  currentPriceLabel: string;
  rangeDistance: {
    belowLowerTickPercent: number;
    aboveUpperTickPercent: number;
    belowLowerPricePercent?: number;
    aboveUpperPricePercent?: number;
  };
  feeRateLabel: string;
  unclaimedFees: {
    feeOwedA: SolUsdcFeeAmountDto;
    feeOwedB: SolUsdcFeeAmountDto;
  };
  unclaimedRewards: SolUsdcRewardAmountDto[];
  unclaimedFeesUsd: number | null;
  unclaimedRewardsUsd: number | null;
  principalTokenAmounts: SolUsdcPrincipalTokenAmountsDto | null;
  usdPriceQuotes: SolUsdcUsdPriceQuoteDto[];
  positionLiquidity: string;
  poolLiquidity: string;
  hasActionableTrigger: boolean;
  triggerId?: string;
  breachDirection?: ExternalBreachDirection;
};

export type SolUsdcPositionSnapshotDto = {
  walletId: string;
  positions: SolUsdcPositionInsightDto[];
  dataQuality: InsightDataQualityDto;
};

export type SolUsdcInsightInputBundleDto = {
  pair: 'SOL/USDC';
  source: 'orca';
  observedAtUnixMs: number;
  pool: SolUsdcPoolSnapshotDto;
  srLevels: SrLevelsBlock | null;
  positions: SolUsdcPositionInsightDto[];
  alerts: Array<{
    triggerId: string;
    positionId: string;
    breachDirection: ExternalBreachDirection;
    triggeredAt: number;
  }>;
  dataQuality: InsightDataQualityDto;
};

export type SolUsdcInsightErrorDto = {
  code: 'pool_snapshot_unavailable' | 'position_list_unavailable' | 'position_detail_unavailable';
  message: string;
  pair: 'SOL/USDC';
  poolId: string;
  walletId?: string;
  positionId?: string;
  retryable: true;
};
```

`SolUsdcPoolSnapshotDto.priceSource` is not cache provenance. It only describes the deterministic price calculation source for `currentPrice`.

Pool depth is intentionally omitted from insight DTOs until there is real depth computation or a concrete pipeline consumer need. Do not carry over the existing `poolDepthLabel: 'depth unavailable'` literal.

## Application Port

Add an application-layer S/R read port to `packages/application/src/ports/index.ts`:

```ts
export interface SrLevelsReadPort {
  fetchCurrent(symbol: string, source: string): Promise<SrLevelsBlock | null>;
}
```

`SrLevelsBlock` already exists in application DTOs. `packages/application` must not import adapter regime-engine types.

## Application Use Case

Prefer separate use cases with clear endpoint-aligned names:

```text
packages/application/src/use-cases/insights/GetSolUsdcInsightPoolSnapshot.ts
packages/application/src/use-cases/insights/GetSolUsdcInsightPositions.ts
packages/application/src/use-cases/insights/GetSolUsdcInsightBundle.ts
```

Alternatively, use one clearly named `GetSolUsdcInsightReadModel` module with separate exported functions for the pool, positions, and bundle contracts. Do not put all three endpoint contracts behind a vague "Bundle" file without clear function names.

The use cases own all orchestration for pool, position, alert, price, and S/R composition.

Inputs:

- `walletId` when wallet-scoped data is requested
- `poolId` for the allowlisted SOL/USDC pool
- `srLevelsLookup` metadata from composition, such as `{ symbol: 'SOL/USDC', source: 'mco' }`
- `SupportedPositionReadPort`
- `TriggerRepository`
- `PricePort`
- `SrLevelsReadPort`
- current time source, either `ClockPort` or an explicit `now` dependency

Results should be discriminated unions so the controller can map primary failures cleanly:

```ts
type GetSolUsdcPoolInsightResult =
  | { kind: 'ok'; pool: SolUsdcPoolSnapshotDto }
  | { kind: 'pool-unavailable' };

type GetSolUsdcPositionsInsightResult =
  | { kind: 'ok'; snapshot: SolUsdcPositionSnapshotDto }
  | { kind: 'pool-unavailable' }
  | { kind: 'position-list-unavailable' }
  | { kind: 'position-detail-unavailable'; positionId: string };

type GetSolUsdcInsightInputBundleResult =
  | { kind: 'ok'; bundle: SolUsdcInsightInputBundleDto }
  | { kind: 'pool-unavailable' }
  | { kind: 'position-list-unavailable' }
  | { kind: 'position-detail-unavailable'; positionId: string };
```

The exact function names can differ, but `/positions/:walletId` and `/bundle/:walletId` must share the same position-building path and `SolUsdcPositionInsightDto`.

### Pool Snapshot Flow

1. Call `positionReadPort.getPoolData(poolId)`.
2. If null or unavailable, return `pool-unavailable`.
3. Compute `currentPrice` from `poolData.sqrtPrice` when token decimals are known.
4. Return `SolUsdcPoolSnapshotDto`.

The allowlisted SOL/USDC pool snapshot is primary data. Do not return `pool: null`.

Because `currentPrice` and `currentPriceLabel` are required pool fields, missing token decimals for the allowlisted SOL/USDC pool should be treated as `pool-unavailable` rather than returning a tick-only or fallback price.

### Position Snapshot Flow

This flow applies to both `/positions/:walletId` and `/bundle/:walletId`.

1. Call `positionReadPort.getPoolData(poolId)` and build or validate the SOL/USDC pool snapshot first.
2. If pool data is null, unavailable, or lacks required SOL/USDC decimals, return `pool-unavailable`.
3. Call `listSupportedPositions(walletId)`.
4. If it fails, return `position-list-unavailable`.
5. Filter positions to the allowlisted SOL/USDC pool.
6. Call `getPositionDetail(walletId, positionId)` only for filtered positions.
7. If any detail is null or fails, return `position-detail-unavailable` with the failed `positionId`.
8. Build `SolUsdcPositionInsightDto` from detail-backed data.

Do not detail-read positions outside the allowlisted SOL/USDC pool.

Detail reads for allowlisted positions must be sequential or use bounded concurrency. Do not use unbounded `Promise.all` over `getPositionDetail`.

If there are no matching positions, return an empty positions array with `partial: false`.

### Trigger Enrichment Flow

Call `triggerRepo.listActionableTriggers(walletId)` as enrichment.

If successful:

- filter to triggers whose `positionId` is in the filtered allowlisted SOL/USDC position set
- map filtered triggers by `positionId`
- set `hasActionableTrigger`
- attach `triggerId`
- normalize `breachDirection.kind` to `'lower-bound-breach' | 'upper-bound-breach'`
- build bundle `alerts` from filtered triggers only

If unavailable:

- positions use `hasActionableTrigger: false`
- bundle `alerts` is empty
- add `actionable_triggers_unavailable`

This use case must not re-derive directional exit policy or target posture.

Do not return alerts for positions outside the allowlisted SOL/USDC pool in the SOL/USDC insights bundle.

### S/R Enrichment Flow

Call `srLevelsReadPort.fetchCurrent('SOL/USDC', 'mco')` for the bundle.

If it returns a block:

- set `bundle.srLevels` to that block

If it returns null or fails:

- set `bundle.srLevels` to null
- add `sr_levels_unavailable`

S/R is not included in `/positions/:walletId` responses and is not copied onto each position in the bundle.

### USD Valuation Flow

Fee/reward raw amounts come from `getPositionDetail`.

The insight DTO must include raw fee/reward data in addition to USD valuation:

- `unclaimedFees.feeOwedA.raw`, `decimals`, `symbol`, and optional `mint`
- `unclaimedFees.feeOwedB.raw`, `decimals`, `symbol`, and optional `mint`
- `unclaimedRewards[]` entries with `mint`, `raw`, `decimals`, and `symbol`

USD fields are:

```ts
unclaimedFeesUsd: number | null;
unclaimedRewardsUsd: number | null;
```

If all required token decimals and price quotes are available, compute known numeric values. A real zero remains `0`.

If price enrichment fails or any required quote/decimals value is unavailable, set the affected USD field to `null` and add `fee_reward_usd_unavailable` scoped to the position.

Do not reuse `PositionDetailDto.unclaimedFees.totalUsd` or `PositionDetailDto.unclaimedRewards.totalUsd` as insight valuation truth. Existing position DTO totals collapse unavailable valuation to `0`; the insight use case must compute valuation from raw `PositionDetail` plus `PricePort` so unavailable valuation remains distinguishable as `null`.

### Distance Flow

Tick-distance fields are required:

```ts
belowLowerTickPercent: number;
aboveUpperTickPercent: number;
```

They use the existing tick-distance semantics from the domain helper.

Price-distance fields are optional:

```ts
belowLowerPricePercent?: number;
aboveUpperPricePercent?: number;
```

The implementation should compute price-distance from tick prices when the required token decimals are known. If price-distance cannot be computed for a position, omit those fields and add `price_distance_unavailable` scoped to that position.

## Adapter And HTTP Layer

Add `InsightsDataController` under:

```text
packages/adapters/src/inbound/http/
```

The controller injects:

- `SUPPORTED_POSITION_READ_PORT`
- `TRIGGER_REPOSITORY`
- `PRICE_PORT`
- new `SR_LEVELS_READ_PORT`
- `SR_LEVELS_POOL_ALLOWLIST`
- clock dependency if the use case requires it

The controller calls the application use case and maps primary failure unions to HTTP `503` using stable `SolUsdcInsightErrorDto` payloads, not loose Nest default payloads.

Example failure payload shape:

```json
{
  "code": "position_detail_unavailable",
  "message": "Unable to read SOL/USDC position detail.",
  "pair": "SOL/USDC",
  "poolId": "Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE",
  "walletId": "...",
  "positionId": "...",
  "retryable": true
}
```

Supported error codes:

- `pool_snapshot_unavailable`
- `position_list_unavailable`
- `position_detail_unavailable`

Every error DTO includes `message`, `pair`, `poolId`, and `retryable: true`. Include `walletId` where applicable and `positionId` for position detail failures.

`CurrentSrLevelsAdapter` implements the new application `SrLevelsReadPort`. The adapter-local `CurrentSrLevelsPort` can be removed if no longer needed, or kept only if another adapter-local caller still needs it. The HTTP path should depend on the application port.

`AppModule` registers:

- `InsightsDataController`
- `SR_LEVELS_READ_PORT` bound to `CurrentSrLevelsAdapter`

Existing endpoints remain unchanged:

- `GET /positions/:walletId`
- `GET /positions/:walletId/:positionId`
- `GET /sr-levels/pools/:poolId/current`

`SrLevelsController` keeps existing semantics:

- unsupported pool: `404`
- supported pool but unavailable S/R: `200 { srLevels: null }`

## Cache TTL Configuration

Implement backend-only `CLMM_POOL_DATA_CACHE_TTL_MS` in `OrcaPositionReadAdapter`.

Rules:

- default is `30000` ms
- parse it safely from the environment
- invalid or non-positive values fall back to default
- document the variable in `packages/adapters/.env.sample`
- do not expose cache provenance in response DTOs

## Documentation

Update README or backend docs to note that the external insights pipeline should use:

```bash
CLMM_DATA_API_BASE=http://localhost:3001
```

Use the deployed backend URL in hosted environments.

The pipeline should call this backend, not Helius directly. Helius remains centralized behind `SOLANA_RPC_URL` in the backend.

## Tests

Application use-case tests should cover:

- pool snapshot success
- pool unavailable primary failure
- positions and bundle validate the pool before listing positions
- filters positions to the allowlisted SOL/USDC pool
- no matching positions returns empty positions with `partial: false`
- detail failure for an allowlisted position returns primary failure with `positionId`
- raw fee/reward fields are preserved on `SolUsdcPositionInsightDto`
- actionable trigger enrichment
- breach direction string normalization
- bundle alerts include only triggers for filtered allowlisted SOL/USDC positions
- actionable trigger failure warning
- S/R unavailable warning at bundle top level
- price valuation unavailable yields null USD fields and warning
- no `srLevels` on positions
- no `poolDepthLabel` on insight DTOs
- `/positions/:walletId` and `/bundle/:walletId` share the same position DTO shape

Adapter HTTP tests should cover:

- three routes return use-case payloads
- primary failures return HTTP `503` with `SolUsdcInsightErrorDto`
- failed `positionId` is included in the error DTO when detail read fails
- existing `PositionController` S/R absence regression remains unchanged
- existing `SrLevelsController` behavior remains unchanged

Config/docs tests where practical:

- `CLMM_POOL_DATA_CACHE_TTL_MS` parsing falls back safely on invalid values
- `.env.sample` documents `CLMM_POOL_DATA_CACHE_TTL_MS`
- README or docs mention `CLMM_DATA_API_BASE=http://localhost:3001`

## Verification

Narrow verification after implementation:

```bash
pnpm typecheck
pnpm --filter @clmm/application test
pnpm --filter @clmm/adapters test
```

For PR-ready completion, run broader repo checks if the final diff crosses package boundaries heavily:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
```

## Acceptance Criteria

- `GET /insights/sol-usdc/pool` returns a valid Orca SOL/USDC pool snapshot for the allowlisted pool.
- `GET /insights/sol-usdc/positions/:walletId` returns only allowlisted SOL/USDC Orca positions for the wallet.
- `GET /insights/sol-usdc/bundle/:walletId` returns pool, top-level S/R levels, positions, alerts, and minimal data quality in one compact payload.
- Positions and bundle endpoints validate the pool snapshot before listing wallet positions.
- Pool snapshot failures return `503` with `SolUsdcInsightErrorDto`.
- Allowlisted position detail failures return `503` with `SolUsdcInsightErrorDto` and include the failed `positionId` when available.
- Partial data warnings are used only for non-critical enrichment failures.
- `srLevels` is top-level in the bundle and never included per position.
- Bundle alerts include only actionable triggers for the filtered allowlisted SOL/USDC positions.
- Raw fee/reward fields are included in `SolUsdcPositionInsightDto`.
- Position USD valuation uses `number | null`, preserving the difference between known zero and unavailable valuation.
- `poolDepthLabel` is not included in insight DTOs.
- Existing position endpoint behavior remains unchanged.
- Existing S/R endpoint behavior remains unchanged.
- No execution, signing, liquidity mutation, swap submission, private-key, proof, attestation, or claim-verification concepts are added.
- No fake cache/provider provenance is returned.
- `CLMM_POOL_DATA_CACHE_TTL_MS` is implemented, safely parsed, defaults to `30000`, falls back on invalid values, and is documented.
- Tests cover the application use case and HTTP failure mapping.

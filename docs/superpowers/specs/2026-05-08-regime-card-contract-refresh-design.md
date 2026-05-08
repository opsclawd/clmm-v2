# Regime Card Contract Refresh Design

## Source

GitHub issue: https://github.com/opsclawd/clmm-v2/issues/84

## Goal

Refresh the Regime market-context card so it presents regime actionability, data quality, telemetry, and provenance without collapsing distinct concepts into vague labels.

The fix is a clean contract refresh across the existing Regime read path. It is not a UI-only patch.

## Assumptions

- No independently versioned external consumers depend on the current `RegimeBlock` shape.
- The Expo app, BFF, application DTOs, adapters, and UI are versioned together in this repo.
- If an independently versioned consumer exists, this design must change to a versioned or two-phase endpoint migration before implementation.

## Non-Goals

- No changes to `DirectionalExitPolicyService`.
- No changes to trigger qualification, exit preview generation, signing, submission, or reconciliation.
- No new regime-derived trading automation.
- No adapter, BFF, app, or UI fallback to the old ambiguous `capturedAtUnixMs` contract.

## Architecture

The existing Regime read path remains in place:

```text
regime-engine GET /v1/regime/current
  -> CurrentRegimeAdapter
  -> RegimeReadPort + RegimeBlock DTO
  -> BFF GET /regime/pools/:poolId/current
  -> apps/app/src/api/regime.ts
  -> positions route React Query
  -> PositionsListScreen
  -> RegimeSection
```

Layer ownership:

- `packages/application` owns the normalized `RegimeBlock` DTO and nested types.
- `packages/adapters` owns upstream regime-engine response parsing and normalization.
- `packages/adapters/src/inbound/http/RegimeController.ts` maps `RegimeReadResult` to the existing BFF envelope.
- `apps/app` validates the BFF response against the normalized DTO only.
- `packages/ui` builds display models from normalized DTOs and renders them.
- `packages/domain` remains unchanged for this issue.

`CurrentRegimeAdapter` is the only layer that understands the upstream regime-engine response shape. BFF, app, and UI code must consume only the normalized `RegimeBlock`.

## Normalized DTO

Replace the current DTO with a clean shape:

```ts
export type RegimeFreshness = {
  generatedAtUnixMs: number;
  lastCandleUnixMs: number;
  ageSeconds: number;
  softStale: boolean;
  hardStale: boolean;
  softStaleSeconds: number;
  hardStaleSeconds: number;
};

export type RegimeTelemetry = {
  realizedVolShort: number;
  realizedVolLong: number;
  volRatio: number;
  trendStrength: number;
  compression: number;
};

export type RegimeMetadata = {
  source: string;
  network: string;
  symbol: string;
  timeframe: string;
  sourceTimeframe?: string;
  sourceCandleCount?: number;
  candleCount?: number;
  derivedTimeframe?: string;
  aggregationVersion?: string;
  engineVersion?: string;
  configVersion?: string;
};

export type RegimeBlock = {
  regime: MarketRegime;
  telemetry: RegimeTelemetry;
  clmmSuitability: RegimeClmmSuitability;
  marketReasons: RegimeReason[];
  freshness: RegimeFreshness;
  metadata: RegimeMetadata;
};
```

`capturedAtUnixMs` is removed entirely. Do not keep it as an alias, deprecated field, or compatibility field.

`trendStrength` and `volRatio` are no longer top-level `RegimeBlock` fields. They live only inside `telemetry`.

## Adapter Mapping

`CurrentRegimeAdapter` maps upstream data into the normalized DTO.

Metadata mapping must use top-level upstream fields first, then nested `metadata` fallback:

- `source`
- `network`
- `symbol`
- `timeframe`
- optional metadata fields listed in `RegimeMetadata`

This prevents the UI from falling back to `MCO` when upstream says `geckoterminal`.

Required adapter validation:

- required metadata fields exist after top-level-then-nested fallback
- `generatedAtIso` parses to positive unix ms
- `lastCandleIso` parses to positive unix ms
- all telemetry values are finite numbers
- `ageSeconds >= 0`
- `softStaleSeconds > 0`
- `hardStaleSeconds > softStaleSeconds`

Invalid upstream shape returns `{ kind: 'upstream-error' }` and logs shape validation failure through `ObservabilityPort`.

## Freshness Semantics

The UI must not recalculate stale status using local thresholds such as the old 48-hour rule. It may format elapsed time for display, but data-quality classification comes only from upstream freshness fields.

Display precedence:

```text
hardStale -> Hard-stale
softStale -> Soft-stale
otherwise -> Fresh
```

Tone mapping:

- Fresh: neutral or success
- Soft-stale: warning
- Hard-stale: danger or error

Collapsed copy should distinguish both clocks:

- Generated age: derived from `generatedAtUnixMs` for "Generated 12m ago"
- Latest candle age: derived from `ageSeconds` and `lastCandleUnixMs` for "Latest candle is 87m old"

Threshold copy uses `softStaleSeconds` and `hardStaleSeconds`.

## Reason Handling

`RegimeViewModel` owns all reason sorting and dedupe logic. `RegimeSection` renders precomputed display reasons only.

Build `displayReasons[]` from:

- `clmmSuitability.reasons`
- `marketReasons`

Sort by severity:

```text
ERROR -> WARN -> INFO
```

Preserve source order as the tie-breaker.

Dedupe by:

1. `code`, when present
2. normalized `RegimeReason.text`
3. stale category

Minimum stale category rule: if `code` contains `STALE` or normalized `RegimeReason.text` contains `stale`, collapse those reasons into one freshness warning even when wording differs.

Collapsed mode renders only one `primaryDisplayReason`. Expanded mode may render the full deduped `displayReasons[]`.

## View Model

`RegimeViewModel` owns all interpretation:

- regime label
- suitability label and tone
- data-quality label and tone
- generated-age label
- latest-candle-age label
- source/provenance label
- compact telemetry label
- `primaryDisplayReason`
- `displayReasons[]`
- structured expanded detail rows

`RegimeSection` owns rendering and local expand/collapse state only. It must not sort reasons, dedupe reasons, classify stale status, format source strings, or interpret market data.

Use structured rows for expanded details:

```ts
export type RegimeDetailRow = {
  label: string;
  value: string;
  tone?: 'default' | 'muted' | 'warning' | 'danger' | 'success';
};
```

The view model exposes:

```ts
expandedTelemetryRows: RegimeDetailRow[];
expandedSampleRows: RegimeDetailRow[];
expandedFreshnessRows: RegimeDetailRow[];
```

Suitability copy:

- `ALLOWED`: `CLMM suitable`
- `CAUTION`: `CLMM caution`
- `BLOCKED`: `CLMM not recommended`
- `UNKNOWN`: `CLMM suitability unknown`

## Card UX

Add an explicit details affordance:

```text
Show details
Hide details
```

Do not rely only on hidden whole-card tap behavior.

Collapsed target:

```text
◆ Choppy regime
⚠ CLMM caution · data soft-stale
Latest candle is 87m old, past the 75m soft-stale threshold.
Trend flat · Vol ratio 1.06x
Generated 12m ago · Source: GeckoTerminal · SOL/USDC · 1h
Show details
```

Collapsed mode must stay concise and render only `primaryDisplayReason`.

Expanded target:

```text
Trend strength: 0.00018
Realized vol short: 0.70%
Realized vol long: 1.07%
Volatility ratio: 1.06x
Compression: 0.92%

Samples: 86 closed candles
Source candles: 346 x 15m
Derived timeframe: 1h
Aggregation: ohlcv-agg-v1

Latest candle: 87m old
Soft stale threshold: 75m
Hard stale threshold: 90m
Hide details
```

Do not render `Trend strength: 0.00 / 1.00` unless regime-engine explicitly guarantees a 0-to-1 scale. Use raw formatted value plus optional qualitative labels such as `Trend flat`.

Collapsed copy may use `Vol ratio` for compactness. Expanded copy should use `Volatility ratio`.

## Error Handling

Regime remains optional market context:

- malformed upstream regime payload -> adapter returns `upstream-error`
- missing required normalized metadata -> adapter returns `upstream-error`
- BFF `not-found`, `config-error`, and `upstream-error` remain `200` envelopes with `regime: null`
- unsupported pool remains BFF `404`
- null regime from BFF renders unavailable copy
- query failure with cached data still shows the degraded banner
- positions, S/R insights, policy insights, and exit behavior continue to render independently

No user-facing copy exposes backend config details.

## Testing

Application DTO and public exports:

- Use `expectTypeOf` or equivalent compile-time checks to prove the DTO no longer exposes `capturedAtUnixMs`.
- Prove `RegimeBlock` no longer exposes top-level `trendStrength`.
- Prove `RegimeBlock` no longer exposes top-level `volRatio`.
- Prove `RegimeBlock.telemetry` exposes `realizedVolShort`, `realizedVolLong`, `volRatio`, `trendStrength`, and `compression`.
- Prove `RegimeBlock.freshness` exposes generated timestamp, last candle timestamp, age, stale flags, and thresholds.
- Prove `RegimeBlock.metadata` requires `source`, `network`, `symbol`, and `timeframe`.

Adapter tests:

- exact upstream payload maps to normalized `RegimeBlock`
- top-level metadata wins over nested metadata
- nested metadata is used when top-level metadata is absent
- missing required metadata after fallback rejects as `upstream-error`
- invalid `generatedAtIso` rejects as `upstream-error`
- invalid `lastCandleIso` rejects as `upstream-error`
- `ageSeconds < 0` rejects as `upstream-error`
- `softStaleSeconds <= 0` rejects as `upstream-error`
- `hardStaleSeconds <= softStaleSeconds` rejects as `upstream-error`
- non-finite telemetry values reject as `upstream-error`
- full telemetry is retained
- freshness timestamps and thresholds are parsed
- existing 404, 400, 5xx, timeout, network, and malformed-body classifications remain covered

RegimeController tests:

- `block -> { regime: block }`
- `not-found -> { regime: null, unavailableReason: 'not-found' }`
- `config-error -> { regime: null, unavailableReason: 'config-error' }`
- `upstream-error -> { regime: null, unavailableReason: 'upstream-error' }`
- unsupported pool -> 404

App client tests:

- accepts the new normalized DTO
- rejects the old shape with top-level `trendStrength`, top-level `volRatio`, or `capturedAtUnixMs`
- preserves `unavailableReason` for null-regime responses
- preserves unsupported-pool error classification

View-model tests:

- `softStale=false`, `hardStale=false` -> Fresh
- `softStale=true`, `hardStale=false` -> Soft-stale
- `softStale=true`, `hardStale=true` -> Hard-stale
- `softStale=false`, `hardStale=true` -> Hard-stale
- generated time older than 48h but upstream stale flags false does not render stale
- `UNKNOWN` suitability renders `CLMM suitability unknown`
- reason severity sorting uses source order as tie-breaker
- stale-category dedupe collapses differently worded stale warnings
- collapsed output has one `primaryDisplayReason`
- expanded output has full deduped `displayReasons[]`
- source label uses normalized metadata and never invents `MCO`
- compact telemetry uses qualitative trend label and vol ratio
- expanded detail rows include full telemetry, samples/provenance, and freshness thresholds

Component tests:

- renders loading, unsupported, unavailable, valid, and degraded cached-data states
- renders explicit `Show details` / `Hide details`
- collapsed mode renders one reason
- expanded mode renders full reason/detail rows
- component does not need to inspect raw DTO fields beyond the view model output

## Verification

Because this is a cross-package public DTO change, implementation should run:

```text
pnpm build
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
```

Focused package tests should also be run while implementing:

```text
pnpm --filter @clmm/application test
pnpm --filter @clmm/adapters test
pnpm --filter @clmm/ui test
pnpm --filter @clmm/app test
```

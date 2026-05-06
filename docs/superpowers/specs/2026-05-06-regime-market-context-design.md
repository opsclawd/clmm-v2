# Regime Market Context Design

## Source

GitHub issue: https://github.com/opsclawd/clmm-v2/issues/63

## Goal

Surface regime-engine `GET /v1/regime/current` data on the positions list as informational market context. Regime must be parallel to S/R, not nested under S/R and not bundled into a generic market-context endpoint.

The feature is read-only and informational. It does not change trigger qualification, exit preview generation, signing, execution, or the directional exit policy invariant.

## Decisions

- Expose a pool-scoped BFF route: `GET /regime/pools/:poolId/current`.
- The Expo app passes only `poolId`.
- The BFF maps supported pool IDs to canonical regime-engine feed config server-side.
- Do not expose `symbol`, `source`, `network`, `poolAddress`, or `timeframe` to the Expo client.
- Do not reuse the S/R allowlist because regime requires `source=geckoterminal`, while existing S/R uses `source=mco`.
- Keep S/R levels and Market Thesis coupled in one S/R insight section because both come from `SrLevelsBlock`.
- Add regime as its own read port, adapter, BFF route, app API client, view model, and UI section.
- Place `RegimeSection` below `SrInsightsSection` in the positions list footer.

## Architecture

Regime follows a parallel read path to S/R:

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

`packages/domain` owns only pure value types:

- `MarketRegime = 'UP' | 'DOWN' | 'CHOP'`
- `ClmmSuitabilityStatus = 'ALLOWED' | 'CAUTION' | 'BLOCKED' | 'UNKNOWN'`

`packages/application` owns the port and DTOs:

- `RegimeReadPort`
- `RegimeBlock`
- regime telemetry, reason, freshness, and metadata DTOs

`packages/adapters` owns external concerns:

- regime-engine HTTP fetch
- regime feed config lookup
- response validation
- timeout and failure handling
- observability logging
- BFF response mapping

`packages/ui` owns presentation only:

- `RegimeViewModel`
- `RegimeSection`
- renamed `SrInsightsSection` for existing S/R levels plus Market Thesis

## BFF Contract

`GET /regime/pools/:poolId/current`

Unsupported app pools return BFF `404`.

Supported app pools return `200`:

```ts
type CurrentRegimeResponse = {
  regime: RegimeBlock | null;
  unavailableReason: 'not-found' | 'upstream-error' | 'config-error' | null;
};
```

Supported-pool outcome mapping:

| Scenario                                                      | BFF response                                            |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| Valid upstream `200`                                          | `{ regime: block, unavailableReason: null }`            |
| Upstream `404 CANDLES_NOT_FOUND`                              | `{ regime: null, unavailableReason: 'not-found' }`      |
| Upstream `400 VALIDATION_ERROR`                               | `{ regime: null, unavailableReason: 'config-error' }`   |
| Missing BFF regime feed config                                | `{ regime: null, unavailableReason: 'config-error' }`   |
| Upstream timeout, network error, `5xx`, or malformed response | `{ regime: null, unavailableReason: 'upstream-error' }` |

The BFF logs config errors and upstream failures, but the user-facing copy never exposes config details.

## Regime Feed Config

The BFF must fetch regime-engine with all five required upstream query parameters:

```text
symbol=SOL/USDC
source=geckoterminal
network=solana
poolAddress=Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE
timeframe=1h
```

These are mandatory backend feature config values, supplied by env or runtime config:

- `REGIME_ENGINE_POOL_ADDRESS`
- `REGIME_ENGINE_SOURCE`
- `REGIME_ENGINE_NETWORK`
- `REGIME_ENGINE_SYMBOL`
- `REGIME_ENGINE_TIMEFRAME`

Missing regime feed config must not be fatal to BFF startup. The regime route validates config when serving a supported pool request. If any required value is missing, it logs a config error and returns `200 { regime: null, unavailableReason: 'config-error' }`.

Do not provide production code defaults for canonical SOL/USDC feed values. Defaults may exist only in tests or fixtures.

The regime feed mapping must be separate from `SR_LEVELS_POOL_ALLOWLIST_MAP`.

## Adapter Design

`CurrentRegimeAdapter` fetches:

```text
GET ${REGIME_ENGINE_BASE_URL}/v1/regime/current?symbol=...&source=...&network=...&poolAddress=...&timeframe=...
```

Adapter requirements:

- Include all five required query params.
- Use a short timeout consistent with existing regime-engine read adapters.
- Return typed application DTOs only after validating response shape.
- Return explicit unavailable outcomes instead of throwing for expected upstream unavailability.
- Classify upstream `400 VALIDATION_ERROR` as a configuration problem.
- Log timeout, network, `5xx`, and malformed responses as upstream problems.
- Treat upstream `404 CANDLES_NOT_FOUND` as normal initial-setup unavailability.

Missing feed config is detected by the BFF route or a route-local config resolver before the adapter call. That path logs a config error and returns the BFF `config-error` response without attempting an upstream request.

The adapter should expose enough result information for the controller to produce the BFF contract without parsing log messages or HTTP details outside the adapter boundary.

## App Client

Add `apps/app/src/api/regime.ts`.

Client behavior:

- Calls only the BFF route: `/regime/pools/:poolId/current`.
- Does not know upstream regime-engine feed config.
- Throws a typed unsupported-pool error for BFF `404`.
- Validates `200` response shape.
- Returns `{ regime, unavailableReason }` for valid `200` responses.
- Rejects malformed BFF responses with controlled client errors.

The positions route keeps the existing unique-pool derivation and runs a second non-blocking query beside S/R:

```ts
useQuery({
  queryKey: ['regime-current', poolId],
  queryFn: () => fetchCurrentRegime(poolId!),
  enabled: poolId != null,
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false,
  refetchOnMount: true,
  retry: (failureCount, error) => !isRegimeUnsupportedPoolError(error) && failureCount < 1,
  retryDelay: 1000,
});
```

Regime loading and errors do not block positions, S/R insights, or primary screen rendering.

## UI Composition

`PositionsListScreen` composes the positions list as:

```text
Portfolio summary
Active positions header
Position cards
Footer:
  SrInsightsSection
  RegimeSection
```

Rename `MarketContextPanel` to `SrInsightsSection` or an equivalent narrow S/R insight name. It continues to render:

- Support & Resistance levels
- Market Thesis from `SrLevelsBlock.summary`

Do not split Market Thesis into a separate data/query component in this issue. If `summary` is missing, omit the thesis card without hiding S/R levels.

`RegimeSection` is independent from `SrInsightsSection`. Regime unavailable must not suppress S/R insights. S/R unavailable must not suppress regime.

## Regime UI Behavior

When `regime` is present, `RegimeSection` renders a compact, non-interactive detail area:

- Market regime badge: `UP`, `DOWN`, or `CHOP`
- CLMM suitability badge: `ALLOWED`, `CAUTION`, `BLOCKED`, or `UNKNOWN`
- Top CLMM suitability reason
- Top market reason
- `trendStrength`
- `volRatio`
- freshness as relative time
- stale indication when `freshness.softStale` or `freshness.hardStale` is true

Top reason selection:

- Sort by severity: `ERROR > WARN > INFO`.
- Preserve source order as the tie-breaker.
- Pick one top reason from `clmmSuitability.reasons`.
- Pick one top reason from `marketReasons`.

No expand/collapse state is added in this issue. Do not render every reason inline.

When `regime` is null, render a compact unavailable `RegimeSection` for all unavailable reasons:

| `unavailableReason` | User copy                       |
| ------------------- | ------------------------------- |
| `not-found`         | `Market data not available yet` |
| `upstream-error`    | `Market context unavailable`    |
| `config-error`      | `Market context unavailable`    |

Null-regime rendering omits badges, telemetry, and reasons.

## Error Handling

Regime is optional market context. All supported-pool null cases are non-blocking:

- positions still render
- S/R insights still render if available
- no exit behavior changes
- no directional mapping changes

Unsupported pool is the only BFF-level `404`. The app treats it as unsupported regime context and avoids retrying.

Mixed-pool states should degrade cleanly. The existing unique-pool derivation can keep regime disabled when more than one pool is present, matching the current S/R behavior.

## Testing

Focused tests should cover behavior where drift is likely:

- Domain exports `MarketRegime` and `ClmmSuitabilityStatus` as pure value types.
- Application exports `RegimeReadPort`, `RegimeBlock`, and nested DTOs through public APIs.
- Adapter includes all five upstream query params.
- Adapter maps upstream `404 CANDLES_NOT_FOUND` to `not-found`.
- Adapter maps upstream `400 VALIDATION_ERROR` to `config-error`.
- BFF config resolver maps missing feed config to `config-error`.
- Adapter maps timeout, network error, upstream `5xx`, and malformed responses to `upstream-error`.
- Adapter logs config and upstream failures without leaking secrets.
- BFF controller returns `404` for unsupported app pools.
- BFF controller returns `200 { regime, unavailableReason }` for supported pools.
- App API client validates BFF responses and classifies unsupported pools.
- Regime view model maps badge tones, formats telemetry, formats freshness, and selects top reasons by severity with source order as tie-breaker.
- `SrInsightsSection` and `RegimeSection` degrade independently.
- Missing `SrLevelsBlock.summary` omits Market Thesis without hiding S/R levels.
- Null regime renders the compact unavailable copy.
- Positions footer order is S/R insights first, regime second.

Before completion, run:

```text
pnpm build
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
```

## Out Of Scope

- Behavioral changes to exit pipeline, trigger qualification, thresholds, suppression, urgency, signing, or execution.
- Any change to `DirectionalExitPolicyService`.
- Any decision automation based on regime or CLMM suitability.
- Exposing regime-engine feed config to Expo.
- Reusing the S/R allowlist for regime.
- Bundling S/R and regime into a generic market-context BFF endpoint.
- Splitting Market Thesis away from `SrLevelsBlock`.
- Regime display on position detail, exit preview, or signing screens.
- Compact above-card regime strip.
- Broad market insight redesign.

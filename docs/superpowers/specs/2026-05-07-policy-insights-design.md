# PolicyInsights Display Design

## Source

GitHub issue: https://github.com/opsclawd/clmm-v2/issues/64

## Goal

Add a read-only PolicyInsights display path for OpenClaw CLMM policy recommendations from `regime-engine`.

PolicyInsights is advisory pair-level guidance for SOL/USDC CLMM management. It explains recommended action, posture, range bias, rebalance sensitivity, risk, confidence, data quality, freshness, and reasoning. It does not configure positions, execute transactions, change trigger qualification, alter exit previews, or touch the directional exit policy invariant.

This feature is separate from the existing Regime market-context path from issue #63. Do not rename, overload, or reuse Regime DTOs, ports, adapters, routes, clients, view models, or UI components for PolicyInsights.

## Decisions

- Implement a full parallel PolicyInsights read path.
- Use the exact single-pair BFF route: `GET /policy-insights/sol-usdc/current`.
- Do not add `poolId` to the BFF route, app client, query key, or `fetchCurrentPolicyInsight`.
- Keep app-side pool derivation only as an enable/render guard for the supported SOL/USDC single-pool context.
- Use the pair-scoped query key `['policy-insights-current', 'SOL/USDC']`.
- Hide PolicyInsights for mixed pools, disconnected wallets, empty positions, and unsupported pools.
- Render PolicyInsights only on the positions screen footer for MVP.
- Carry `sourceRefs` through DTOs, adapter validation, app client validation, and tests, but do not render them in the MVP UI.
- Do not add adapter retry logic. Fetch once, classify once, and degrade quickly.
- Add follow-up issues for history/detail, source refs display, S/R overlays, and any future apply flow.

## Architecture

PolicyInsights follows an independent read path:

```text
regime-engine GET /v1/insights/sol-usdc/current
  -> CurrentPolicyInsightsAdapter
  -> PolicyInsightsReadPort + PolicyInsightBlock DTOs
  -> BFF GET /policy-insights/sol-usdc/current
  -> apps/app/src/api/policyInsights.ts
  -> positions route TanStack Query
  -> PositionsListScreen
  -> PolicyInsightsSection
```

Layer ownership:

- `packages/application` owns `PolicyInsightBlock`, nested PolicyInsight DTOs, `PolicyInsightReadResult`, and `PolicyInsightsReadPort`.
- `packages/adapters` owns regime-engine HTTP fetch, upstream response validation, BFF route mapping, DI token wiring, and `AppModule` composition.
- `apps/app` owns the BFF client, runtime response validation, timeout handling, pair-scoped query, and SOL/USDC enablement guard.
- `packages/ui` owns `PolicyInsightsViewModel`, advisory copy, severity/freshness presentation, and `PolicyInsightsSection`.
- `packages/domain` has no changes.

The feature must not import adapters into application or UI, must not import UI into application, and must not add business logic to `apps/app`.

## Application Contract

Add `packages/application/src/dto/policyInsights.ts` and export it through the existing DTO surfaces.

Core DTO names:

- `PolicyInsightBlock`
- `PolicyInsightClmmPolicy`
- `PolicyInsightLevels`
- `PolicyInsightFreshness`

`PolicyInsightBlock` mirrors the upstream payload after validation:

```ts
type PolicyInsightBlock = {
  schemaVersion: '1.0';
  pair: 'SOL/USDC';
  asOf: string;
  source: 'openclaw';
  runId: string;
  status: 'FRESH' | 'STALE';
  marketRegime: string;
  fundamentalRegime: string;
  recommendedAction:
    | 'hold'
    | 'watch'
    | 'tighten_range'
    | 'widen_range'
    | 'exit_range'
    | 'pause_rebalances';
  confidence: 'low' | 'medium' | 'high';
  riskLevel: 'normal' | 'elevated' | 'critical';
  dataQuality: 'complete' | 'partial' | 'stale';
  clmmPolicy: PolicyInsightClmmPolicy;
  levels: PolicyInsightLevels;
  reasoning: string[];
  sourceRefs: string[];
  expiresAt: string;
  payloadHash: string;
  receivedAtIso: string;
  freshness: PolicyInsightFreshness;
};
```

Use singular result naming:

```ts
type PolicyInsightReadResult =
  | { kind: 'block'; block: PolicyInsightBlock }
  | { kind: 'not-found' }
  | { kind: 'store-unavailable' }
  | { kind: 'config-error' }
  | { kind: 'upstream-error' };

interface PolicyInsightsReadPort {
  fetchCurrent(): Promise<PolicyInsightReadResult>;
}
```

The port does not accept `poolId`, `symbol`, `source`, or other request parameters. This MVP is a single-pair read path.

## Adapter Design

`CurrentPolicyInsightsAdapter` calls:

```text
GET ${REGIME_ENGINE_BASE_URL}/v1/insights/sol-usdc/current
```

The adapter:

- validates `REGIME_ENGINE_BASE_URL` before fetching;
- does not add query parameters;
- uses a short timeout consistent with the existing regime-engine adapters;
- performs one request only, with no adapter retry;
- validates the complete upstream body before returning `block`;
- includes `sourceRefs` in validation and returned DTOs;
- maps expected unavailability to typed result variants;
- logs config and upstream failures through `ObservabilityPort`;
- does not throw for expected upstream unavailability.

Error mapping:

| Upstream condition                                     | Adapter result      | BFF response                                                      |
| ------------------------------------------------------ | ------------------- | ----------------------------------------------------------------- |
| `200` valid body                                       | `block`             | `{ policyInsight }`                                               |
| `404` or `INSIGHT_NOT_FOUND`                           | `not-found`         | `{ policyInsight: null, unavailableReason: 'not-found' }`         |
| `503`                                                  | `store-unavailable` | `{ policyInsight: null, unavailableReason: 'store-unavailable' }` |
| missing or malformed `REGIME_ENGINE_BASE_URL`          | `config-error`      | `{ policyInsight: null, unavailableReason: 'config-error' }`      |
| timeout, network error, malformed body, unexpected 5xx | `upstream-error`    | `{ policyInsight: null, unavailableReason: 'upstream-error' }`    |

Unexpected non-2xx responses other than `404` and `503` should be treated as `upstream-error` unless implementation evidence shows a more specific documented upstream code is needed.

## BFF Contract

Add `PolicyInsightsController` with:

```http
GET /policy-insights/sol-usdc/current
```

Response:

```ts
type PolicyInsightsCurrentResponse = {
  policyInsight: PolicyInsightBlock | null;
  unavailableReason?: 'not-found' | 'store-unavailable' | 'config-error' | 'upstream-error';
};
```

This route must not collide with the existing `/insights/sol-usdc/*` data-export controller guarded by `InsightsApiKeyGuard`. Do not add a generic `/api/insights/current` route.

## App Client And Query

Add `apps/app/src/api/policyInsights.ts`.

The client exposes:

```ts
fetchCurrentPolicyInsight(): Promise<PolicyInsightsCurrentResponse>
```

Client behavior:

- calls only `/policy-insights/sol-usdc/current`;
- accepts no `poolId` parameter;
- validates success and null/unavailable envelopes at runtime;
- validates nested `clmmPolicy`, `levels`, `freshness`, `reasoning`, and `sourceRefs`;
- throws controlled errors for non-2xx responses, invalid JSON, malformed envelopes, and malformed blocks.

The positions route keeps `deriveUniquePool(positions)` but uses the derived pool only as a guard. PolicyInsights is enabled only when:

- wallet positions have loaded;
- there is at least one supported position;
- the positions context is not mixed;
- the unique pool is the supported SOL/USDC Orca pool.

Query shape:

```ts
useQuery({
  queryKey: ['policy-insights-current', 'SOL/USDC'],
  queryFn: fetchCurrentPolicyInsight,
  enabled: policyInsightsEnabled,
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false,
  refetchOnMount: true,
  retry: (failureCount) => failureCount < 1,
  retryDelay: 1000,
});
```

`poolId` must not be passed into `fetchCurrentPolicyInsight`, the query key, or the BFF route.

## Screen Composition

`PositionsListScreen` receives explicit PolicyInsights props:

- `policyInsight`
- `policyInsightsLoading`
- `policyInsightsError`
- `policyInsightsEnabled`
- `policyInsightsUnavailableReason`

The positions footer order is:

```text
SrInsightsSection
RegimeSection
PolicyInsightsSection
```

PolicyInsights failure must not block positions, S/R, or Regime rendering. Disabled contexts render nothing:

- no wallet;
- positions not loaded;
- no supported positions;
- unsupported pool;
- mixed pools.

Unavailable states render only when PolicyInsights is enabled for the current SOL/USDC single-pool context and the BFF returns `{ policyInsight: null, unavailableReason }`.

## UI And View Model

Add `PolicyInsightsViewModel` to convert DTOs into presentation-only fields:

- action label and severity tone;
- posture, range bias, and rebalance sensitivity labels;
- max deployment label formatted as a percent;
- risk, confidence, and data-quality labels;
- freshness label;
- `isStale`, derived from `status === 'STALE' || freshness.stale === true`;
- first 3 non-empty reasoning strings, preserving upstream order;
- advisory subtitle copy.

Severity precedence:

- danger if `riskLevel === 'critical'` or `recommendedAction === 'exit_range'`;
- warning if `riskLevel === 'elevated'` or `recommendedAction === 'pause_rebalances'`;
- neutral/info otherwise.

Stale state is a separate warning line, not necessarily the card's primary severity.

`PolicyInsightsSection` renders a separate card with title:

```text
PolicyInsights
```

Subtitle:

```text
Advisory CLMM policy signal. Nothing has been applied.
```

Minimum displayed fields:

- recommended action;
- posture;
- range bias;
- rebalance sensitivity;
- max capital deployment percent;
- risk level;
- confidence;
- data quality;
- freshness/staleness;
- first 3 non-empty reasoning strings.

Unavailable copy:

| Reason              | Copy                               |
| ------------------- | ---------------------------------- |
| `not-found`         | `No policy insight available yet.` |
| `store-unavailable` | `Policy insights unavailable.`     |
| `config-error`      | `Policy insights unavailable.`     |
| `upstream-error`    | `Policy insights unavailable.`     |

If cached data is displayed after a refresh failure, show a degraded warning comparable to the existing Regime and S/R sections.

Do not render `sourceRefs` in the MVP positions footer.

## Tests

Adapter tests:

- happy path;
- `404` or `INSIGHT_NOT_FOUND`;
- `503`;
- malformed response;
- invalid JSON;
- network error;
- timeout;
- missing config;
- malformed config;
- nested `clmmPolicy`, `levels`, `sourceRefs`, and `freshness` validation failures.

Controller tests:

- `block` maps to `{ policyInsight }`;
- `not-found`, `store-unavailable`, `config-error`, and `upstream-error` map to documented null envelopes;
- route path is `/policy-insights/sol-usdc/current`.

App client tests:

- valid success;
- valid null/unavailable responses including `store-unavailable`;
- malformed body rejection;
- non-2xx rejection;
- invalid nested fields;
- no `poolId` parameter in the public client API.

View model tests:

- severity precedence;
- stale detection;
- max deployment formatting;
- first 3 non-empty reasoning strings in upstream order;
- source refs ignored for display.

Component tests:

- fresh rendering;
- stale warning;
- critical risk and `exit_range` danger state;
- elevated risk and `pause_rebalances` warning state;
- unavailable copy;
- degraded warning when cached data is displayed after refresh failure.

Positions screen and route tests:

- footer order is S/R, Regime, PolicyInsights;
- PolicyInsights hides for mixed or disabled contexts;
- PolicyInsights enables only for supported SOL/USDC single-pool context;
- PolicyInsights errors do not block positions, S/R, or Regime.

## Verification

Implementation should run the issue-required repo checks:

```text
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
```

Because this feature wires multiple packages, also run:

```text
pnpm build
```

## Out Of Scope

- Auto-configuring position parameters from `clmmPolicy`.
- One-click apply of policy knobs.
- PolicyInsight history UI or timeline.
- Position-detail PolicyInsights rendering.
- Chart overlays for PolicyInsights support/resistance levels.
- Merging PolicyInsights `levels` into `SrInsightsSection`.
- Source refs display in the positions footer.
- Changes to Regime market-context contracts.
- Changes to S/R contracts.
- Changes to execution, trigger qualification, exit preview, signing, or directional mapping.

## Follow-Up Issues

Create separate issues after the MVP lands:

1. PolicyInsights history/detail surface.
2. PolicyInsights source references display in a detail/history surface.
3. PolicyInsights S/R overlays on position detail after defining how pair-level levels relate to a specific LP range.
4. Apply PolicyInsights to execution or configuration flow, if advisory policy ever becomes user-applied configuration.

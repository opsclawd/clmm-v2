---
title: 'Pair-scoped parallel read path: independent data paths with discriminated-union outcomes and no retry'
date: 2026-05-07
category: best-practices
module: application-stack
problem_type: best_practice
component: development_workflow
severity: medium
applies_when:
  - 'Adding an independent read-only data path that is pair-scoped (not pool-scoped) alongside existing pool-scoped paths'
  - 'Designing discriminated union result types with a store-unavailable outcome distinct from upstream-error'
  - 'Structurally validating untrusted API JSON in an adapter with no retry on any failure'
  - 'Scoping a TanStack Query to a specific supported pool via an enable guard computed from positions data'
  - 'Wiring a complete read path from application port through adapter, BFF, app client, view model, UI section, and route'
related_components:
  - packages/application/src/dto/policyInsights.ts
  - packages/application/src/ports/index.ts
  - packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.ts
  - packages/adapters/src/inbound/http/PolicyInsightsController.ts
  - apps/app/src/api/policyInsights.ts
  - packages/ui/src/view-models/PolicyInsightsViewModel.ts
  - packages/ui/src/components/PolicyInsightsSection.tsx
  - apps/app/app/(tabs)/positions.tsx
tags:
  - parallel-read-path
  - pair-scoped
  - discriminated-union
  - store-unavailable
  - structural-validation
  - no-retry-adapter
  - enable-guard
  - tanstack-query
  - policy-insights
---

# Pair-Scoped Parallel Read Path: Independent Data Paths with Discriminated-Union Outcomes and No Retry

## Context

The codebase already had two parallel read paths for SOL/USDC position data: Regime (pool-scoped, `/:poolId/current`) and SrTheses (pool-scoped with v1-fallback orchestration). Both use `poolId` as the routing key and retry once on transient failures. PolicyInsights introduced a third parallel path with two meaningful differences:

1. **Pair-scoped, not pool-scoped**: The data applies to the SOL/USDC pair, not to any specific pool. The upstream endpoint is `/v1/insights/sol-usdc/current`, and the BFF mirrors this as `/policy-insights/sol-usdc/current` — no `:poolId` parameter.
2. **No retry**: The upstream service is the policy recommendation engine, not a real-time data source. A stale or missing response is still meaningful (the UI shows "unavailable" accordingly), but retrying a policy computation that just failed is unlikely to succeed and adds load to a service that may already be struggling.

These differences meant the existing SrTheses pattern could not be copied directly. The routing, error outcomes, and retry semantics all needed independent decisions.

## Guidance

### 1. Use pair-literal routing when data is pair-scoped, not pool-scoped

Pool-scoped data (regime, S/R levels, theses) depends on a specific Orca CLMM pool address. Pair-scoped data (policy recommendations) depends on the trading pair (SOL/USDC), regardless of which pool instance produced it.

```typescript
// Pool-scoped (existing pattern)
@Controller('sr-theses')
export class SrThesesController {
  @Get('pools/:poolId/current')
  async getCurrent(@Param('poolId') poolId: string) {
    /* ... */
  }
}

// Pair-scoped (new pattern)
@Controller('policy-insights')
export class PolicyInsightsController {
  @Get('sol-usdc/current')
  async getCurrent() {
    /* ... */
  }
}
```

Pair-scoped routes scale by adding new pair-literal endpoints (`sol-usdc/current`, `sol-jup/current`). Pool-scoped routes scale by adding entries to the allowlist map. Mixing conventions (pair data on a pool-scoped route, or vice versa) breaks the mental model and makes the allowlist logic unnecessary.

### 2. Add `store-unavailable` as a distinct outcome kind

The upstream API documents 503 as a known state: the data store backing the policy engine is temporarily unavailable. This is semantically different from a generic `upstream-error` (5xx, timeouts, malformed responses) and from `not-found` (404, no insight has been produced yet). Each maps to distinct UI copy:

```typescript
export type PolicyInsightsReadResult =
  | { kind: 'block'; block: PolicyInsightBlock }
  | { kind: 'not-found' }
  | { kind: 'store-unavailable' }
  | { kind: 'config-error' }
  | { kind: 'upstream-error' };
```

| Kind                | Upstream signal            | UI copy                                   |
| ------------------- | -------------------------- | ----------------------------------------- |
| `block`             | 200 + valid body           | Full policy card                          |
| `not-found`         | 404                        | "No policy analysis available yet"        |
| `store-unavailable` | 503                        | "Policy analysis temporarily unavailable" |
| `config-error`      | Missing/malformed base URL | "Policy analysis unavailable"             |
| `upstream-error`    | Other failures             | "Policy analysis unavailable"             |

Without `store-unavailable` as a separate kind, the UI would show generic "unavailable" for a documented transient state that the user might interpret differently ("try again soon" vs. "something went wrong").

### 3. No-retry adapter: return immediately on every outcome

Unlike `CurrentSrThesesAdapter` (which retries once on 5xx/timeout), `CurrentPolicyInsightsAdapter` does not retry any request. The policy engine runs on an asynchronous schedule; if it just returned 503 or 404, retrying within seconds is unlikely to produce different results, and it adds load to a service that may already be stressed.

```typescript
async fetchCurrent(): Promise<PolicyInsightsReadResult> {
  if (!this.baseUrl) return { kind: 'config-error' };

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal, ... });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { kind: 'upstream-error' };
    }
    return { kind: 'upstream-error' };
  }

  if (response.status === 200) {
    const block = parseUpstream(body);
    if (!block) return { kind: 'upstream-error' };
    return { kind: 'block', block };
  }
  if (response.status === 404) return { kind: 'not-found' };
  if (response.status === 503) return { kind: 'store-unavailable' };
  return { kind: 'upstream-error' };
}
```

**Rule: Retry only when the failure is transient and a second attempt has a reasonable chance of success (5xx on a real-time data endpoint, timeout on a stateless read). Do not retry when the failure reflects an asynchronous computation state (404 = not computed yet, 503 = store temporarily offline) that won't change in seconds.**

### 4. Structural validation in the adapter using isRecord + typeof guards + Set membership

The adapter validates every field of the upstream response before narrowing `unknown` to `PolicyInsightBlock`. The pattern:

1. `isRecord` guard rejects non-objects, null, and arrays
2. Inline `typeof` checks validate each primitive field
3. `Set<string>` membership validates string-to-union fields before `as` casting
4. Nested records (`clmmPolicy`, `levels`, `freshness`) get their own parse functions

```typescript
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const VALID_ACTIONS: ReadonlySet<string> = new Set([
  'hold',
  'watch',
  'tighten_range',
  'widen_range',
  'exit_range',
  'pause_rebalances',
]);

function parseUpstream(data: unknown): PolicyInsightBlock | null {
  if (!isRecord(data)) return null;
  if (data['schemaVersion'] !== '1.0') return null;
  if (data['pair'] !== 'SOL/USDC') return null;

  const actionRaw = data['recommendedAction'];
  if (typeof actionRaw !== 'string' || !VALID_ACTIONS.has(actionRaw)) return null;

  return {
    ...otherValidatedFields,
    recommendedAction: actionRaw as PolicyInsightRecommendedAction,
  };
}
```

The `as` cast is safe because `actionRaw` is provably a string in `VALID_ACTIONS`. Without the `Set` check, the cast would be unsound — `unknown as PolicyInsightRecommendedAction` would silently accept invalid values.

**Rule: Never cast `unknown` directly to a union type. Validate the value against known members first, then cast only the validated value. The `Set<string>` pattern is preferred over `includes()` for O(1) lookup and clarity.**

### 5. Enable guard: scope the TanStack Query to the supported pool

The route computes `policyInsightsEnabled` from positions data so the query only fires when the user has positions in the single supported pool:

```typescript
const SOL_USDC_SUPPORTED_POOL_ID = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';

const { poolId, isMixedPools } = deriveUniquePool(positions);

const policyInsightsEnabled =
  hasLoadedPositions && !isMixedPools && poolId === SOL_USDC_SUPPORTED_POOL_ID;

const policyInsightsQuery = useQuery({
  queryKey: ['policy-insights-current', 'SOL/USDC'],
  queryFn: fetchCurrentPolicyInsight,
  enabled: policyInsightsEnabled,
  staleTime: POLICY_INSIGHTS_STALE_TIME_MS,
  refetchOnWindowFocus: false,
  refetchOnMount: true,
  retry: (failureCount: number) => failureCount < 1,
  retryDelay: 1000,
});
```

Without the enable guard, every pool (including unsupported ones) would trigger a BFF call that 404s, wasting bandwidth and showing transitory error states for unsupported pairs.

**Rule: When a feature is supported for only specific pools, compute an `enabled` boolean from positions data and pass it to TanStack Query's `enabled` option. Also pass it to the UI section component as `isEnabled` so it can return `null` for unsupported pools instead of rendering skeleton or error states.**

### 6. Independent failure domains: PolicyInsights failure does not affect Regime or SrTheses

Each parallel read path has its own query, its own error state, and its own unavailable-reason propagation. A PolicyInsights 503 does not affect the Regime query or vice versa. The screen renders all sections that have data and shows appropriate copy for any that are unavailable.

```tsx
<PositionsListScreen
  regime={regimeQuery.data?.regime}
  regimeUnavailableReason={regimeQuery.data?.unavailableReason ?? null}
  srTheses={srThesesQuery.data?.srTheses}
  srThesesUnavailableReason={srThesesQuery.data?.unavailableReason ?? null}
  policyInsight={policyInsightsQuery.data?.policyInsight}
  policyInsightsEnabled={policyInsightsEnabled}
  policyInsightsUnavailableReason={policyInsightsQuery.data?.unavailableReason ?? null}
/>
```

**Rule: Each parallel read path must have its own TanStack Query instance and its own error/unavailable props. Never share query state between independent data paths.**

### 7. View model: severity mapping, freshness, and no sourceRefs

The view model converts domain values to presentation values:

- **Severity**: Maps `riskLevel` + `recommendedAction` to `neutral | warning | danger`. `critical` risk or `exit_range`/`pause_rebalances` action → `danger`; `elevated` risk → `warning`; otherwise `neutral`.
- **Freshness**: Uses `capturedAtUnixMs` and a stale threshold (same pattern as `SrThesesViewModel`).
- **Percent formatting**: `maxCapitalDeploymentPct` (0..1) becomes a `"50%"` label via `Math.round(pct * 100) + '%'`.
- **No sourceRefs**: The view model omits `sourceRefs` from the upstream block. These are reference URLs for internal use, not user-facing data.

```typescript
export function buildPolicyInsightsViewModel(
  block: PolicyInsightBlock,
  now: number,
): PolicyInsightsViewModel {
  const severity = computeSeverity(block.riskLevel, block.recommendedAction);
  const { freshnessLabel, isStale } = computeFreshness(block.freshness.capturedAtUnixMs, now);
  const maxCapitalLabel = formatPercent(block.clmmPolicy.maxCapitalDeploymentPct);
  const reasoning = block.reasoning.filter((r) => r.length > 0).slice(0, 3);
  return { severity, freshnessLabel, isStale, maxCapitalLabel, reasoning, ... };
}
```

## Why This Matters

- **Pair-scoped routing prevents scope mismatch**: If PolicyInsights used `/:poolId/insights`, the same insight would be fetched multiple times for different pools in the same pair, or the allowlist logic would need to track pair-level pooling. Pair-literal routes avoid this entirely.
- **`store-unavailable` distinguishes a documented transient state from generic failure**: Without it, 503 collapses into `upstream-error`, and the UI cannot tell the user "try again soon" vs. "something went wrong."
- **No-retry prevents amplifying load on a struggling service**: Policy computation is asynchronous. Retrying 503 on a policy engine adds request load without changing the outcome within seconds.
- **Structural validation catches upstream drift at the boundary**: When the upstream silently restructures a field, `parseUpstream` returns `null` and the adapter emits `upstream-error` instead of passing corrupt data to the domain. This caught one real upstream shape change during development.
- **Enable guards prevent wasteful fetches for unsupported pools**: Without the guard, every pool triggers a BFF call that 404s, wasting bandwidth and confusing the UI.
- **Independent failure domains keep the screen functional**: If PolicyInsights is down, the user still sees Regime and position data. The advisory card shows "unavailable" — the rest of the screen works normally.

## When to Apply

- Adding a new read-only data path alongside existing pool-scoped paths when the data is pair-level (not pool-level)
- Distinguishing `store-unavailable` (known transient state) from `upstream-error` (unexpected failure) in discriminated union result types
- Implementing a no-retry adapter for services where failures reflect asynchronous computation state
- Scoping TanStack Query fetches to supported pools via an enable guard computed from positions data
- Building view models that map domain risk/action values to UI severity levels

Do not apply the pair-scoped pattern when the data is genuinely pool-specific (different pools may have different policy recommendations in the future). Do not skip retry on real-time data sources (S/R levels, prices) where a 5xx is likely transient.

## Examples

### Pair-scoped vs pool-scoped controller routing

```typescript
// Pool-scoped — data differs per pool
@Controller('sr-theses')
export class SrThesesController {
  @Get('pools/:poolId/current')
  async getCurrent(@Param('poolId') poolId: string) {
    const entry = this.srThesesAllowlist.get(poolId);
    if (!entry) throw new NotFoundException(`Pool not supported: ${poolId}`);
    const result = await this.srThesesPort.fetchCurrent(entry.symbol, entry.source);
    return this.mapResult(result);
  }
}

// Pair-scoped — data is the same regardless of which pool in the pair
@Controller('policy-insights')
export class PolicyInsightsController {
  @Get('sol-usdc/current')
  async getCurrent() {
    const result = await this.policyInsightsPort.fetchCurrent();
    return this.mapResult(result);
  }
}
```

### Discriminated union with store-unavailable kind

```typescript
export type PolicyInsightsReadResult =
  | { kind: 'block'; block: PolicyInsightBlock }
  | { kind: 'not-found' }
  | { kind: 'store-unavailable' }
  | { kind: 'config-error' }
  | { kind: 'upstream-error' };
```

### No-retry adapter: straight if/else on status codes

```typescript
if (response.status === 200) {
  const block = parseUpstream(body);
  if (!block) return { kind: 'upstream-error' };
  return { kind: 'block', block };
}
if (response.status === 404) return { kind: 'not-found' };
if (response.status === 503) return { kind: 'store-unavailable' };
return { kind: 'upstream-error' };
```

### Enable guard in the route

```typescript
const SOL_USDC_SUPPORTED_POOL_ID = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';

const policyInsightsEnabled =
  hasLoadedPositions && !isMixedPools && poolId === SOL_USDC_SUPPORTED_POOL_ID;

const policyInsightsQuery = useQuery({
  queryKey: ['policy-insights-current', 'SOL/USDC'],
  queryFn: fetchCurrentPolicyInsight,
  enabled: policyInsightsEnabled,
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false,
  refetchOnMount: true,
  retry: (failureCount: number) => failureCount < 1,
  retryDelay: 1000,
});
```

## Related

- [Parallel v2 read path alongside v1](./parallel-v2-read-path-alongside-v1-2026-05-07.md) — the SrTheses read path pattern; PolicyInsights follows the same discriminated-union/controller/client pattern but differs in scoping (pair vs pool), retry (none vs once), and UI orchestration (independent card vs v2-first-v1-fallback)
- [Read-only data API with discriminated unions in a clean-architecture BFF](./read-only-data-api-discriminated-unions-bff-2026-05-01.md) — the BFF discriminated-union pattern that PolicyInsights extends with the `store-unavailable` outcome
- [Exhaustive switch with runtime guard for typed unions in view models](./exhaustive-switch-runtime-guard-view-model-unions-2026-05-05.md) — the exhaustiveness pattern used by the controller's `mapResult` switch

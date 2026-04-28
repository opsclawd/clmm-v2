---
title: "Extract pool-scoped data from position-scoped endpoints: S/R levels BFF extraction"
date: 2026-04-27
category: best-practices
module: packages/adapters
problem_type: best_practice
component: development_workflow
severity: medium
applies_when:
  - "Pool-level (or org-level) data is embedded in a per-position (or per-user) endpoint"
  - "A monolithic controller accumulates cross-concern dependencies that change independently"
  - "Removing a field from a shared DTO while older deployments may still return it"
  - "Designing error semantics for endpoints with both transient-failure and permanently-unsupported outcomes"
  - "Wiring TanStack Query for supplementary background data that must not block primary content"
related_components:
  - packages/ui
  - packages/application
tags:
  - data-scope-alignment
  - endpoint-extraction
  - bff
  - two-phase-commit
  - tanstack-query
  - error-semantics
  - forward-compat
  - exact-optional-property-types
  - sr-levels
---

# Extract pool-scoped data from position-scoped endpoints: S/R levels BFF extraction

## Context

S/R (Support & Resistance) market context was previously embedded in the position-detail BFF endpoint and rendered per-position on the Position Detail screen. This caused several problems:

- **Redundant fetches**: S/R is pool-level data — all positions in the same pool share the same S/R levels. Fetching it per-position meant N identical regime-engine calls for N positions.
- **Controller bloat**: `PositionController` injected `CurrentSrLevelsPort` and `SR_LEVELS_POOL_ALLOWLIST`, coupling position logic to S/R availability.
- **UI misalignment**: The Position Detail screen treated pool-level data as position-level state, making caching and refetch behavior incorrect.

The fix was a full extraction: new pool-scoped BFF endpoint, removed S/R from the position DTO, S/R view-model extracted to its own module, and UI moved from Position Detail to the Positions list page.

## Guidance

### 1. Data-scope alignment: extract to a scope-appropriate endpoint

When the API surface doesn't match the data's natural scope, split the endpoint so each serves one scope. Pool-level data deserves a pool-level endpoint, not repeated per-position.

```typescript
// packages/adapters/src/inbound/http/SrLevelsController.ts
@Controller('sr-levels')
export class SrLevelsController {
  constructor(
    @Inject(CURRENT_SR_LEVELS_PORT)
    private readonly srLevelsPort: CurrentSrLevelsPort,
    @Inject(SR_LEVELS_POOL_ALLOWLIST)
    private readonly srLevelsAllowlist: Map<string, { symbol: string; source: string }>,
  ) {}

  @Get('pools/:poolId/current')
  async getCurrent(@Param('poolId') poolId: string) {
    const entry = this.srLevelsAllowlist.get(poolId);
    if (!entry) {
      throw new NotFoundException(`Pool not supported: ${poolId}`);
    }
    const srLevels = await this.srLevelsPort.fetchCurrent(entry.symbol, entry.source);
    return { srLevels };
  }
}
```

After extraction, `PositionController` no longer imports `CurrentSrLevelsPort` or `SR_LEVELS_POOL_ALLOWLIST`. Add a regression test asserting those deps are never called.

### 2. Two-phase commit strategy: additive backend first, then breaking frontend change

- **Phase 1 (additive backend)**: Add the new endpoint, strip S/R from `PositionController`, register the new controller, update adapter tests. No frontend changes. No breaking changes — old clients still work.
- **Phase 2 (breaking frontend)**: Remove `srLevels` from `PositionDetailDto`, lift S/R view-model logic into its own `SrLevelsViewModel.ts`, wire the UI to the new endpoint, add forward-compat tests. This lands only after the backend is deployed.

This prevents clients from hitting 404s during rollout.

### 3. Error semantics design: 200 null vs 404, unsupported pool predicate, retry policy

Three distinct outcomes require three distinct HTTP semantics:

| Scenario | HTTP Status | Body | Client behavior |
|---|---|---|---|
| Supported pool, S/R available | `200` | `{ srLevels: <block> }` | Render data |
| Supported pool, transient engine failure | `200` | `{ srLevels: null }` | Show "unavailable" — success, not retry |
| Unsupported pool | `404` | NotFoundException | Show "unsupported" — no retry |

On the client, map 404 to a typed error that disables retries:

```typescript
// apps/app/src/api/srLevels.ts
export class SrLevelsUnsupportedPoolError extends Error {
  constructor(poolId: string) {
    super(`S/R levels not available: pool ${poolId} is not supported`);
    this.name = 'SrLevelsUnsupportedPoolError';
  }
}

export function isSrLevelsUnsupportedPoolError(error: unknown): error is SrLevelsUnsupportedPoolError {
  return error instanceof SrLevelsUnsupportedPoolError;
}

export async function fetchCurrentSrLevels(poolId: string): Promise<SrLevelsResponse> {
  const response = await fetch(
    `${getBffBaseUrl()}/sr-levels/pools/${encodeURIComponent(poolId)}/current`
  );
  if (response.status === 404) {
    throw new SrLevelsUnsupportedPoolError(poolId);
  }
  // ... validation logic ...
}
```

The retry policy becomes declarative:

```typescript
retry: (failureCount, error) =>
  !(error instanceof SrLevelsUnsupportedPoolError) && failureCount < 1,
```

Unsupported pools never retry. Transient failures retry once.

### 4. TanStack Query config for non-blocking background data with stale-while-revalidate

S/R data is supplementary — positions should load without waiting for it:

```typescript
// apps/app/app/(tabs)/positions.tsx
const SR_LEVELS_STALE_TIME_MS = 5 * 60 * 1000;

const srLevelsQuery = useQuery({
  queryKey: ['sr-levels-current', poolId],
  queryFn: () => fetchCurrentSrLevels(poolId!),
  enabled: poolId != null,
  staleTime: SR_LEVELS_STALE_TIME_MS,
  refetchOnWindowFocus: false,
  refetchOnMount: true,
  retry: (failureCount, error) =>
    !(error instanceof SrLevelsUnsupportedPoolError) && failureCount < 1,
});

const srLevelsUnsupported = srLevelsQuery.error instanceof SrLevelsUnsupportedPoolError;
const srLevelsError = srLevelsQuery.isError && !srLevelsUnsupported;
```

Key choices:
- `staleTime: 5m` — pool S/R changes infrequently; avoid hammering the regime engine.
- `refetchOnMount: true` — refresh on screen entry, but serve cached data immediately (stale-while-revalidate).
- `refetchOnWindowFocus: false` — avoid refetch on mobile tab switches.
- `enabled: poolId != null` — gate on positions loading first; S/R query is dependent but non-blocking.

Pass distinct state flags to the UI component:

```typescript
<PositionsListScreen
  srLevels={srLevelsQuery.data?.srLevels ?? null}
  srLevelsLoading={srLevelsQuery.isLoading && srLevelsQuery.fetchStatus !== 'idle'}
  srLevelsError={srLevelsError}
  srLevelsUnsupported={srLevelsUnsupported}
/>
```

The `fetchStatus !== 'idle'` guard prevents a flash of the skeleton on mount when cached data already exists.

### 5. Forward compatibility testing for removed DTO fields

After removing `srLevels` from `PositionDetailDto`, add a test proving stale servers still returning the field don't break the client:

```typescript
// apps/app/src/api/positions.test.ts
it('forward-compat: ignores srLevels if a stale server still attaches it', async () => {
  const detail = {
    positionId: 'Position1111111111111111111111111111111111',
    poolId: 'Pool111111111111111111111111111111111111111',
    // ... other fields ...
    srLevels: {  // stale server still sends this
      briefId: 'brief-1',
      sourceRecordedAtIso: null,
      summary: null,
      capturedAtUnixMs: 1_000_000,
      supports: [{ price: 90 }],
      resistances: [{ price: 210 }],
    },
  };

  const result = await fetchPositionDetail(/* ... */);
  expect(result.positionId).toBe('Position1111111111111111111111111111111');
  // srLevels silently ignored — validator drops unknown fields
});
```

### 6. `exactOptionalPropertyTypes` handling

When `exactOptionalPropertyTypes: true` is enabled, optional props typed as `T?` and `T | undefined` have different semantics. Use an explicit union type instead of the `?` modifier to allow callers to pass `null` or `undefined` without type errors:

```typescript
type Props = {
  srLevels: SrLevelsBlock | null | undefined;  // not srLevels?: SrLevelsBlock | null
  isLoading: boolean;
  isError: boolean;
  isUnsupported: boolean;
  now: number;
};
```

This lets callers distinguish "known absent" (`null`) from "not yet loaded" (`undefined`) without fighting the type checker.

For view-model builders, use explicit `?? undefined` instead of relying on implicit undefined:

```typescript
return {
  summary: block.summary ?? undefined,   // not just block.summary
  groups,
  freshnessLabel,
  isStale,
};
```

## Why This Matters

Without data-scope alignment, every position fetch redundantly fetches the same pool-level data — N positions means N identical calls. The controller accumulates cross-concern deps that change independently of the core feature. The UI treats pool data as position state, making caching and refetch behavior incorrect.

Without the two-phase strategy, deploying backend and frontend simultaneously creates a window where the new endpoint doesn't exist yet but the frontend already calls it — 404s for users. The additive-first approach guarantees no downtime.

Without distinct error semantics (200-null vs 404), the client can't tell "try again" from "never try again" and either retries forever on an unsupported pool or gives up on a transient failure. The typed `SrLevelsUnsupportedPoolError` predicate makes retry policy declarative.

Without forward-compat tests, a stale server still returning a removed field can silently corrupt the client if a future validator becomes strict. The test proves resilience.

## When to Apply

- Pool-level (or org-level) data is embedded in a per-position (or per-user) endpoint
- A monolithic controller accumulates cross-concern dependencies that change independently
- Removing a field from a shared DTO while older deployments may still return it
- Designing error semantics for endpoints with both transient-failure and permanently-unsupported outcomes
- Wiring TanStack Query for supplementary background data that must not block primary content

## Examples

### Before: Position-scoped endpoint with inline S/R

```typescript
// PositionController injected both position and S/R deps
@Controller('positions')
export class PositionController {
  constructor(
    private readonly positionReadPort: SupportedPositionReadPort,
    private readonly pricePort: PricePort,
    private readonly srLevelsPort: CurrentSrLevelsPort,        // cross-concern
    private readonly srLevelsAllowlist: Map<string, ...>,       // cross-concern
  ) {}

  @Get(':positionId')
  async getPosition(@Param('positionId') id: string) {
    const position = await this.positionReadPort.getPositionDetail(id);
    // ... enrichment ...
    const poolId = position.poolId;
    const entry = this.srLevelsAllowlist.get(poolId);
    if (entry) {
      position.srLevels = await this.srLevelsPort.fetchCurrent(entry.symbol, entry.source);
    }
    return { position };
  }
}
```

### After: Pool-scoped endpoint, no S/R on position

```typescript
// PositionController — 3-arg constructor, no S/R deps
@Controller('positions')
export class PositionController {
  constructor(
    private readonly positionReadPort: SupportedPositionReadPort,
    private readonly pricePort: PricePort,
    private readonly triggerPort: TriggerQualificationPort,
  ) {}

  @Get(':positionId')
  async getPosition(@Param('positionId') id: string) {
    const position = await this.positionReadPort.getPositionDetail(id);
    // ... enrichment (no S/R) ...
    return { position };
  }
}

// SrLevelsController — pool-scoped, dedicated endpoint
@Controller('sr-levels')
export class SrLevelsController {
  @Get('pools/:poolId/current')
  async getCurrent(@Param('poolId') poolId: string) { /* ... */ }
}
```

## Related

- [S/R Levels Card Redesign v2](../design-patterns/sr-levels-card-redesign-2026-04-26.md) — the grouped view-model and note-parsing pattern now serves `SrLevelsViewModel` and `MarketContextPanel` on the Positions list page (not PositionDetailScreen)
- [Enriching DTOs across clean-architecture layers](./enriching-dtos-across-layers-2026-04-25.md) — the general enrichment pattern; this extraction is the inverse case where removing an enrichment from a DTO is preferred over extending it
- GitHub Issue #50 — product requirements for the S/R extraction
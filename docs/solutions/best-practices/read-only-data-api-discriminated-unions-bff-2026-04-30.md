---
title: "Read-Only Data API Patterns: Discriminated Unions, Boundary Types, and Fail-Safe Enrichment"
date: 2026-04-30
category: best-practices
module: application
problem_type: best_practice
component: service_object
severity: medium
applies_when:
  - Adding read-only HTTP endpoints behind the BFF adapter layer
  - Designing use case return types that need error differentiation without exceptions
  - Implementing a port that bridges two package boundaries with identical but separate types
  - Filtering actionable data through an allowlist before external exposure
  - Deciding where to place shared computed data (top-level vs per-item) in API responses
tags: [nestjs, discriminated-unions, port-adapter, cache-ttl, boundary-purity, bff, enrichment]
related_components: [adapters, domain]
---

# Read-Only Data API Patterns: Discriminated Unions, Boundary Types, and Fail-Safe Enrichment

## Context

The CLMM BFF needed three read-only endpoints (`/insights/sol-usdc/pool`, `/positions/:walletId`, `/bundle/:walletId`) to expose Orca SOL/USDC pool data, position insights, and support/resistance levels to an external pipeline. The endpoints compose data from multiple sources (RPC, price feeds, S/R engine, trigger repository) and must degrade gracefully when non-critical sources fail. This feature surfaced several reusable architectural patterns that contradict common defaults — using discriminated unions instead of exceptions, duplicating types across boundaries instead of sharing them, and validating configuration at boot rather than at request time.

See also:
- [Enriching DTOs Across Layers](./enriching-dtos-across-layers-2026-04-25.md) — the broader DTO enrichment pattern this feature applies
- [S/R Levels Position-to-Pool Extraction](./sr-levels-position-to-pool-extraction-2026-04-27.md) — S/R endpoint extraction and fail-safe enrichment semantics

## Guidance

### 1. Discriminated Union Use Case Results

Application use cases return tagged unions, not exceptions. Each failure mode gets its own `kind`:

```ts
// packages/application/src/use-cases/insights/GetSolUsdcInsightPoolSnapshot.ts
type PoolSnapshotResult =
  | { kind: 'ok'; pool: SolUsdcPoolSnapshotDto }
  | { kind: 'pool-unavailable' };

// packages/application/src/use-cases/insights/GetSolUsdcInsightPositions.ts
type PositionsResult =
  | { kind: 'ok'; snapshot: SolUsdcPositionSnapshotDto }
  | { kind: 'pool-unavailable' }
  | { kind: 'position-list-unavailable' }
  | { kind: 'position-detail-unavailable'; positionId: string };
```

Controllers pattern-match on `kind` and map to HTTP status codes:

```ts
// packages/adapters/src/inbound/http/InsightsDataController.ts
if (result.kind === 'pool-unavailable') {
  throw this.poolUnavailable(walletIdRaw);
}
if (result.kind === 'position-detail-unavailable') {
  throw this.positionDetailUnavailable(walletIdRaw, result.positionId);
}
return { snapshot: result.snapshot };
```

This keeps control flow explicit in the type system — every caller must handle every case.

### 2. Boundary Type Duplication

When an adapter type needs to cross the application boundary, duplicate it in `packages/application/src/dto/` rather than importing from the adapter:

```ts
// packages/adapters/src/outbound/regime-engine/types.ts (adapter-local)
export interface SrLevelsBlock {
  briefId: string;
  sourceRecordedAtIso: string | null;
  // ...
}

// packages/application/src/dto/index.ts (application DTO)
export interface SrLevelsBlock {
  briefId: string;
  sourceRecordedAtIso: string | null;
  // ...structurally identical, intentionally separate
}
```

One adapter class implements both interfaces:

```ts
// packages/adapters/src/outbound/regime-engine/CurrentSrLevelsAdapter.ts
export class CurrentSrLevelsAdapter
  implements CurrentSrLevelsPort, SrLevelsReadPort {
  // single method satisfies both interfaces
  async fetchCurrent(symbol: string, source: string): Promise<SrLevelsBlock | null> { ... }
}
```

This keeps `packages/application` dependency-free from `packages/adapters`. A structural drift guard comment in both files reminds maintainers to keep them in sync.

### 3. Sequential Reads Over Unbounded Concurrency

Position detail reads are sequential, not parallel:

```ts
for (const p of filtered) {
  let detail: PositionDetail | null;
  try {
    detail = await positionReadPort.getPositionDetail(walletId, p.positionId);
  } catch {
    return { kind: 'position-detail-unavailable', positionId: p.positionId };
  }
  if (!detail) {
    return { kind: 'position-detail-unavailable', positionId: p.positionId };
  }
  details.push(detail);
}
```

This avoids unbounded `Promise.all` fan-out against RPC endpoints and gives deterministic error reporting — the first failure is surfaced immediately rather than swallowed in a `Promise.allSettled` reduction.

### 4. Enrichment Composition: Filtering and Normalization

Triggers are enriched in a dedicated composition step that filters to the allowlisted pool and normalizes domain enums:

```ts
// packages/application/src/use-cases/insights/GetSolUsdcInsightPositions.ts
const filteredTriggers = triggers
  .filter((t) => filteredPositionIds.has(t.positionId))
  .map((t) => ({
    triggerId: t.triggerId,
    positionId: t.positionId,
    breachDirection: t.breachDirection.kind, // domain BreachDirection.kind → ExternalBreachDirection
    triggeredAt: t.triggeredAt,
  }));
```

This keeps the domain model authoritative for direction semantics — the application layer normalizes for external consumption.

### 5. Fail-Safe Enrichment Design

Non-critical enrichment (S/R levels, price data, triggers) degrades to warnings, never primary failures:

```ts
// S/R fetch: failure = warning + null, not a primary error
let srLevels = null;
try {
  srLevels = await srLevelsReadPort.fetchCurrent(srLevelsLookup.symbol, srLevelsLookup.source);
} catch {
  warnings.push({ code: 'sr_levels_unavailable', message: 'S/R levels unavailable.' });
}
```

Pool snapshot failure, by contrast, is a hard 503 — you cannot return position data without a valid pool.

### 6. Safe Env Parsers with Exhaustive Fallback

```ts
// packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.ts
export function parsePoolDataCacheTtlMs(raw: string | undefined): number {
  if (raw === undefined || raw === '') return 30_000;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 30_000;
  return parsed;
}
```

Every code path through the parser returns a valid value. Invalid input is treated the same as absent input — safe default, no crash, no silent corruption.

### 7. Constructor-Time Misconfiguration Validation

The controller validates its allowlist at construction, not at request time:

```ts
constructor(...) {
  if (this.srLevelsAllowlist.size !== 1) {
    throw new Error(
      `InsightsDataController expects exactly one allowlist entry, found ${this.srLevelsAllowlist.size}`,
    );
  }
  const [poolIdRaw, lookup] = this.srLevelsAllowlist.entries().next().value;
  this.poolIdRaw = poolIdRaw;
  this.srLevelsLookup = lookup;
}
```

Misconfiguration surfaces at boot with a clear error, not at runtime with a mysterious 500.

## Why This Matters

- **Discriminated unions** make failure modes explicit in the type system. Every caller must handle every case; the compiler catches omissions. Exceptions hide control flow and encourage silent swallowing.
- **Boundary type duplication** preserves `packages/application` independence from `packages/adapters`. Importing adapter types across the boundary would couple the application layer to external SDKs and frameworks.
- **Sequential reads** prevent unbounded RPC fan-out. Position detail reads touch real Solana RPC endpoints — `Promise.all` on 50 positions is a self-inflicted DoS.
- **Fail-safe enrichment** ensures the API returns useful data even when non-critical sources (S/R, prices, triggers) are down. The bundle is still valuable without S/R levels.
- **Safe env parsers** eliminate an entire class of runtime crashes from malformed config. `Number('abc')` → `NaN` → default, not `undefined` → `TypeError`.
- **Constructor validation** makes misconfiguration a boot-time error visible in deploy logs, not a cryptic runtime 500 visible only in user reports.

## When to Apply

- Adding any new read-only endpoint to the BFF that composes data from multiple sources
- Designing use case return types where different failure modes need different HTTP responses
- Implementing a port that crosses the application/adapter boundary with a type that already exists in the adapter package
- Filtering domain data through an allowlist before exposing it in API responses
- Deciding whether enrichment failure should be a primary error or a degraded warning
- Adding environment-driven configuration for timeouts, cache TTLs, or connection pools

## Examples

### Discriminated union with controller mapping

```ts
// Use case returns tagged union
const result = await getSolUsdcInsightPositions({ walletId, poolId, ... });
if (result.kind === 'position-detail-unavailable') {
  // Controller maps to 503 with structured error DTO
  throw new HttpException({
    code: 'position_detail_unavailable',
    positionId: result.positionId,
    retryable: true,
  }, HttpStatus.SERVICE_UNAVAILABLE);
}
```

### Dual-interface adapter pattern

```ts
// Adapter implements both interfaces — one contract for the existing
// adapter-local port, one for the new application port
export class CurrentSrLevelsAdapter
  implements CurrentSrLevelsPort, SrLevelsReadPort {
  async fetchCurrent(symbol: string, source: string): Promise<SrLevelsBlock | null> {
    // One method satisfies both — types are structurally identical
  }
}

// AppModule wires the same instance to both DI tokens
{ provide: CURRENT_SR_LEVELS_PORT, useValue: currentSrLevelsAdapter },
{ provide: SR_LEVELS_READ_PORT, useValue: currentSrLevelsAdapter },
```

### Safe env parser pattern

```ts
export function parsePoolDataCacheTtlMs(raw: string | undefined): number {
  if (raw === undefined || raw === '') return 30_000;  // absent = default
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 30_000;  // invalid = default
  return parsed;
}

// Usage in AppModule
const poolDataCacheTtlMs = parsePoolDataCacheTtlMs(
  (process.env as Record<string, string | undefined>)['CLMM_POOL_DATA_CACHE_TTL_MS'],
);
```

### Constructor validation pattern

```ts
constructor(
  @Inject(SR_LEVELS_POOL_ALLOWLIST)
  private readonly srLevelsAllowlist: Map<string, { symbol: string; source: string }>,
) {
  if (this.srLevelsAllowlist.size !== 1) {
    throw new Error(`InsightsDataController expects exactly one allowlist entry, found ${size}`);
  }
  // Safe to destructure — we proved the map has exactly one entry
  const [poolIdRaw, lookup] = this.srLevelsAllowlist.entries().next().value;
}
```

## Related

- [Enriching DTOs Across Layers](./enriching-dtos-across-layers-2026-04-25.md) — broader DTO enrichment pattern
- [S/R Levels Position-to-Pool Extraction](./sr-levels-position-to-pool-extraction-2026-04-27.md) — S/R fail-safe enrichment semantics
- [Outbound Adapter Fire-and-Forget Dual Seam Pattern](./outbound-adapter-fire-and-forget-dual-seam-pattern-2026-04-19.md) — boundary-safe DI wiring
- GitHub Issue #52 — feature tracking issue for this work
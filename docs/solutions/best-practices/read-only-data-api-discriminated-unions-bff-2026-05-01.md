---
title: 'Read-only data API with discriminated unions in a clean-architecture BFF'
date: 2026-05-01
category: best-practices
module: packages/application, packages/adapters
problem_type: best_practice
component: service_object
severity: medium
applies_when:
  - 'Building read-only data API endpoints that compose multiple data sources with partial-failure semantics'
  - 'Mapping application-layer discriminated unions to HTTP status codes in a controller'
  - 'Structurally duplicating types across package boundaries to preserve dependency direction'
  - 'Designing enrichment composition where non-critical data fails safely without blocking the primary response'
  - 'Adding configurable cache TTLs or timeouts via environment variables with safe parsers'
  - 'Validating service configuration at boot time rather than at request time'
related_components:
  - packages/application/src/use-cases/insights
  - packages/adapters/src/inbound/http/InsightsDataController.ts
  - packages/adapters/src/outbound/regime-engine/CurrentSrLevelsAdapter.ts
  - packages/adapters/src/outbound/regime-engine/CurrentSrThesesAdapter.ts
  - packages/adapters/src/inbound/http/SrThesesController.ts
tags:
  - discriminated-union
  - clean-architecture
  - boundary-types
  - sequential-reads
  - fail-safe-enrichment
  - safe-env-parser
  - constructor-validation
  - read-only-api
  - bff
---

# Read-only data API with discriminated unions in a clean-architecture BFF

## Context

A SOL/USDC Insights Data API was needed to provide pool data, per-wallet position insights, and a full bundle (pool + positions + S/R + alerts) to an external pipeline. The BFF sits between mobile clients and on-chain data sources that have fundamentally different reliability profiles: Solana RPC calls can fail, the regime-engine S/R service can be down, and Jupiter price feeds can rate-limit. The API must compose data from all these sources but never return a misleading success response — when the pool snapshot is unavailable, the endpoint must signal that clearly, but when S/R enrichment fails, it must degrade gracefully rather than breaking the primary response.

The codebase uses a strict clean-architecture layering: `packages/domain` has zero external dependencies, `packages/application` depends only on domain, and `packages/adapters` implements all external concerns. The question was how to build read-only endpoints that compose multiple async data sources, handle partial failures with clear semantics, and keep the dependency arrows pointing inward — all while making incorrect configuration impossible at boot time rather than at request time.

## Guidance

### 1. Use discriminated union result types for use case returns

Every use case returns a tagged union where `kind` distinguishes success from each failure mode. The controller pattern-matches on `kind` to decide the HTTP response. This makes every failure path explicit and type-safe; no failure mode can be silently handled by the success branch.

```typescript
// packages/application/src/use-cases/insights/GetSolUsdcInsightPositions.ts
export type GetSolUsdcInsightPositionsResult =
  | { kind: 'ok'; snapshot: SolUsdcPositionSnapshotDto }
  | { kind: 'pool-unavailable' }
  | { kind: 'position-list-unavailable' }
  | { kind: 'position-detail-unavailable'; positionId: string };
```

Each variant carries exactly the data the controller needs: `ok` has the DTO, `position-detail-unavailable` carries the `positionId` for the error response. No extra fields, no `data: T | null` ambiguity.

### 2. Map discriminated union failures to HTTP 503 in the controller

The controller exhaustively pattern-matches the `kind` field. Every failure variant maps to 503 Service Unavailable with a machine-readable error DTO. Invalid `walletId` format (not base58, 32-44 chars) returns 400 Bad Request. All endpoints require an API key via `x-insights-api-key` header.

```typescript
// packages/adapters/src/inbound/http/InsightsDataController.ts
@UseGuards(InsightsApiKeyGuard)
@Controller('insights/sol-usdc')
export class InsightsDataController {
  private static readonly BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

  @Get('positions/:walletId')
  async getPositions(@Param('walletId') walletIdRaw: string) {
    this.validateWalletId(walletIdRaw);
    const result = await getSolUsdcInsightPositions({
      /* ... */
    });
    if (result.kind === 'pool-unavailable') {
      throw this.poolUnavailable();
    }
    if (result.kind === 'position-list-unavailable') {
      throw this.positionListUnavailable(walletIdRaw);
    }
    if (result.kind === 'position-detail-unavailable') {
      throw this.positionDetailUnavailable(walletIdRaw, result.positionId);
    }
    return { snapshot: result.snapshot };
  }

  private validateWalletId(walletId: string): void {
    if (!InsightsDataController.BASE58_REGEX.test(walletId)) {
      throw new HttpException(
        {
          code: 'invalid_wallet_id',
          message: 'walletId must be a valid Solana base58 address.',
          retryable: false,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
```

The error DTO (`SolUsdcInsightErrorDto`) includes `code`, `pair`, `poolId`, and `retryable: true`. Identifiers like `walletId` and `positionId` are NOT included in error responses to prevent enumeration.

### 3. Duplicate types across adapter/application boundaries intentionally

`SrLevelsBlock` is defined identically in both `packages/adapters/src/outbound/regime-engine/types.ts` and `packages/application/src/dto/index.ts`. Both files carry a drift guard comment:

```typescript
// Drift guard: SrLevel and SrLevelsBlock are structurally duplicated in
// packages/application/src/dto/index.ts. Any field change here MUST be
// mirrored there. The duplication is intentional — application must not
// import from adapters (boundaries rule).
```

One adapter class implements both interfaces:

```typescript
/** @deprecated Use SrLevelsReadPort from @clmm/application instead. */
export interface CurrentSrLevelsPort {
  fetchCurrent(symbol: string, source: string): Promise<SrLevelsBlock | null>;
}

export class CurrentSrLevelsAdapter implements CurrentSrLevelsPort, SrLevelsReadPort {
  async fetchCurrent(symbol: string, source: string): Promise<SrLevelsBlock | null> {
    /* ... */
  }
}
```

In `AppModule`, both `CURRENT_SR_LEVELS_PORT` and `SR_LEVELS_READ_PORT` DI tokens point to the same instance. The `CurrentSrLevelsPort` interface is deprecated — once `SrLevelsController` is migrated to use `SrLevelsReadPort`, both the adapter-local interface and its DI token should be removed:

```typescript
{ provide: CURRENT_SR_LEVELS_PORT, useValue: currentSrLevelsAdapter }, // TODO: remove after SrLevelsController migration
{ provide: SR_LEVELS_READ_PORT, useValue: currentSrLevelsAdapter },
```

This preserves the dependency rule (`application` never imports from `adapters`) while sharing a single adapter instance at runtime.

### 4. Use sequential reads for position details, not unbounded Promise.all

Position details are read one at a time in a `for` loop. If any detail read fails, the entire operation fails with `position-detail-unavailable` for that specific position ID. This avoids:

- **Thundering-herd RPC spikes** that `Promise.all` would create on wallets with many positions
- **Partial data ambiguity** — with `Promise.allSettled`, some successes and some failures would require complex partial-success handling that doesn't match the API contract
- **Resource exhaustion** on the Solana RPC endpoint

```typescript
const details: PositionDetail[] = [];
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

This is a deliberate trade-off: sequential reads are slower per-request but far more predictable and safe for the downstream RPC. If parallelism is needed later, use a bounded concurrency pool (e.g., p-limit with concurrency 3), not `Promise.all`.

### 5. Compose enrichment with fail-safe semantics — S/R failure = warning, not hard failure

The bundle endpoint fetches pool data, position details, price enrichment, and trigger enrichment as primary data. S/R levels are fetched last and treated as non-critical enrichment. If S/R fails, the bundle returns `srLevels: null` and appends a warning to `dataQuality.warnings`. The primary data (pool + positions) is never lost.

```typescript
let srLevels = null;
try {
  srLevels = await srLevelsReadPort.fetchCurrent(srLevelsLookup.symbol, srLevelsLookup.source);
} catch {
  warnings.push({
    code: 'sr_levels_unavailable',
    message: 'S/R levels unavailable.',
  });
}

return {
  kind: 'ok',
  bundle: {
    pair: 'SOL/USDC',
    source: 'orca',
    observedAtUnixMs,
    pool: poolResult.pool,
    srLevels, // null on failure — never a primary failure
    positions: triggerEnrichment.insights,
    alerts: triggerEnrichment.filteredTriggers,
    dataQuality: { partial: warnings.length > 0, warnings },
  },
};
```

This is the opposite of pool snapshot failure, which returns `{ kind: 'pool-unavailable' }` — a hard 503. Pool data is foundational; without it, the response would be meaningless. S/R data is supplementary; without it, the response is still useful.

### 6. Filter and normalize enrichment data at the composition boundary

Trigger enrichment applies a two-step filter: first fetch all triggers, then keep only those matching positions in the allowlisted pool. The `breachDirection` is normalized from the domain `BreachDirection` ADT to the application `ExternalBreachDirection` string literal using a named conversion function that makes the invariant mapping explicit:

```typescript
// packages/application/src/use-cases/insights/toExternalBreachDirection.ts
// The directional invariant (LowerBoundBreach -> SOL->USDC, UpperBoundBreach -> USDC->SOL)
// lives only in DirectionalExitPolicyService. This function projects the discriminated-union
// kind to the external string literal — it does NOT re-derive direction.
export function toExternalBreachDirection(
  breachDirection: BreachDirection,
): ExternalBreachDirection {
  return breachDirection.kind;
}
```

A compile-time drift guard in `packages/application/src/dto/index.ts` ensures the string literal values stay aligned with the domain's `BreachDirection` types:

```typescript
// Drift guard: ExternalBreachDirection values must match BreachDirection.kind variants.
// If BreachDirection adds or renames a kind, this assertion will fail at compile time.
type _AssertBreachDirectionMatch = AssertEqual<
  ExternalBreachDirection,
  BreachDirection extends infer B ? (B extends { kind: infer K } ? K : never) : never
>;
```

This ensures the external API never leaks internal domain types and that only relevant positions receive trigger data.

### 7. Make configurable values env-driven with safe parsers

The `OrcaPositionReadAdapter` cache TTL is configurable via `CLMM_POOL_DATA_CACHE_TTL_MS`, but a malformed env var must not crash the service. The `parsePoolDataCacheTtlMs` function validates, defaults, and falls back:

```typescript
const DEFAULT_POOL_DATA_CACHE_TTL_MS = 30_000;

export function parsePoolDataCacheTtlMs(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_POOL_DATA_CACHE_TTL_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_POOL_DATA_CACHE_TTL_MS;
  return Math.floor(parsed);
}
```

Every invalid input — undefined, empty, zero, negative, NaN, non-numeric — falls back to the default. The function is pure, tested independently, and called once at boot in `AppModule`:

```typescript
const poolDataCacheTtlMs = parsePoolDataCacheTtlMs(
  (process.env as Record<string, string | undefined>)['CLMM_POOL_DATA_CACHE_TTL_MS'],
);
const orcaPositionRead = new OrcaPositionReadAdapter(
  rpcUrl,
  snapshotReader,
  db,
  poolDataCacheTtlMs,
);
```

### 8. Validate configuration at construction time, not request time

The controller constructor validates the S/R allowlist has exactly one entry. The magic number is named explicitly as a v1 constraint. If it's empty or has multiple entries, the service fails immediately on boot with a clear error message:

```typescript
private static readonly EXPECTED_ALLOWLIST_SIZE_V1 = 1;

constructor(/* ... */) {
  if (this.srLevelsAllowlist.size !== InsightsDataController.EXPECTED_ALLOWLIST_SIZE_V1) {
    throw new Error(
      `InsightsDataController expects exactly one allowlist entry, found ${this.srLevelsAllowlist.size}`,
    );
  }
  const [poolIdRaw, lookup] = this.srLevelsAllowlist.entries().next().value as [
    string,
    { symbol: string; source: string },
  ];
  this.poolIdRaw = poolIdRaw;
  this.srLevelsLookup = lookup;
}
```

This turns a runtime misconfiguration (wrong allowlist size) into a boot-time error. NestJS won't start with a misconfigured controller, so no requests ever hit the invalid state. The test suite verifies this:

```typescript
it('throws on construction if the allowlist does not have exactly one entry', () => {
  expect(() =>
    new InsightsDataController(/* ... */, new Map(), fixedClock),
  ).toThrow();
});
```

### 9. Track partial data quality explicitly in the response DTO

The `InsightDataQualityDto` makes partial degradation observable to clients:

```typescript
export type InsightDataQualityDto = {
  partial: boolean;
  warnings: InsightDataWarning[];
};

export type InsightDataWarning = {
  code:
    | 'sr_levels_unavailable'
    | 'actionable_triggers_unavailable'
    | 'fee_reward_usd_unavailable'
    | 'price_distance_unavailable';
  message: string;
  scope?: { poolId?: string; positionId?: string };
};
```

Each warning carries a machine-readable `code`, a human-readable `message`, and an optional `scope` pinpointing the affected entity. Clients can decide whether to show degraded UI, log the issue, or retry based on `partial` and the specific warning codes.

### 10. Compose use cases from smaller use cases, don't duplicate logic

`getSolUsdcInsightBundle` composes over `getSolUsdcInsightPositions` rather than duplicating position-reading and price-fetching logic. After validating the pool snapshot, Bundle calls Positions to get the filtered, enriched position list, then layers on S/R levels and alert filtering. This ensures both endpoints produce consistent behavior for the same inputs.

## Why This Matters

- **Discriminated unions prevent silent failures**: Every failure mode has its own type variant. TypeScript exhaustiveness checking means adding a new failure kind to the union forces every consumer to handle it. No `null` hiding a real error.
- **Boundary type duplication preserves architecture**: Importing from `adapters` in `application` would break the dependency rule. Structural duplication with drift guards keeps packages decoupled while sharing a single instance at runtime via DI. Compile-time assertion types (`AssertEqual`) enforce drift detection at build time, not just via comments.
- **Sequential reads prevent RPC abuse**: Unbounded `Promise.all` on position details would hammer the Solana RPC and produce partial failures that are ambiguous to handle. Sequential reads are predictably safe.
- **Fail-safe enrichment keeps primary data flowing**: S/R levels are nice-to-have. Pool data is must-have. The discriminated-union + warning pattern lets the API degrade gracefully on S/R failure while hard-failing on pool failure. Clients always get useful data when possible.
- **Boot-time validation prevents runtime misconfiguration**: An empty or multi-entry allowlist is a deployment error, not a user request error. Surfacing it at boot time means NestJS won't start with invalid config.
- **Safe env parsers prevent operational footguns**: A typo in `CLMM_POOL_DATA_CACHE_TTL_MS` silently falls back to 30s instead of crashing production.
- **Explicit data quality tracking makes degradation observable**: Without `InsightDataQualityDto`, clients can't tell whether they're seeing complete or partial data. The `partial` flag and `warnings` array make degraded state machine-readable.
- **Composition over duplication prevents behavioral divergence**: When Bundle composes over Positions instead of duplicating the logic, both endpoints produce consistent results for the same inputs. Any bug fix in Positions automatically applies to Bundle.
- **API key auth and input validation protect read-only endpoints**: The `InsightsApiKeyGuard` and `BASE58_REGEX` walletId validation prevent unauthorized access and reject malformed input before it reaches RPC calls.
- **Error responses avoid identifier enumeration**: Error DTOs include machine-readable codes and server-configured pool IDs, but omit user-supplied `walletId` and `positionId` to prevent enumeration attacks.

## When to Apply

- Building read-only data API endpoints that compose multiple async data sources with partial-failure semantics
- Mapping application-layer discriminated unions to HTTP status codes in a controller, including input validation and auth guards
- Structurally duplicating types across package boundaries to preserve dependency direction
- Designing enrichment composition where non-critical data (S/R levels, price USD valuations) fails safely without blocking the primary response
- Adding configurable cache TTLs or timeouts via environment variables with safe parsers
- Validating service configuration at boot time rather than at request time
- Tracking partial data quality explicitly in response DTOs for client-side degradation logic
- Protecting read-only BFF endpoints with API key auth when JWT/session auth is not available

## Examples

### Discriminated union use case result and controller mapping

```typescript
// Application layer — use case result type
export type GetSolUsdcInsightPositionsResult =
  | { kind: 'ok'; snapshot: SolUsdcPositionSnapshotDto }
  | { kind: 'pool-unavailable' }
  | { kind: 'position-list-unavailable' }
  | { kind: 'position-detail-unavailable'; positionId: string };

// Adapter layer — controller validates input, applies auth, maps each variant
@UseGuards(InsightsApiKeyGuard)
@Controller('insights/sol-usdc')
export class InsightsDataController {
  private static readonly EXPECTED_ALLOWLIST_SIZE_V1 = 1;
  private static readonly BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

  @Get('positions/:walletId')
  async getPositions(@Param('walletId') walletIdRaw: string) {
    this.validateWalletId(walletIdRaw);
    const result = await getSolUsdcInsightPositions({
      walletId,
      poolId,
      positionReadPort,
      triggerRepo,
      pricePort,
      now,
    });
    if (result.kind === 'pool-unavailable') {
      throw this.poolUnavailable();
    }
    if (result.kind === 'position-list-unavailable') {
      throw this.positionListUnavailable(walletIdRaw);
    }
    if (result.kind === 'position-detail-unavailable') {
      throw this.positionDetailUnavailable(walletIdRaw, result.positionId);
    }
    return { snapshot: result.snapshot };
  }

  private validateWalletId(walletId: string): void {
    if (!InsightsDataController.BASE58_REGEX.test(walletId)) {
      throw new HttpException(
        {
          code: 'invalid_wallet_id',
          message: 'walletId must be a valid Solana base58 address.',
          retryable: false,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private poolUnavailable(walletIdRaw?: string): HttpException {
    const body: SolUsdcInsightErrorDto = {
      code: 'pool_snapshot_unavailable',
      message: 'Unable to read SOL/USDC pool snapshot.',
      pair: 'SOL/USDC',
      poolId: this.poolIdRaw,
      retryable: true,
    };
    return new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
```

### Dual-interface adapter pattern

```typescript
// packages/adapters/src/outbound/regime-engine/types.ts — adapter-local type
// Drift guard: SrLevel and SrLevelsBlock are structurally duplicated in
// packages/application/src/dto/index.ts. Any field change here MUST be
// mirrored there. The duplication is intentional — application must not
// import from adapters (boundaries rule).
export type SrLevelsBlock = {
  briefId: string;
  sourceRecordedAtIso: string | null;
  summary: string | null;
  capturedAtUnixMs: number;
  supports: SrLevel[];
  resistances: SrLevel[];
};

export interface CurrentSrLevelsPort {
  fetchCurrent(symbol: string, source: string): Promise<SrLevelsBlock | null>;
}

// packages/adapters/src/outbound/regime-engine/CurrentSrLevelsAdapter.ts — implements both
import type { CurrentSrLevelsPort, SrLevel } from './types.js';
import type { ObservabilityPort, SrLevelsReadPort, SrLevelsBlock } from '@clmm/application';

export class CurrentSrLevelsAdapter implements CurrentSrLevelsPort, SrLevelsReadPort {
  async fetchCurrent(symbol: string, source: string): Promise<SrLevelsBlock | null> { /* ... */ }
}

// packages/adapters/src/inbound/http/AppModule.ts — both tokens bind to one instance
const currentSrLevelsAdapter = new CurrentSrLevelsAdapter(regimeEngineBaseUrl, telemetry);
// ...
{ provide: CURRENT_SR_LEVELS_PORT, useValue: currentSrLevelsAdapter },
{ provide: SR_LEVELS_READ_PORT, useValue: currentSrLevelsAdapter },
```

### Safe env parser pattern

```typescript
const DEFAULT_POOL_DATA_CACHE_TTL_MS = 30_000;

export function parsePoolDataCacheTtlMs(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_POOL_DATA_CACHE_TTL_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_POOL_DATA_CACHE_TTL_MS;
  return Math.floor(parsed);
}

// Called once at boot in AppModule
const poolDataCacheTtlMs = parsePoolDataCacheTtlMs(
  (process.env as Record<string, string | undefined>)['CLMM_POOL_DATA_CACHE_TTL_MS'],
);
const orcaPositionRead = new OrcaPositionReadAdapter(
  rpcUrl,
  snapshotReader,
  db,
  poolDataCacheTtlMs,
);
```

Test cases cover all edge cases:

```typescript
expect(parsePoolDataCacheTtlMs(undefined)).toBe(30_000);
expect(parsePoolDataCacheTtlMs('')).toBe(30_000);
expect(parsePoolDataCacheTtlMs('60000')).toBe(60_000);
expect(parsePoolDataCacheTtlMs('0')).toBe(30_000);
expect(parsePoolDataCacheTtlMs('-500')).toBe(30_000);
expect(parsePoolDataCacheTtlMs('abc')).toBe(30_000);
```

### Constructor validation pattern

```typescript
@Controller('insights/sol-usdc')
export class InsightsDataController {
  private static readonly EXPECTED_ALLOWLIST_SIZE_V1 = 1;
  private readonly poolIdRaw: string;
  private readonly srLevelsLookup: { symbol: string; source: string };

  constructor(
    @Inject(SUPPORTED_POSITION_READ_PORT)
    private readonly positionReadPort: SupportedPositionReadPort,
    @Inject(TRIGGER_REPOSITORY) private readonly triggerRepo: TriggerRepository,
    @Inject(PRICE_PORT) private readonly pricePort: PricePort,
    @Inject(SR_LEVELS_READ_PORT) private readonly srLevelsReadPort: SrLevelsReadPort,
    @Inject(SR_LEVELS_POOL_ALLOWLIST) private readonly srLevelsAllowlist: SrLevelsAllowlist,
    private readonly now: () => number = Date.now,
  ) {
    if (this.srLevelsAllowlist.size !== InsightsDataController.EXPECTED_ALLOWLIST_SIZE_V1) {
      throw new Error(
        `InsightsDataController expects exactly one allowlist entry, found ${this.srLevelsAllowlist.size}`,
      );
    }
    const [poolIdRaw, lookup] = this.srLevelsAllowlist.entries().next().value as [
      string,
      { symbol: string; source: string },
    ];
    this.poolIdRaw = poolIdRaw;
    this.srLevelsLookup = lookup;
  }
}
```

## Related

- [Enriching DTOs across clean-architecture layers](./enriching-dtos-across-layers-2026-04-25.md) — the general enrichment pattern; this document applies it to a read-only data API
- [S/R position-to-pool extraction](./sr-levels-position-to-pool-extraction-2026-04-27.md) — the prior extraction that moved S/R out of per-position endpoints; this API gives S/R its own pool-level fetch
- [Outbound adapter fire-and-forget dual-seam pattern](./outbound-adapter-fire-and-forget-dual-seam-pattern-2026-04-19.md) — boundary-safe type duplication at the adapter seam

---
title: 'Parallel v2 read path alongside v1: full-stack pattern for evolving data pipelines'
date: 2026-05-07
category: best-practices
module: packages/application, packages/adapters, packages/ui, apps/app
problem_type: best_practice
component: development_workflow
severity: medium
applies_when:
  - 'Adding a v2 data path alongside an existing v1 path in a clean-architecture BFF'
  - 'Designing discriminated union result types for adapter→BFF→app→UI propagation'
  - 'Using open string fields for extensible enums that cross service boundaries'
  - 'Building a v2-first with v1-fallback UI orchestrator'
  - 'Deciding what goes on the application public surface vs internal ports'
  - 'Wiring TanStack Query for a parallel data fetch with per-path error classification'
related_components:
  - packages/application/src/ports/index.ts
  - packages/application/src/dto/index.ts
  - packages/adapters/src/outbound/regime-engine/CurrentSrThesesAdapter.ts
  - packages/adapters/src/inbound/http/SrThesesController.ts
  - apps/app/src/api/srTheses.ts
  - packages/ui/src/view-models/SrThesesViewModel.ts
  - packages/ui/src/components/SrInsightsSection.tsx
tags:
  - parallel-read-path
  - v2-first-fallback
  - discriminated-union
  - open-string-fields
  - public-surface-discipline
  - adapter-retry
  - tanstack-query
  - view-model
---

# Parallel v2 Read Path Alongside v1: Full-Stack Pattern for Evolving Data Pipelines

## Context

S/R ("support/resistance") data for SOL/USDC positions originally came through a v1 `SrLevelsBlock` path: a flat array of support and resistance price levels with a text summary. The regime-engine service later introduced a v2 `SrThesesBlock` path with richer structured data — per-thesis bias, setup type, entry zones, invalidation levels, source attribution, and timestamps.

The question was how to add this v2 path without disrupting the working v1 path. The answer: build a complete parallel read path from adapter through UI, let the orchestrator prefer v2 with v1 fallback, and remove v1 only when v2 is proven stable. Every layer — DTO, port, adapter, BFF controller, app client, view model, component — gets its own v2 file that does not import or depend on v1 code.

This pattern is repeatable for any future v2 data evolution.

## Guidance

### 1. Build a complete parallel read path — don't modify v1

When v2 data arrives, create independent files at every layer. The v1 path stays untouched and continues to work if v2 is absent.

```
v1:  SrLevelsBlock → SrLevelsReadPort → CurrentSrLevelsAdapter → SrLevelsController → fetchCurrentSrLevels → SrLevelsViewModel → SrLevelsCard
v2:  SrThesesBlock → SrThesesReadPort → CurrentSrThesesAdapter → SrThesesController → fetchCurrentSrTheses → SrThesesViewModel → SrThesesPanel
```

The only place both paths meet is the UI orchestrator component (`SrInsightsSection`), which decides which to render.

### 2. Use discriminated union result types — not null returns

v1 adapters returned `SrLevelsBlock | null`. Null collapses "not found", "config error", and "upstream down" into one value. The caller cannot distinguish them or give the user a meaningful message.

v2 uses a discriminated union:

```typescript
// packages/application/src/ports/index.ts
export type SrThesesReadResult =
  | { kind: 'block'; block: SrThesesBlock }
  | { kind: 'not-found' }
  | { kind: 'config-error' }
  | { kind: 'upstream-error' };

export interface SrThesesReadPort {
  fetchCurrent(symbol: string, source: string): Promise<SrThesesReadResult>;
}
```

The BFF controller maps each `kind` to a distinct HTTP response:

```typescript
// packages/adapters/src/inbound/http/SrThesesController.ts
private mapResult(result: SrThesesReadResult) {
  switch (result.kind) {
    case 'block':
      return { srTheses: result.block };
    case 'not-found':
      return { srTheses: null, unavailableReason: 'not-found' as const };
    case 'config-error':
      return { srTheses: null, unavailableReason: 'config-error' as const };
    case 'upstream-error':
      return { srTheses: null, unavailableReason: 'upstream-error' as const };
  }
}
```

The app client unpacks the same envelope into `{ srTheses: SrThesesBlock | null, unavailableReason? }`. The UI orchestrator uses `unavailableReason` to choose appropriate copy.

**When adding any v2 path, start with a discriminated union result type. Never repeat v1's `| null` pattern.**

### 3. Use open string fields for extensible enums

`bias`, `setupType`, and `sourceReliability` are typed as `string | null`, never as string literal unions like `'bullish' | 'bearish' | 'neutral'`. The upstream service may introduce new values at any time.

The view model maps known values to presentation tones, and gracefully handles any unknown string:

```typescript
// packages/ui/src/view-models/SrThesesViewModel.ts
const KNOWN_BULLISH = new Set(['bull', 'bullish', 'long']);
const KNOWN_BEARISH = new Set(['bear', 'bearish', 'short']);
const KNOWN_NEUTRAL_WARN = new Set(['range', 'neutral', 'chop', 'choppy']);

function biasToneOf(bias: string | null): SrThesisBiasTone {
  if (bias == null) return 'neutral';
  const key = bias.toLowerCase().trim();
  if (KNOWN_BULLISH.has(key)) return 'safe';
  if (KNOWN_BEARISH.has(key)) return 'breach';
  if (KNOWN_NEUTRAL_WARN.has(key)) return 'warn';
  return 'neutral';
}
```

An unknown `bias` like `'mildly-constructive-but-cautious'` renders with the neutral tone instead of crashing or being silently dropped. A public surface test confirms this works at compile time:

```typescript
// packages/application/src/public/srTheses.exports.test.ts
it('keeps bias, setupType, and sourceReliability open as string | null', () => {
  const thesis: SrThesisDto = {
    // ...
    bias: 'mildly-constructive-but-cautious',
    setupType: 'distribution-into-vwap',
    sourceReliability: 'tier-experimental-2026',
    // ...
  };
  expect(thesis.bias).toBe('mildly-constructive-but-cautious');
});
```

**Rule: If the set of valid values is owned by an external service and may expand without notice, type as `string | null`. If the set is closed and application-owned (like `BreachDirection.kind`), use a literal union.**

### 4. Implement the same adapter class for the new port

v1 used one adapter class implementing two interfaces (`CurrentSrLevelsPort` deprecated + `SrLevelsReadPort`). The v2 adapter implements only the new port:

```typescript
// packages/adapters/src/outbound/regime-engine/CurrentSrThesesAdapter.ts
export class CurrentSrThesesAdapter implements SrThesesReadPort {
  constructor(
    private readonly baseUrl: string | null,
    private readonly observability: ObservabilityPort,
  ) {}

  async fetchCurrent(symbol: string, source: string): Promise<SrThesesReadResult> {
    // ...
  }
}
```

The DI module binds the adapter to the port token:

```typescript
{ provide: SR_THESES_READ_PORT, useValue: currentSrThesesAdapter }
```

If the v2 port later supersedes v1, the same adapter can implement both ports (like v1's `CurrentSrLevelsAdapter`). But starting with a single-port adapter is simpler and avoids carrying forward deprecated interfaces.

### 5. Adapter retry discipline: retry once on transient failures only

The v2 adapter distinguishes retryable from non-retryable failures:

| Response                            | Classification          | Retry? |
| ----------------------------------- | ----------------------- | ------ |
| 200 + valid body                    | `block`                 | No     |
| 200 + empty theses                  | `not-found`             | No     |
| 200 + invalid body                  | `retryable` (malformed) | Yes    |
| 404                                 | `not-found`             | No     |
| 400                                 | `config-error`          | No     |
| 408 Request Timeout                 | `retryable`             | Yes    |
| 429 Too Many Requests               | `retryable`             | Yes    |
| 5xx / timeout / network error       | `retryable`             | Yes    |
| Other non-2xx (401, 403, 405, etc.) | `upstream-fatal`        | No     |

```typescript
// packages/adapters/src/outbound/regime-engine/CurrentSrThesesAdapter.ts
const FETCH_TIMEOUT_MS = 2000;
const RETRY_DELAY_MS = 1000;

async fetchCurrent(symbol: string, source: string): Promise<SrThesesReadResult> {
  // ...
  const first = await this.attempt(url);
  if (first.kind !== 'retryable') {
    return this.toResult(first);
  }
  await delay(RETRY_DELAY_MS);
  const second = await this.attempt(url);
  if (second.kind === 'retryable') {
    return { kind: 'upstream-error' };  // two failures → upstream-error (not retryable)
  }
  return this.toResult(second);
}
```

The adapter uses an internal `AttemptOutcome` type with finer-grained kinds (`retryable`, `upstream-fatal`) that collapse to the port's coarser `SrThesesReadResult` via `toResult()`. This keeps the port contract stable while giving the adapter internal flexibility.

**Additional guards reviewed post-implementation:**

- **`capturedAtUnixMs <= 0`**: The adapter rejects timestamps that parse to non-positive values (epoch zero or negative). This aligns the BFF parser with the app client validator, which also rejects `<= 0`.
- **Empty theses guard**: `buildSrThesesViewModel` returns a graceful empty view model when `block.theses.length === 0`, rather than crashing on non-null assertions.
- **URL scheme validation**: `SrThesisCard` validates `sourceUrl` before opening — only `http:` and `https:` schemes are allowed. Arbitrary URL schemes (tel:, sms:, custom app schemes) are blocked to prevent unintended app launches or phishing.
- **Stable React keys**: `SrThesesPanel` uses `${card.sourceHandle}-${card.timestampLabel ?? idx}` instead of array indices for thesis card keys, preventing state leaks on re-renders.

**Rule: Never retry on 400, 404, 401, 403, or 405. These indicate client error, absence, or auth failure, not transient failure. Retry once on 408, 429, 5xx, timeout, network disconnect, or malformed response. After one failed retry, return `{ kind: 'upstream-error' }`. Use a minimum 1-second retry delay to avoid amplifying load on a struggling upstream.**

### 6. v2-first with v1-fallback in the UI orchestrator

`SrInsightsSection` is the only component aware of both v1 and v2. Its rendering priority:

1. **v2 data available** → render `SrThesesPanel`
2. **v2 loading (no v1 data yet)** → show skeleton
3. **v1 data available** → render `SrLevelsCard` (v1 fallback)
4. **v1 loading** → show skeleton
5. **v2 has `unavailableReason` and no v1** → show appropriate copy
6. **Neither available, no reason** → show "S/R analysis unavailable"

The `unavailableReason` drives different user-facing copy:

```typescript
// packages/ui/src/components/SrInsightsSection.tsx
function unavailableCopy(reason: SrThesesUnavailableReason | null | undefined) {
  if (reason === 'not-found') return 'No S/R analysis available yet';
  if (reason === 'config-error' || reason === 'upstream-error') return 'S/R analysis unavailable';
  return null;
}
```

The key insight: when v1 data exists, the unavailable copy is suppressed even if v2 failed. The v1 card already gives the user useful information.

### 7. Public surface discipline: DTOs exported, ports internal

The `@clmm/application/public` barrel exports DTOs that the UI and app layers need:

```typescript
// packages/application/src/public/index.ts (conceptual)
export type { SrThesisDto, SrThesesBlock } from '../dto/index.js';
```

Port types (`SrThesesReadPort`, `SrThesesReadResult`) are NOT on the public surface. Only adapters import them from `@clmm/application` internals:

```typescript
// packages/adapters/src/outbound/regime-engine/CurrentSrThesesAdapter.ts
import type {
  SrThesesReadPort,
  SrThesesReadResult,
  SrThesisDto,
  SrThesesBlock,
} from '@clmm/application';
```

This enforces that UI and app layers never depend on port contracts — they only consume DTOs. Ports are implementation contracts between application and adapters, not part of the public API.

**Rule: When adding a v2 path, put DTOs on `@clmm/application/public`. Keep ports off the public surface. UI imports from `@clmm/application/public`; adapters import from `@clmm/application`.**

### 8. v2 parses directly into application DTOs — no structural duplication needed

v1 required structural duplication of `SrLevel`/`SrLevelsBlock` between `packages/adapters` and `packages/application` with drift guard comments because the adapter parsed into its own local types first.

v2 avoids this: `CurrentSrThesesAdapter.parseBlock()` returns `SrThesesBlock | null` directly, importing the DTO types from `@clmm/application`. Since the adapter already depends on `@clmm/application` (for port types), there is no dependency rule violation in also importing DTOs.

```typescript
// packages/adapters/src/outbound/regime-engine/CurrentSrThesesAdapter.ts
import type {
  SrThesesReadPort,
  SrThesesReadResult,
  SrThesisDto,
  SrThesesBlock,
} from '@clmm/application';

function parseThesis(raw: unknown): SrThesisDto | null {
  // ...validates and returns the application DTO directly
}

function parseBlock(data: unknown): SrThesesBlock | null {
  // ...validates and returns the application DTO directly
}
```

**Rule: If the adapter already imports from `@clmm/application` for port compliance, parse directly into application DTOs. Structural duplication is only needed when the adapter must not depend on application types (which is rare with port-based architecture).**

### 9. View model patterns: pure functions, freshness, recency sort, progressive reveal

The v2 view model follows established patterns:

- **Pure functions**: `buildSrThesesViewModel(block, now)` takes a DTO block and a clock value. No domain types leak.
- **Freshness with 48h stale threshold**: `computeFreshness` shows "Xm ago" under 1h, "Xh ago" under 48h, "Xh ago · stale" after.
- **Recency sort on timestamps**: Uses `publishedAt > collectedAt` with unparseable timestamps sorted last.
- **Progressive reveal**: `DEFAULT_VISIBLE_COUNT = 3` cards shown initially, "Show more" for remaining.

```typescript
// packages/ui/src/view-models/SrThesesViewModel.ts
export function buildSrThesesViewModel(block: SrThesesBlock, now: number): SrThesesViewModel {
  const { freshnessLabel, isStale } = computeFreshness(block.capturedAtUnixMs, now);

  type Ranked = { thesis: SrThesisDto; tsMs: number; unparseable: boolean };
  const ranked: Ranked[] = block.theses.map((t) => ({
    thesis: t,
    tsMs: recencyTimestampMs(t, block.capturedAtUnixMs),
    unparseable: isUnparseable(t),
  }));

  ranked.sort((a, b) => {
    if (a.unparseable !== b.unparseable) return a.unparseable ? 1 : -1;
    return b.tsMs - a.tsMs;
  });

  const sortedTheses = ranked.map((r) => r.thesis);
  const cards = sortedTheses.map((t) => buildCard(t, block.capturedAtIso));
  const visibleCards = cards.slice(0, DEFAULT_VISIBLE_COUNT);
  const remainingCount = Math.max(0, cards.length - DEFAULT_VISIBLE_COUNT);
  // ...
}
```

**Rule: View models must be pure functions. No domain types. Timestamps sorted by recency with unparseable last. Progressive reveal for long lists. Freshness thresholds make stale data observable.**

### 10. TanStack Query wiring: per-path stale time, no retry on unsupported pools

Each parallel path gets its own query with independent state:

```typescript
// apps/app/app/(tabs)/positions.tsx
const srThesesQuery = useQuery({
  queryKey: ['sr-theses-current', poolId],
  queryFn: () => fetchCurrentSrTheses(poolId!),
  enabled: poolId != null,
  staleTime: SR_THESES_STALE_TIME_MS, // 5 minutes
  refetchOnWindowFocus: false,
  refetchOnMount: true,
  retry: (failureCount, error) =>
    !(error instanceof SrThesesUnsupportedPoolError) && failureCount < 1,
  retryDelay: 1000,
});
```

The `retry` function excludes `SrThesesUnsupportedPoolError` — there is no point retrying a pool that the BFF has already classified as unsupported. This mirrors the same pattern used for v1 `SrLevelsUnsupportedPoolError` and `RegimeUnsupportedPoolError`.

Error classification flows through:

```typescript
const srThesesUnsupported = srThesesQuery.error instanceof SrThesesUnsupportedPoolError;
const srThesesError = srThesesQuery.isError && !srThesesUnsupported;
```

**Rule: Each parallel data path gets its own `useQuery`. Use `retry` function to skip retries for unrecoverable error classes. Pass both `data` and `unavailableReason` to the UI so the orchestrator can distinguish "no data yet" from "data not available".**

## Why This Matters

- **Parallel paths prevent regressions**: If v2 is down or absent, v1 still works. The orchestrator cleanly falls back. No migration window risk.
- **Discriminated unions prevent silent failures**: v1's `null` collapsed not-found, config-error, and upstream-error into one value. v2's `SrThesesReadResult` makes each failure mode explicit and type-safe. The controller, app client, and UI can each react appropriately.
- **Open string fields prevent breakage on schema evolution**: If `bias` were typed as `'bullish' | 'bearish' | 'neutral'`, adding `'mildly-constructive'` upstream would crash the TypeScript build or silently drop data. `string | null` with known-value sets in the view model handles both known and unknown values gracefully.
- **Public surface discipline prevents coupling leaks**: UI and app only import DTOs. Ports stay internal. This means the adapter contract can evolve without touching UI code.
- **Direct DTO parsing eliminates drift risk**: v1 needed structural duplication with drift guard comments. v2 parses into application DTOs directly. Fewer copies, fewer drift risks, fewer parity tests to maintain.
- **v2-first fallback makes migration observable**: When v2 is available, users see richer data. When v2 fails, the fallback is seamless. The transition is gradual and reversible — no flag-day cutover.
- **Adapter retry discipline prevents thundering retries**: One retry on transient failures (5xx, timeout, network). No retry on client errors (400, 404). After one failed retry, return `upstream-error` — the UI shows appropriate copy rather than spinning forever.
- **Per-path TanStack Query keeps failure domains isolated**: v2 transport errors don't affect v1 query state. Each path retries independently. Unsupported pool errors skip retry entirely.

## When to Apply

- Adding any new v2 data path alongside an existing v1 path in a clean-architecture BFF
- Designing discriminated union result types for adapter→BFF→app→UI error propagation
- Choosing between open string fields and literal unions for fields that come from external services
- Building a v2-first with v1-fallback UI orchestrator that degrades gracefully
- Deciding what belongs on the application public surface (DTOs) vs internal ports
- Wiring TanStack Query for parallel data fetches with per-path error classification and retry policies
- Building view models that handle freshness, recency sorting, and progressive reveal from structured thesis data
- Eliminating structural duplication between adapter and application layers when using port-based architecture

## Examples

### Discriminated union port result type

```typescript
// packages/application/src/ports/index.ts
export type SrThesesReadResult =
  | { kind: 'block'; block: SrThesesBlock }
  | { kind: 'not-found' }
  | { kind: 'config-error' }
  | { kind: 'upstream-error' };

export interface SrThesesReadPort {
  fetchCurrent(symbol: string, source: string): Promise<SrThesesReadResult>;
}
```

### Adapter retry with internal AttemptOutcome collapsing to port result

```typescript
// packages/adapters/src/outbound/regime-engine/CurrentSrThesesAdapter.ts
type AttemptOutcome =
  | { kind: 'block'; block: SrThesesBlock }
  | { kind: 'not-found' }
  | { kind: 'config-error' }
  | { kind: 'retryable'; reason: string }
  | { kind: 'upstream-fatal'; reason: string };

export class CurrentSrThesesAdapter implements SrThesesReadPort {
  constructor(
    private readonly baseUrl: string | null,
    private readonly observability: ObservabilityPort,
  ) {}

  async fetchCurrent(symbol: string, source: string): Promise<SrThesesReadResult> {
    if (!this.baseUrl) return { kind: 'config-error' };
    // ...
    const first = await this.attempt(url);
    if (first.kind !== 'retryable') return this.toResult(first);
    await delay(RETRY_DELAY_MS);
    const second = await this.attempt(url);
    if (second.kind === 'retryable') return { kind: 'upstream-error' };
    return this.toResult(second);
  }

  private toResult(outcome: AttemptOutcome): SrThesesReadResult {
    switch (outcome.kind) {
      case 'block':
        return { kind: 'block', block: outcome.block };
      case 'not-found':
        return { kind: 'not-found' };
      case 'config-error':
        return { kind: 'config-error' };
      case 'retryable':
      case 'upstream-fatal':
        return { kind: 'upstream-error' };
    }
  }
}
```

### BFF controller mapping result kinds to HTTP envelope

```typescript
// packages/adapters/src/inbound/http/SrThesesController.ts
@Controller('sr-theses')
export class SrThesesController {
  @Get('pools/:poolId/current')
  async getCurrent(@Param('poolId') poolId: string) {
    const entry = this.srThesesAllowlist.get(poolId);
    if (!entry) throw new NotFoundException(`Pool not supported: ${poolId}`);
    const result = await this.srThesesPort.fetchCurrent(entry.symbol, entry.source);
    return this.mapResult(result);
  }

  private mapResult(result: SrThesesReadResult) {
    switch (result.kind) {
      case 'block':
        return { srTheses: result.block };
      case 'not-found':
        return { srTheses: null, unavailableReason: 'not-found' as const };
      case 'config-error':
        return { srTheses: null, unavailableReason: 'config-error' as const };
      case 'upstream-error':
        return { srTheses: null, unavailableReason: 'upstream-error' as const };
    }
  }
}
```

### App client: BFF envelope → typed response with unavailable reason

```typescript
// apps/app/src/api/srTheses.ts
export type SrThesesUnavailableReason = 'not-found' | 'config-error' | 'upstream-error';
export type SrThesesResponse = {
  srTheses: SrThesesBlock | null;
  unavailableReason?: SrThesesUnavailableReason;
};

export async function fetchCurrentSrTheses(poolId: string): Promise<SrThesesResponse> {
  // ...fetch from BFF, validate response shape...
  const srTheses = body['srTheses'];
  const unavailableReason = isUnavailableReason(body['unavailableReason'])
    ? body['unavailableReason']
    : undefined;
  if (srTheses === null) return { srTheses: null, unavailableReason };
  if (!isSrThesesBlock(srTheses)) throw new Error('malformed srTheses block');
  return { srTheses, unavailableReason };
}
```

### v2-first with v1-fallback UI orchestrator

```typescript
// packages/ui/src/components/SrInsightsSection.tsx
export function SrInsightsSection({ srLevels, srTheses, srThesesUnavailableReason, ... }) {
  // v2 available → render v2
  if (srTheses != null && srTheses.theses.length > 0) {
    const vm = buildSrThesesViewModel(srTheses, now);
    return <SrThesesPanel vm={vm} />;
  }

  // v2 loading, no v1 → skeleton
  if (srThesesLoading && srTheses == null && srLevels == null && !isLoading) {
    return <ActivityIndicator />;
  }

  // v1 available → render v1 (fallback)
  if (srLevels != null) {
    const vm = buildSrLevelsViewModelBlock(srLevels, now);
    return <SrLevelsCard srLevels={vm} />;
  }

  // v2 has unavailable reason, no v1 → show appropriate copy
  const v2Copy = unavailableCopy(srThesesUnavailableReason);
  if (v2Copy != null) return <Text>{v2Copy}</Text>;

  // Neither available
  return <Text>S/R analysis unavailable</Text>;
}
```

### Open string fields with known-value mapping in view model

```typescript
// packages/ui/src/view-models/SrThesesViewModel.ts
export type SrThesisBiasTone = 'safe' | 'breach' | 'warn' | 'neutral';

const KNOWN_BULLISH = new Set(['bull', 'bullish', 'long']);
const KNOWN_BEARISH = new Set(['bear', 'bearish', 'short']);
const KNOWN_NEUTRAL_WARN = new Set(['range', 'neutral', 'chop', 'choppy']);

function biasToneOf(bias: string | null): SrThesisBiasTone {
  if (bias == null) return 'neutral';
  const key = bias.toLowerCase().trim();
  if (KNOWN_BULLISH.has(key)) return 'safe';
  if (KNOWN_BEARISH.has(key)) return 'breach';
  if (KNOWN_NEUTRAL_WARN.has(key)) return 'warn';
  return 'neutral'; // unknown bias → neutral tone, not crash
}
```

### TanStack Query with unsupported-pool retry exclusion

```typescript
// apps/app/app/(tabs)/positions.tsx
const srThesesQuery = useQuery({
  queryKey: ['sr-theses-current', poolId],
  queryFn: () => fetchCurrentSrTheses(poolId!),
  enabled: poolId != null,
  staleTime: SR_THESES_STALE_TIME_MS,
  refetchOnWindowFocus: false,
  refetchOnMount: true,
  retry: (failureCount, error) =>
    !(error instanceof SrThesesUnsupportedPoolError) && failureCount < 1,
  retryDelay: 1000,
});
```

### Public surface test proving open string fields compile

```typescript
// packages/application/src/public/srTheses.exports.test.ts
it('keeps bias, setupType, and sourceReliability open as string | null', () => {
  const thesis: SrThesisDto = {
    bias: 'mildly-constructive-but-cautious', // not in any known list
    setupType: 'distribution-into-vwap', // not in any known list
    sourceReliability: 'tier-experimental-2026', // not in any known list
    // ...
  };
  expect(thesis.bias).toBe('mildly-constructive-but-cautious');
});
```

## Related

- [Read-only data API with discriminated unions in a clean-architecture BFF](./read-only-data-api-discriminated-unions-bff-2026-05-01.md) — v1 S/R levels discriminated union pattern; this document extends it to the v2 theses path (high overlap — 4/5 dimensions)
- [Exhaustive switch with runtime fallback for typed unions in view models](./exhaustive-switch-runtime-guard-view-model-unions-2026-05-05.md) — complements the open-string approach here: closed unions use exhaustive switch, open strings use known-value sets with fallback
- [Enriching DTOs across clean-architecture layers](./enriching-dtos-across-layers-2026-04-25.md) — the general DTO enrichment pattern used by v1; v2 parses directly into DTOs instead
- [S/R position-to-pool extraction](./sr-levels-position-to-pool-extraction-2026-04-27.md) — the v1 extraction that moved S/R out of per-position endpoints (high overlap — 4/5 dimensions)
- [S/R levels card redesign](../design-patterns/sr-levels-card-redesign-2026-04-26.md) — v1 `parseNotes` pattern superseded by v2's structured fields (moderate overlap — 3/5 dimensions)
- GitHub #65 — v2 S/R theses feature request and spec
- GitHub #63 — v1 regime integration that established SrInsightsSection
- GitHub #50 — original pool-scoped BFF extraction pattern

---
title: "Outbound adapter pattern: fire-and-forget with dual-seam DI wiring"
date: 2026-04-19
category: best-practices
module: adapters/outbound/regime-engine
problem_type: best_practice
component: service_object
severity: medium
applies_when:
  - Integrating a backend with an external analytics or event-ingestion service
  - Wiring fire-and-forget side effects at multiple orchestration seams
  - Extending DTOs across package boundaries without leaking adapter types
  - Conditionally enriching responses for specific resource subsets
related_components:
  - background_job
tags:
  - fire-and-forget
  - outbound-adapter
  - di-wiring
  - boundary-safe-dto
  - pool-allowlist
  - dual-seam
  - nestjs
  - integration-pattern
---

# Outbound adapter pattern: fire-and-forget with dual-seam DI wiring

## Context

CLMM V2 integrated with an external regime-engine service for two purposes: (1) posting terminal execution events (confirmed/failed) so the analytics pipeline can consume them, and (2) reading current support/resistance levels to enrich the position detail screen. The regime-engine is an external HTTP service that may be unavailable in some environments (no env vars configured). The integration had to be non-blocking, resilient to transient failures, boundary-clean (no adapter types leaking into application/domain), and selective (SR levels only for certain pools).

This doc captures the reusable patterns from that integration: fire-and-forget write adapters with retry, null-on-failure read adapters, dual-seam DI wiring, boundary-safe DTO extension, pool allowlists for selective enrichment, and freshness computation.

**Source plan:** `docs/plans/2026-04-19-001-feat-regime-engine-outbound-integration-plan.md`

## Guidance

### 1. Fire-and-forget outbound adapter with retry + no-op fallback

The adapter must never block the caller, never throw, and degrade gracefully when the external service is unavailable.

**Key properties:**
- **No-op when unconfigured:** If `baseUrl` or `internalToken` is null, log once and return. Safe to wire in all environments without feature flags.
- **`void` keyword at call sites:** The caller uses `void this.port.notifyExecutionEvent(event)` — the promise is intentionally discarded so HTTP latency never blocks the response or job handler.
- **Retry with exponential backoff:** Only for 5xx and network errors. 4xx responses are terminal (except 409 = idempotent success from server dedup).
- **Never throws:** All paths resolve. Errors are logged but never propagated.

```typescript
async notifyExecutionEvent(event: ClmmExecutionEventRequest): Promise<void> {
  if (!this.baseUrl || !this.internalToken) {
    if (!this.disabledLogged) {
      this.observability.log('info', 'RegimeEngine event adapter: disabled');
      this.disabledLogged = true;
    }
    return;
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(event), signal });
      if (res.ok) return;
      if (res.status === 409) return; // idempotent dedup
      if (res.status >= 400 && res.status < 500) return; // terminal client error
      // 5xx: retry with backoff
    } catch (err) {
      // network error: retry with backoff
    }
  }
  // final failure: log and resolve (never throw)
}
```

### 2. Dual-seam DI wiring

When a side effect must fire from both an HTTP controller and a background job handler, inject the same port via DI at both sites. Use the same terminal-state gate at both seams.

```typescript
// Seam 1: ExecutionController.submitExecution (inline fast path)
if (reconciliation.finalState.kind === 'confirmed' || reconciliation.finalState.kind === 'failed') {
  const event = buildClmmExecutionEvent(savedAttempt, reconciliation.finalState.kind, this.clock);
  void this.regimeEngineEventPort.notifyExecutionEvent(event);
}

// Seam 2: ReconciliationJobHandler.handle (worker path)
if (result.kind === 'confirmed' || result.kind === 'failed') {
  const updatedAttempt = await this.executionRepo.getAttempt(data.attemptId);
  if (updatedAttempt) {
    const event = buildClmmExecutionEvent(updatedAttempt, result.kind, this.clock);
    void this.regimeEngineEventPort.notifyExecutionEvent(event);
  }
}
```

The job handler re-reads the attempt from storage to get the latest `transactionReferences` after reconciliation wrote them.

**DI wiring across two composition modules:**

```typescript
// Both tokens.ts files export the same token string
export const REGIME_ENGINE_EVENT_PORT = 'REGIME_ENGINE_EVENT_PORT';

// AdaptersModule.ts (shared by workers/jobs)
const regimeEngineEventAdapter = new RegimeEngineExecutionEventAdapter(baseUrl, token, telemetry);
// → { provide: REGIME_ENGINE_EVENT_PORT, useValue: regimeEngineEventAdapter }

// AppModule.ts (HTTP app DI graph)
// → same construction, same provider token
```

### 3. Boundary-safe DTO extension

When enriching a response DTO with data from an adapter, define the type independently in the application layer — do not import adapter types into `packages/application`.

```typescript
// packages/application/src/dto/index.ts — application layer owns this type
export type SrLevelsBlock = {
  briefId: string;
  sourceRecordedAtIso: string | null;
  summary: string | null;
  capturedAtUnixMs: number;
  supports: SrLevel[];
  resistances: SrLevel[];
};

export type PositionDetailDto = PositionSummaryDto & {
  // ...existing fields...
  srLevels?: SrLevelsBlock;
};
```

The adapter has its own `SrLevelsBlock` type with the same shape. TypeScript structural typing makes them assignable without explicit imports across boundaries. This keeps the `boundaries` check green.

### 4. Pool allowlist for selective enrichment

Not all pools have external data. Use a DI-injected `Map<PoolId, {symbol, source}>` to control which pools trigger the enrichment call. Non-allowlisted pools skip the fetch entirely.

```typescript
const allowlistEntry = this.srLevelsAllowlist.get(result.position.poolId);

if (allowlistEntry) {
  const [triggerResult, srResult] = await Promise.all([
    this.triggerRepo.listActionableTriggers(wallet).then(
      (triggers) => ({ ok: true as const, triggers }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
    this.srLevelsPort.fetchCurrent(allowlistEntry.symbol, allowlistEntry.source),
  ]);
  // merge srResult into response if non-null
}
```

The allowlist is an empty `Map` by default, populated at DI composition time. No dynamic pool registry needed.

### 5. Null-on-failure read adapter with no retry

For read paths that feed UI, stale-or-empty is better than slow. No retry; one attempt with a short timeout.

```typescript
async fetchCurrent(symbol: string, source: string): Promise<SrLevelsBlock | null> {
  if (!this.baseUrl) { /* log once, return null */ return null; }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000); // 2s hard timeout
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.status === 404) return null;
    if (!res.ok) { /* log warn */ return null; }
    // parse, validate shape, sort, return block
  } catch (error: unknown) {
    // log warn, return null — never throw
    return null;
  }
}
```

### 6. Permissive-drop parsing at the app shell

The Expo app shell validates responses with runtime type guards. Malformed enrichment fields are silently dropped; the base DTO is always preserved.

```typescript
const srLevels = value['srLevels'];
if (srLevels == null) {
  delete value['srLevels'];
} else if (!isSrLevelsBlock(srLevels)) {
  delete value['srLevels']; // malformed → drop silently
}
```

### 7. Freshness computation with stale threshold

Compute staleness at the ViewModel layer using `capturedAtUnixMs` and an injectable `now`:

```typescript
const ageMs = now - capturedAtUnixMs;
if (ageMs < 3600000) {
  return { freshnessLabel: `captured ${Math.max(1, Math.round(ageMs / 60000))}m ago`, isStale: false };
}
const hours = Math.round(ageMs / 3600000);
if (ageMs < 172800000) {
  return { freshnessLabel: `captured ${hours}h ago`, isStale: false };
}
return { freshnessLabel: `captured ${hours}h ago · stale`, isStale: true };
```

Thresholds: `<1h` → minutes, `1h-48h` → hours, `>=48h` → hours + stale flag for amber badge rendering.

## Why This Matters

- **Fire-and-forget with no-op fallback** means the adapter is safe to wire in every environment (dev, staging, prod) without feature flags. Missing env vars = silent disable, not crashes.
- **Dual-seam wiring** ensures events are posted regardless of whether execution completes synchronously (controller path) or asynchronously (reconciliation job). Each seam is independently correct. Server-side idempotency (correlation_id UNIQUE) absorbs duplicate posts from both seams firing for the same attempt.
- **Boundary-safe types** prevent adapter concerns from leaking into the application layer. This is the difference between a clean hexagonal boundary and a gradual coupling slide.
- **Pool allowlist** avoids unnecessary HTTP calls for pools that have no external data, and makes the feature easy to expand pool-by-pool without code changes.
- **Permissive-drop parsing** ensures the mobile app never crashes on a malformed enrichment field. The base position data is always displayed.

## When to Apply

- Integrating with an external HTTP service where the call must not block the primary flow
- Wiring the same side effect at multiple orchestration points (controller + job handler)
- Extending response DTOs with data from adapters while respecting package boundaries (`pnpm boundaries` must stay green)
- Selectively enriching responses based on resource identity (pool ID, org ID, etc.)
- Building resilience into outbound HTTP calls with retry, timeout, and graceful degradation
- Computing freshness of external data for UI display with staleness thresholds

## Related

- `docs/plans/2026-04-19-001-feat-regime-engine-outbound-integration-plan.md` — implementation plan for this integration
- `docs/plans/2026-04-17-002-opus-clmm-regime-engine-integration-plan.md` — origin plan covering all 6 units
- `docs/solutions/database-issues/notification-events-migration-and-deliveredat-fix-2026-04-14.md` — shared pattern of adapter-returned data as authoritative, DI wiring with matching infra
- `docs/solutions/logic-errors/transaction-reference-step-projection-2026-04-14.md` — same dual seams (ExecutionController + ReconciliationJobHandler) for step projection
- `docs/adapter-rules.md` — boundary rules that shaped the DTO-extension approach

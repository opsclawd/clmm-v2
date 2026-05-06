---
title: Regime feature review logic errors — URL crash, degraded banner, type guard, severity sort
date: 2026-05-05
category: logic-errors
module: regime-market-context
problem_type: logic_error
component: service_object
symptoms:
  - CurrentRegimeAdapter crashes with TypeError on malformed baseUrl (non-null invalid URL)
  - RegimeSection shows no degraded banner when isError=true with cached regime data
  - No test coverage for regime API client (apps/app/src/api/regime.ts)
  - isRecord type guard accepts arrays, leaking Array into Record<string, unknown> code paths
  - marketReasonSummary displays reasons in arbitrary upstream order, burying high-severity items
root_cause: missing_validation
resolution_type: code_fix
severity: medium
related_components:
  - frontend_stimulus
  - testing_framework
tags:
  - regime
  - type-guard
  - isrecord
  - adapter
  - malformed-url
  - degraded-state
  - severity-sort
  - array-isarray
---

# Regime feature review logic errors

## Problem

Five independent logic errors in the regime market context feature. A malformed `baseUrl` crashed the adapter, the UI silently served stale data on refresh failure, the API client had no tests, an `isRecord` guard leaked arrays, and market reasons displayed in arbitrary order rather than by severity.

## Symptoms

- `TypeError` crash when `CurrentRegimeAdapter` received a malformed `baseUrl` (e.g., whitespace or non-URL string from env config)
- After a refresh failure with cached regime data, the UI showed no indication that displayed data was stale
- `apps/app/src/api/regime.ts` had zero test coverage
- `isRecord([1,2])` returned `true`, allowing arrays to pass object-type guards
- `marketReasonSummary` displayed reasons in arbitrary upstream order, so ERROR items could appear after INFO items

## What Didn't Work

- Removing the `RegimeFeedConfig.ts` pass-through resolver was considered during review to simplify the config layer, but was deemed not worth the risk of breaking existing wiring mid-feature and was left in place.

## Solution

**1. CurrentRegimeAdapter malformed baseUrl** — Wrapped `new URL(...)` in try/catch; returns `{ kind: 'config-error' }` on failure:

```ts
let url: URL;
try {
  url = new URL(`${this.baseUrl.replace(/\/+$/, '')}/v1/regime/current`);
} catch {
  this.observability.log('warn', 'Regime base URL is malformed', { baseUrl: this.baseUrl });
  return { kind: 'config-error' };
}
```

**2. RegimeSection degraded indicator** — Added derived flag and conditional warning text:

```ts
const showDegraded = isError && !isUnsupported;
// in JSX:
{showDegraded ? (
  <Text style={{ color: colors.warn, fontSize: typography.fontSize.xs, marginTop: 4 }}>
    Refresh failed — showing last available analysis.
  </Text>
) : null}
```

**3. API client tests** — Created `apps/app/src/api/regime.test.ts` with 5 tests: 200 happy path, 404 → `RegimeUnsupportedPoolError`, `unavailableReason` mapping, malformed body rejection, `isRegimeUnsupportedPoolError` narrowing.

**4. isRecord array leak** — Added `Array.isArray` exclusion to match adapter guard:

```ts
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}
```

**5. Severity-ordered market reasons** — Added severity sort before joining:

```ts
const SEVERITY_ORDER: Record<RegimeReasonSeverity, number> = { ERROR: 0, WARN: 1, INFO: 2 };

[...block.marketReasons]
  .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))
  .map((r) => r.text)
  .join('; ');
```

## Why This Works

1. `new URL()` throws `TypeError` on invalid input — it is not a safe constructor. Try/catch at the adapter boundary prevents the crash from propagating and surfaces it as a typed config-error result.
2. The UI had `isError` and `isUnsupported` flags but no combined truth for partial degradation. The derived `showDegraded` flag closes the logic gap: cache displayed (regime not null), refresh failed (isError), but it's not a full unsupported state.
3. The API client sits at the shell boundary with no type-level enforcement from the domain; without tests, regressions in error mapping or response parsing go undetected.
4. `typeof [] === 'object'` is a well-known JavaScript quirk. `Array.isArray` is the canonical runtime guard; both the adapter and app-layer `isRecord` must agree.
5. Upstream order is not guaranteed to reflect severity importance. Explicit sort with `SEVERITY_ORDER` ensures ERROR reasons always surface first; spread into a new array preserves the original and source-order tie-break within same severity.

## Prevention

- **URL construction must be guarded at adapter boundaries**: Any external input used as a URL (env vars, config strings) must be wrapped in try/catch or validated before `new URL()`. Never assume non-null implies valid.
- **Enumerate all boolean flag combinations in UI tests**: When a component has multiple boolean flags (isError, isUnsupported, isLoading, hasCache), test every reachable combination, not just the obvious paths.
- **Require tests for new API client files**: Any new file in `apps/app/src/api/` must ship with a corresponding test covering happy path, every mapped error type, and invalid-input rejection.
- **Align isRecord across layers**: Duplicated `isRecord` helpers must include `!Array.isArray(value)`. Consider centralizing in a shared utility to prevent drift between adapter and app layers.
- **Never trust upstream ordering for user-facing data**: When display order affects user decisions (severity, priority, impact), add an explicit sort with a defined ordering map. Relying on insertion order is hidden coupling.

## Related Issues

- GitHub #63 — parent feature issue for regime market context
- `docs/solutions/best-practices/exhaustive-switch-runtime-guard-view-model-unions-2026-05-05.md` — covers exhaustive-switch type guards; finding #4 extends this to object-vs-array discrimination
- `docs/solutions/best-practices/outbound-adapter-fire-and-forget-dual-seam-pattern-2026-04-19.md` — covers null-on-failure adapter pattern; finding #1 adds malformed-URL validation beyond null check

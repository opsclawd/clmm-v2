---
title: 'Regime card contract refresh: breaking DTO propagation across layers'
date: 2026-05-08
last_updated: 2026-05-08
category: best-practices
module: packages/domain, packages/application, packages/adapters, packages/ui
problem_type: best_practice
component: development_workflow
severity: high
applies_when:
  - 'Replacing a DTO shape that breaks across all architectural layers in one PR'
  - 'Using subagent-driven development for multi-task plans with independent steps'
  - 'Ensuring view model is sole interpretation owner after a contract change'
  - 'Running coherence sweeps for removed fields that exist in multiple DTOs'
  - 'Validating paired ISO + Unix-ms timestamp fields at adapter boundaries'
  - 'Rejecting old-shape upstream payloads by key presence'
  - 'Enforcing semantic ordering constraints for open/close window timestamps'
related_components:
  - packages/application/src/dto/regime.ts
  - packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts
  - apps/app/src/api/regime.ts
  - packages/ui/src/view-models/RegimeViewModel.ts
  - packages/ui/src/components/RegimeSection.tsx
tags:
  - breaking-dto-change
  - red-state-tdd
  - two-stage-review
  - view-model-ownership
  - coherence-sweep
  - subagent-development
  - regime-card
  - iso-parity-validation
  - old-shape-rejection
  - timestamp-window-contract
  - deterministic-clock-formatting
---

# Regime Card Contract Refresh: Breaking DTO Propagation Across Layers

## Context

The `RegimeBlock` DTO in a Solana CLMM LP exit assistant had flat top-level fields (`trendStrength`, `volRatio`, `capturedAtUnixMs`) and a simple freshness model (`freshness: { capturedAtUnixMs, softStale, hardStale }`). The upstream `regime-engine` service expanded its response to include nested telemetry, two-clock freshness with explicit stale thresholds, and expanded provenance metadata. The DTO needed a breaking replacement — not a parallel v2 path, but an in-place swap across every layer.

The 14-task plan used subagent-driven development. For tasks 1–9, the two-stage review (spec compliance → code quality) was skipped. For tasks 10–11, both stages were applied. The skipped reviews allowed subtle drift to accumulate; the applied reviews caught no further issues.

## Guidance

### 1. Red-state TDD for breaking contract changes across layers

When a DTO shape breaks across layers, write failing tests against the _new_ contract before any implementation changes. Commit the red state, then make it green.

**Sequence per layer:**

1. **Application DTO**: Update type definitions, write compile-time `expectTypeOf` tests proving the new shape. Red state = type errors until dependent code updates.
2. **Adapter**: Write parser tests against the new upstream JSON shape. They fail until the parser is rewritten.
3. **App client validators**: Write rejection tests for old shape. They fail until validators are updated.
4. **View model**: Write tests expecting new VM properties (labels, tones, rows). They fail until the VM is rebuilt.
5. **Component**: Write rendering tests expecting new VM output. They fail until the component is rewritten.

```ts
// RED: test updated to read nested field, domain type not yet changed
it('exposes volRatio in telemetry', () => {
  expect(block.telemetry.volRatio).toBe(1.06);
  // TypeScript error: Property 'telemetry' does not exist on type 'RegimeBlock'
});

// GREEN: domain type updated, adapter outputting nested shape
type RegimeBlock = {
  regime: 'UP' | 'DOWN' | 'CHOP';
  telemetry: { realizedVolShort; realizedVolLong; volRatio; trendStrength; compression };
  // ...
};
```

This prevents the failure mode where adapter and UI "meet in the middle" with different interpretations of the new shape, producing subtle mismatches that surface only at integration.

### 2. Two-stage review per task in subagent-driven development

Each task in a subagent plan needs two review gates before marking done:

**Stage 1 — Spec Compliance Review**: Does the implementation match the task's specification? Verify field names, types, required/optional status, and behavioral contracts. A spec reviewer reading the actual code catches when an implementer claims `telemetry.volRatio` but the code still reads `volRatio` at the top level.

**Stage 2 — Code Quality Review**: Does the implementation follow project conventions, boundary rules, naming patterns? Check that removed fields aren't ghosted (replaced with `any`, commented out, or stubbed).

Without both stages, tasks 1–9 accumulated drift: stale field references remained as dead code, and a VM property was re-derived instead of using the ViewModel. Tasks 10–11, which used both stages, had none of these issues.

```
Per-task workflow:
Implementer → Spec Review → (fix if needed → re-review) → Code Quality Review → (fix if needed → re-review) → Mark Done
```

### 3. ViewModel as sole interpretation owner

When a contract change requires new display logic (labels, tones, sorting, dedup, classification), centralize ALL derived values in the ViewModel. No component or adapter should re-derive any display property.

```ts
// WRONG: component re-derives tone from raw data
const tone = block.freshness.softStale ? 'warn' : 'success';

// RIGHT: component reads tone from ViewModel
<Text style={{ color: toneColor(vm.suitabilityTone) }}>
  {vm.suitabilityLabel} · data {vm.dataQualityLabel.toLowerCase()}
</Text>
```

The ViewModel owns: label text, tone/color mapping, sort order, deduplication of stale-category reasons, freshness classification, and the decision about which fields to display. Components are thin renderers — they receive `DetailRows[]` and render them.

This matters because re-derivation diverges over time. The 48-hour local stale rule was baked into components and the VM. When the rule was replaced with upstream `softStale`/`hardStale` flags, only the VM was updated — any component-level copies would still use the old rule.

### 4. Coherence sweep with out-of-scope filtering

When removing or renaming a field that exists in multiple DTOs, do a grep sweep but apply a strict scope filter:

1. **Grep** the removed field name across the entire repo.
2. **Classify** each hit as in-scope (regime-path files) or out-of-scope (other DTOs like policyInsights, srTheses, srLevels).
3. **Act** only on in-scope hits. Out-of-scope hits are expected and must not be changed.

```bash
# Sweep for removed field
git grep -nE "capturedAtUnixMs|\.trendStrength\b|\.volRatio\b" packages apps

# Results include:
# packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts  ← IN SCOPE (verify removed)
# packages/adapters/src/inbound/http/PolicyInsightsController.test.ts  ← OUT OF SCOPE (skip)
# packages/ui/src/view-models/SrThesesViewModel.ts                     ← OUT OF SCOPE (skip)
```

Without this filter, the sweep produces false positives and you either (a) break unrelated DTOs by removing their valid fields, or (b) become overwhelmed and skip the sweep entirely, leaving stale references in the in-scope files.

Note: The same field name at different nesting levels (e.g., `volRatio` vs `telemetry.volRatio`) requires different treatment. The coherence sweep must distinguish top-level references (removed) from nested references (preserved).

### 5. Paired ISO + Unix-ms timestamp fields with parity validation

When a contract carries timestamps across trust boundaries, represent each instant as paired `*_Iso` (ISO 8601) and `*_UnixMs` (number) fields. Validate parity at the adapter boundary: the ISO string must parse to the same instant as the ms value.

```ts
// Adapter validates: generatedAtIso must round-trip to generatedAtUnixMs
const ms = Date.parse(freshness.generatedAtIso);
if (ms !== freshness.generatedAtUnixMs) {
  return upstreamError('generatedAtIso/UnixMs parity violation');
}
```

This catches upstream data corruption where one field is wrong but the other is right — a single-field representation cannot detect this class of error.

The same pattern applies to `lastCandleOpenIso`/`lastCandleOpenUnixMs` and `lastCandleCloseIso`/`lastCandleCloseUnixMs`.

### 6. Old-shape rejection by key presence

When replacing an upstream contract, reject legacy payloads by detecting old-shape keys rather than trying to migrate them. Old payloads contain `lastCandleIso` or `lastCandleUnixMs`; new payloads must not.

```ts
if (
  Object.prototype.hasOwnProperty.call(raw, 'lastCandleIso') ||
  Object.prototype.hasOwnProperty.call(raw, 'lastCandleUnixMs')
) {
  return upstreamError('legacy freshness shape detected; modern shape required');
}
```

This prevents silent misinterpretation — an old payload treated as new would have undefined open/close fields, producing incorrect staleness calculations. Note: `undefined`-valued keys are NOT tested because `JSON.stringify` strips them; only present keys (`''`, `0`, `null`, or valid values) trigger rejection.

### 7. Strict ISO 8601 format validation

Enforce strict ISO 8601 format for upstream ISO strings. Accept only `YYYY-MM-DDTHH:MM:SSZ` — reject offset formats (`+00:00`), loose formats (`May 9 2026`), and fractional seconds.

```ts
const STRICT_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
function isStrictIso(s: string): boolean {
  return STRICT_ISO.test(s) && !Number.isNaN(Date.parse(s));
}
```

Both the adapter (`CurrentRegimeAdapter.ts`) and the app validator (`regime.ts`) implement this check identically. The app validator returns a boolean (simple pass/fail for the mobile shell); the adapter returns a structured `UpstreamError`.

### 8. Semantic ordering constraints for open/close windows

When timestamps represent a candle window, enforce semantic ordering at the boundary:

- **Window order**: `lastCandleCloseUnixMs` must be > `lastCandleOpenUnixMs` (close after open)
- **Generation order**: `generatedAtUnixMs` must be ≥ `lastCandleCloseUnixMs` (generation at or after close)

```ts
if (freshness.lastCandleCloseUnixMs <= freshness.lastCandleOpenUnixMs) {
  return upstreamError('candle close must be after open');
}
if (freshness.generatedAtUnixMs < freshness.lastCandleCloseUnixMs) {
  return upstreamError('generatedAt must be at or after candle close');
}
```

These catch impossible timestamps from upstream bugs (e.g., transposed open/close values) that pass parity checks individually but violate the candle model.

### 9. Timeframe duration validation with recognized-timeframe map

When the upstream provides a timeframe string (e.g., `"1h"`), validate that the candle window duration matches the expected duration for known timeframes.

```ts
const RECOGNIZED_TIMEFRAME_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};

const tf = raw.derivedTimeframe ?? raw.timeframe;
if (tf && tf in RECOGNIZED_TIMEFRAME_MS) {
  const expected = RECOGNIZED_TIMEFRAME_MS[tf];
  const actual = closeUnixMs - openUnixMs;
  if (actual !== expected) {
    return upstreamError(
      `candle window ${actual}ms does not match expected ${expected}ms for ${tf}`,
    );
  }
}
```

Unrecognized timeframes are accepted without duration check — this avoids blocking new timeframes the client doesn't yet know about. The map uses the `derivedTimeframe` field first (computed from candle data) and falls back to `timeframe` (declared by upstream).

### 10. Age parity tolerance window

The upstream provides `ageSeconds` (wall-clock age at generation time). The client can independently compute `(now - generatedAtUnixMs) / 1000`. These should agree within a small tolerance.

```ts
const AGE_PARITY_TOLERANCE_SECONDS = 2;

const computedAge = (now - freshness.generatedAtUnixMs) / 1000;
if (Math.abs(computedAge - freshness.ageSeconds) > AGE_PARITY_TOLERANCE_SECONDS) {
  return upstreamError('...');
}
```

A 2-second tolerance accounts for network latency and clock skew. Values within tolerance are still trusted (the data is fresh enough). Values outside tolerance indicate the data is stale enough to be unreliable.

### 11. Deterministic clock formatting with timezone injection

When displaying timestamp-derived values like candle open/close times, use a deterministic formatter with injectable locale and timezone for testability.

```ts
export interface ClockFormatOptions {
  locale?: string;
  timeZone?: string;
}

export function formatCandleClockTime(
  unixMs: number,
  now: number,
  opts?: ClockFormatOptions,
): string {
  const locale = opts?.locale ?? 'en-US';
  const timeZone = opts?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Same day → "HH:MM"; different day → "Mon D, HH:MM"
  const sameDay = new Date(unixMs).toDateString() === new Date(now).toDateString();
  if (sameDay) {
    return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone }).format(
      unixMs,
    );
  }
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(unixMs);
}
```

Tests inject `timeZone: 'UTC'` to get deterministic results regardless of the developer's local timezone.

### 12. computeDisplayAgeSeconds for elapsed-aware staleness

The upstream `ageSeconds` value is computed at generation time and becomes stale as time passes. The display age must account for elapsed time since generation:

```ts
function computeDisplayAgeSeconds(block: RegimeBlock, now: number): number {
  return block.freshness.ageSeconds + (now - block.freshness.generatedAtUnixMs) / 1000;
}
```

This decouples display staleness from the server-provided `ageSeconds`. The existing fresh/stale/gone thresholds (softStale, hardStale) still compare against `displayAgeSeconds`, preserving the tone logic without changing threshold semantics.

### 13. Multi-layer validation — adapter vs app validator

When validation logic is needed in both the adapter layer (server-side parsing) and the app layer (mobile client shell), implement identical validation rules but allow different error-reporting styles:

- **Adapter** (`CurrentRegimeAdapter.ts`): `parseUpstream()` returns `UpstreamError { kind: 'upstream-error', ... }` with descriptive messages for each failure mode. Used by the BFF to route responses.
- **App validator** (`apps/app/src/api/regime.ts`): `isRegimeFreshnessBlock()` returns `boolean`. Used by the mobile shell for simple pass/fail gating.

Both implement: strict ISO check, old-shape key rejection, ISO/MS parity, window ordering, generation ordering. The adapter additionally enforces timeframe duration and age parity (the app validator trusts that the BFF already validated these).

## Why This Matters

Breaking DTO changes are the highest-risk refactors in a layered architecture because the same field name can appear at different nesting levels, and old references silently return `undefined` instead of causing compile errors. The patterns above address the top failure modes:

- **Red-state TDD** catches shape mismatches at the earliest possible moment — the test, not runtime.
- **Two-stage review** prevents spec drift in subagent workflows where no single agent has full context on every task.
- **ViewModel ownership** prevents the slow divergence that happens when display logic is copied into components and then updated inconsistently when rules change.
- **Scoped coherence sweep** prevents both false-positive breakage of unrelated code and the paralysis of seeing too many grep hits.
- **Paired ISO/Unix-ms fields** catch upstream data corruption that single-timestamp representations cannot detect.
- **Old-shape rejection** prevents silent misinterpretation when clients receive legacy payloads they weren't designed to parse.
- **Strict ISO validation** rejects ambiguous timestamp formats before they cause timezone-dependent behavior.
- **Semantic ordering** catches logically impossible timestamps that pass individual field validation.
- **Timeframe duration validation** provides an additional integrity check for known candle intervals while not blocking new ones.
- **Age parity tolerance** distinguishes data that is still trustworthy from data where even the age metadata is stale.
- **Deterministic clock formatting** ensures UI timestamp display is consistent across developer machines and CI environments.
- **computeDisplayAgeSeconds** prevents stale display ages without changing threshold semantics.
- **Multi-layer validation** lets the adapter produce detailed errors for the BFF while the app validator uses a simple boolean for the mobile shell.

## When to Apply

- **Red-state TDD**: Any contract change that renames, moves, or re-types fields across two or more architectural layers. Especially when the old and new shapes share field names at different nesting levels (e.g., `volRatio` → `telemetry.volRatio`).
- **Two-stage review**: Any subagent-driven or parallelized plan with 3+ tasks. Single-developer sequential work can get by with one review pass, but parallel agents lack each other's context.
- **ViewModel ownership**: Any contract change that changes display logic — labels, tones, sort order, classification rules, or freshness semantics. If the change is purely data plumbing with no new display behavior, this is less critical.
- **Scoped coherence sweep**: Any field removal or rename where the field name is generic enough to appear in other DTOs. If the field name is domain-unique, a simple find-and-replace suffices.
- **Paired ISO/Unix-ms fields**: Any timestamp that crosses a trust boundary (upstream → adapter → app → UI). If the same instant is represented in both string and numeric form, validate parity. If only one form exists, the pattern is unnecessary.
- **Old-shape rejection**: Any breaking contract replacement where old and new shapes could both be served by the same endpoint. Reject by key presence, not by value.
- **Strict ISO validation**: Any upstream ISO string that feeds display logic or parity checks. Loose formats like `"May 9 2026"` or offset `"+00:00"` cause timezone-dependent behavior.
- **Semantic ordering**: Any paired timestamps that represent a duration or sequence (candle open/close, generation/collection). Validates the logical model, not just individual field format.
- **Timeframe duration validation**: Any data that includes both a timeframe string and window timestamps. Only validate recognized timeframes; skip unknown ones.
- **Age parity tolerance**: Any `ageSeconds`-style field where the client can independently compute elapsed time. Use a small tolerance (2s) to account for network latency and clock skew.
- **Deterministic clock formatting**: Any UI display of timestamps that must be consistent across developer machines, CI, and timezones. Inject locale/timeZone for testability.
- **computeDisplayAgeSeconds**: Any freshness indicator that compares age against thresholds, where the age value becomes stale over time.
- **Multi-layer validation**: Any validation needed in both a server-side parser (detailed errors) and a mobile client shell (boolean pass/fail). Implement rules identically; differ only in error reporting.

## Examples

### Red-state TDD for nested field migration

```ts
// BEFORE: test reads top-level field
it('exposes volRatio', () => {
  expect(block.volRatio).toBe(1.2);
});

// RED: test updated to read nested field, domain type not yet changed
it('exposes volRatio in telemetry', () => {
  expect(block.telemetry.volRatio).toBe(1.06);
});

// GREEN: domain type updated, adapter outputting nested shape
```

### Two-stage review checklist per task

```
Stage 1 — Spec Compliance:
  [ ] All fields in the task spec are present with correct types
  [ ] No fields from the old shape survive in the implementation
  [ ] Behavioral contracts (label logic, tone mapping) match spec

Stage 2 — Code Quality:
  [ ] No dead code referencing removed fields
  [ ] Boundary rules respected (no domain → adapter imports)
  [ ] No `any` casts hiding shape mismatches
  [ ] VM ownership not violated (no re-derivation in components)
```

### ViewModel as sole owner — freshness classification

```ts
// BEFORE: component derived its own freshness using local 48h rule
const isStale = Date.now() - block.freshness.capturedAtUnixMs > 48 * 3600_000;

// AFTER: ViewModel classifies using upstream flags
function classifyDataQuality(softStale: boolean, hardStale: boolean) {
  if (hardStale) return { label: 'Hard-stale', tone: 'danger' };
  if (softStale) return { label: 'Soft-stale', tone: 'warning' };
  return { label: 'Fresh', tone: 'success' };
}

// Component is thin — reads vm.dataQualityLabel, vm.suitabilityTone
```

### Coherence sweep with scope filter

```bash
# Step 1: Full grep for removed field
git grep -nE "capturedAtUnixMs" packages apps
# → 40+ files found

# Step 2: Classify
# IN SCOPE (regime path): CurrentRegimeAdapter.ts, RegimeViewModel.ts, regime.ts, RegimeSection.tsx
# OUT OF SCOPE: PolicyInsightsAdapter.ts, SrThesesAdapter.ts, SrLevelsAdapter.ts, PolicyInsightsViewModel.ts

# Step 3: Verify in-scope hits are zero, leave out-of-scope untouched
```

### Paired ISO + Unix-ms parity validation

```ts
// When a timestamp crosses a trust boundary, carry both representations
type RegimeFreshness = {
  generatedAtUnixMs: number;
  generatedAtIso: string; // must round-trip to generatedAtUnixMs
  lastCandleOpenUnixMs: number;
  lastCandleOpenIso: string; // must round-trip to lastCandleOpenUnixMs
  lastCandleCloseUnixMs: number;
  lastCandleCloseIso: string; // must round-trip to lastCandleCloseUnixMs
  // ...
};

// Adapter boundary validation
const ms = Date.parse(freshness.generatedAtIso);
if (ms !== freshness.generatedAtUnixMs) {
  return { kind: 'upstream-error', message: 'generatedAtIso/UnixMs parity violation' };
}
```

### Old-shape rejection by key presence

```ts
// BEFORE: old shape had lastCandleIso and lastCandleUnixMs
// AFTER: new shape has lastCandleOpenIso/UnixMs and lastCandleCloseIso/UnixMs

// Reject legacy payloads by key presence (not by value)
if (
  Object.prototype.hasOwnProperty.call(raw, 'lastCandleIso') ||
  Object.prototype.hasOwnProperty.call(raw, 'lastCandleUnixMs')
) {
  return { kind: 'upstream-error', message: 'legacy freshness shape detected' };
}
```

### Multi-layer validation — adapter vs app validator

```ts
// Adapter: detailed structured errors for BFF routing
function parseUpstream(raw: unknown): UpstreamError | RegimeBlock {
  if (!isStrictIso(freshness.generatedAtIso)) {
    return { kind: 'upstream-error', message: 'generatedAtIso must be strict ISO 8601' };
  }
  // ... more checks
}

// App validator: simple boolean for mobile shell gating
function isRegimeFreshnessBlock(raw: unknown): boolean {
  if (!isStrictIso(freshness.generatedAtIso)) return false;
  // ... same checks, boolean return
}
```

### Deterministic clock formatting with timezone injection

```ts
// View model produces clock strings for candle open/close times
const openTime = formatCandleClockTime(block.freshness.lastCandleOpenUnixMs, now, opts);
const closeTime = formatCandleClockTime(block.freshness.lastCandleCloseUnixMs, now, opts);

// Tests inject UTC to get deterministic results regardless of developer timezone
expect(formatCandleClockTime(ms, now, { timeZone: 'UTC' })).toBe('2:30 PM');
```

### computeDisplayAgeSeconds for elapsed-aware staleness

```ts
// BEFORE: display age was lastCandleUnixMs-based, not accounting for time since generation
const displayAgeSeconds = block.freshness.ageSeconds;

// AFTER: display age accounts for elapsed time since generation
function computeDisplayAgeSeconds(block: RegimeBlock, now: number): number {
  return block.freshness.ageSeconds + (now - block.freshness.generatedAtUnixMs) / 1000;
}

// Threshold comparison unchanged — still uses softStale/hardStale
// but now the display age is live rather than frozen at generation time
```

## Related

- [Parallel v2 read path alongside v1](./parallel-v2-read-path-alongside-v1-2026-05-07.md) — different problem (adding v2 alongside v1, not replacing v1 in-place), same architecture chain
- [Read-only data API with discriminated unions](./read-only-data-api-discriminated-unions-bff-2026-05-01.md) — DTO contract shape across boundaries; regime card refresh changed `RegimeBlock` shape which may invalidate some drift guard examples
- [Enriching DTOs across layers](./enriching-dtos-across-layers-2026-04-25.md) — general DTO enrichment pattern; regime refresh adds telemetry/freshness enrichment extending this pattern
- [Exhaustive switch with runtime guard for view model unions](./exhaustive-switch-runtime-guard-view-model-unions-2026-05-05.md) — view model boundary narrowing; regime refresh adds new RegimeFreshness/RegimeTelemetry types needing the same approach
- [Regime threshold hours vs minutes display bug](../ui-bugs/regime-threshold-hours-vs-minutes-2026-05-09.md) — sibling doc on freshness display formatting; extends the "same unit for comparability" principle
- GitHub #84 — regime card freshness semantics, telemetry fidelity, and UX hierarchy (the issue this work implements)

---
title: 'Regime card contract refresh: breaking DTO propagation across layers'
date: 2026-05-08
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
related_components:
  - packages/application/src/dto/regime.ts
  - packages/adapters/src/outbound/regime-engine/CurrentRegimeAdapter.ts
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

## Why This Matters

Breaking DTO changes are the highest-risk refactors in a layered architecture because the same field name can appear at different nesting levels, and old references silently return `undefined` instead of causing compile errors. The four patterns address the top failure modes:

- **Red-state TDD** catches shape mismatches at the earliest possible moment — the test, not runtime.
- **Two-stage review** prevents spec drift in subagent workflows where no single agent has full context on every task.
- **ViewModel ownership** prevents the slow divergence that happens when display logic is copied into components and then updated inconsistently when rules change.
- **Scoped coherence sweep** prevents both false-positive breakage of unrelated code and the paralysis of seeing too many grep hits.

## When to Apply

- **Red-state TDD**: Any contract change that renames, moves, or re-types fields across two or more architectural layers. Especially when the old and new shapes share field names at different nesting levels (e.g., `volRatio` → `telemetry.volRatio`).
- **Two-stage review**: Any subagent-driven or parallelized plan with 3+ tasks. Single-developer sequential work can get by with one review pass, but parallel agents lack each other's context.
- **ViewModel ownership**: Any contract change that changes display logic — labels, tones, sort order, classification rules, or freshness semantics. If the change is purely data plumbing with no new display behavior, this is less critical.
- **Scoped coherence sweep**: Any field removal or rename where the field name is generic enough to appear in other DTOs. If the field name is domain-unique, a simple find-and-replace suffices.

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

## Related

- [Parallel v2 read path alongside v1](./parallel-v2-read-path-alongside-v1-2026-05-07.md) — different problem (adding v2 alongside v1, not replacing v1 in-place), same architecture chain
- [Read-only data API with discriminated unions](./read-only-data-api-discriminated-unions-bff-2026-05-01.md) — DTO contract shape across boundaries; regime card refresh changed `RegimeBlock` shape which may invalidate some drift guard examples
- [Enriching DTOs across layers](./enriching-dtos-across-layers-2026-04-25.md) — general DTO enrichment pattern; regime refresh adds telemetry/freshness enrichment extending this pattern
- [Exhaustive switch with runtime guard for view model unions](./exhaustive-switch-runtime-guard-view-model-unions-2026-05-05.md) — view model boundary narrowing; regime refresh adds new RegimeFreshness/RegimeTelemetry types needing the same approach
- GitHub #84 — regime card freshness semantics, telemetry fidelity, and UX hierarchy (the issue this work implements)

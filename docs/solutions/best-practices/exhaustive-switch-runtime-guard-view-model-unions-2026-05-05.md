---
title: Exhaustive switch with runtime fallback for typed unions in view models
date: 2026-05-05
category: best-practices
module: packages/ui
problem_type: best_practice
component: development_workflow
severity: medium
applies_when:
  - Mapping a closed union type to display values or behavior
  - Building view model mappers that pass through string unions from DTOs
  - Adding a typed union field to replace an untyped string field
tags:
  - clmm
  - monitoring-status
  - exhaustive-switch
  - type-safety
  - view-model
  - runtime-guard
  - barrel-export
---

# Exhaustive Switch with Runtime Fallback for Typed Unions in View Models

## Context

During issue #71, `monitoringStatus` was promoted from an untyped `string` label (`monitoringLabel`) to a typed union (`MonitoringStatus = 'active' | 'degraded' | 'inactive'`) on `PositionListItemViewModel`. The `getMonitoringDisplay` function used an exhaustive `switch` with no `default` case — TypeScript ensures all cases are handled at compile time, but at runtime an unexpected value (e.g., from a malformed DTO or `as any` cast) would fall through and return `undefined`, causing a crash at the call site (`monitoring.text` → `undefined.text`).

Review also found that `buildPositionListViewModel` passed `p.monitoringStatus` through without runtime narrowing, trusting the DTO type. If the DTO type constraint was ever widened or bypassed, invalid values would silently enter the typed view model field.

Additionally, the typed union and its display function were not exported from the barrel, preventing external consumers (tests, agents) from importing them without deep imports.

## Guidance

### 1. Add an exhaustiveness guard with a `never` default that throws

An exhaustive `switch` over a closed union provides compile-time safety, ensuring new members trigger a type error until handled. But the `default` case should still exist as a runtime defense:

```ts
// WRONG — silently returns undefined for unexpected values
export function getMonitoringDisplay(status: MonitoringStatus): MonitoringDisplay {
  switch (status) {
    case 'active':
      return { text: 'Live', tone: 'safe' };
    case 'degraded':
      return { text: 'Degraded', tone: 'warn' };
    case 'inactive':
      return { text: 'Inactive', tone: 'faint' };
  }
}

// CORRECT — compile-time exhaustiveness + runtime defense
export function getMonitoringDisplay(status: MonitoringStatus): MonitoringDisplay {
  switch (status) {
    case 'active':
      return { text: 'Live', tone: 'safe' };
    case 'degraded':
      return { text: 'Degraded', tone: 'warn' };
    case 'inactive':
      return { text: 'Inactive', tone: 'faint' };
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unexpected monitoringStatus: ${String(_exhaustive)}`);
    }
  }
}
```

The `const _exhaustive: never = status` assignment preserves compile-time exhaustiveness checking (TypeScript errors if any union member is unhandled) while adding a runtime throw for values that bypass the type system.

### 2. Validate union values at view-model construction boundaries

When a DTO field flows into a typed view model field, add runtime narrowing at the boundary:

```ts
const VALID_MONITORING_STATUSES: ReadonlySet<string> = new Set<string>([
  'active',
  'degraded',
  'inactive',
]);

export function asMonitoringStatus(value: string): MonitoringStatus {
  if (!VALID_MONITORING_STATUSES.has(value)) {
    throw new Error(`Invalid monitoringStatus: ${value}`);
  }
  return value as MonitoringStatus;
}

export function buildPositionListViewModel(positions: PositionSummaryDto[]): PositionListViewModel {
  const items = positions.map((p) => ({
    // ...
    monitoringStatus: asMonitoringStatus(p.monitoringStatus),
    // ...
  }));
  // ...
}
```

This catches invalid values at the point of entry rather than at the point of use, producing a clear error message instead of a cryptic crash deep in a rendering function.

### 3. Export typed unions and display functions from the barrel

Types and functions that external consumers need (tests, agents, screen composition) must be barrel-exported. Without this, consumers deep-import from internal paths, coupling to file layout:

```ts
// packages/ui/src/index.ts
export type { MonitoringStatus } from './view-models/PositionListViewModel.js';
export { asMonitoringStatus } from './view-models/PositionListViewModel.js';
export { getMonitoringDisplay } from './components/PositionCardUtils.js';
export type { MonitoringDisplay, MonitoringTone } from './components/PositionCardUtils.js';
```

## Why This Matters

- **Silent `undefined` from exhaustive switches** is a common TypeScript pitfall. The compiler says "all cases handled" but runtime `as any` or malformed data silently falls through.
- **DTO-to-view-model pass-through** without narrowing relies on the DTO type always matching. If the backend adds a status before the DTO type is updated, the view model silently accepts an invalid value.
- **Missing barrel exports** force consumers to deep-import, making refactoring harder and preventing agents from discovering available types.

## When to Apply

- When adding a typed union field to a view model that replaces an untyped string
- When writing an exhaustive `switch` over a closed union that maps to display or behavior
- When a DTO field flows directly into a typed view model field
- When types or functions are needed outside their defining module

## Examples

**Before (silent undefined on unexpected value):**

```ts
export function getMonitoringDisplay(status: MonitoringStatus): MonitoringDisplay {
  switch (status) {
    case 'active':
      return { text: 'Live', tone: 'safe' };
    case 'degraded':
      return { text: 'Degraded', tone: 'warn' };
    case 'inactive':
      return { text: 'Inactive', tone: 'faint' };
  }
}
// getMonitoringDisplay('unknown' as never) → undefined (crashes at .text)
```

**After (compile-time exhaustive + runtime throw):**

```ts
export function getMonitoringDisplay(status: MonitoringStatus): MonitoringDisplay {
  switch (status) {
    case 'active':
      return { text: 'Live', tone: 'safe' };
    case 'degraded':
      return { text: 'Degraded', tone: 'warn' };
    case 'inactive':
      return { text: 'Inactive', tone: 'faint' };
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unexpected monitoringStatus: ${String(_exhaustive)}`);
    }
  }
}
// getMonitoringDisplay('unknown' as never) → throws with clear message
```

## Related

- `docs/solutions/best-practices/ui-component-review-patterns-2026-05-05.md` — review patterns from the same UI module (isNearEdge guard, dead field removal, a11y)
- `docs/solutions/best-practices/enriching-dtos-across-layers-2026-04-25.md` — DTO enrichment pipeline feeding PositionCardUtils
- GitHub #71 — View-model contract: typed monitoring status + PositionCard `{ item, onPress }` API

---
title: "S/R Levels Card Redesign v2: Grouped View-Models, Note Parsing, and Component Extraction"
date: 2026-04-27
category: design-patterns
module: packages/ui
problem_type: best_practice
component: development_workflow
severity: low
applies_when:
  - "Redesigning a screen section with complex presentation logic"
  - "A screen component grows beyond ~30 lines for a single subsection"
  - "View-model data shape does not match the desired UI layout"
  - "Presentation logic (sorting, tone computation, note formatting) is mixed with rendering"
  - "Free-text backend data contains structured metadata that the UI needs to display explicitly"
tags:
  - ui-redesign
  - view-model
  - component-extraction
  - presentation-logic
  - design-system
  - note-parsing
  - grouped-levels
  - sr-levels
supersedes: sr-levels-card-redesign-2026-04-26
last_updated: 2026-04-27
---

# S/R Levels Card Redesign v2: Grouped View-Models, Note Parsing, and Component Extraction

## Context

The S/R (Support & Resistance) levels section evolved from a simple flat list (v1) to a clustered card layout (v2). The v1 design used a unified `levels` array with tone computed from live price proximity (`breach` if crossed, `warn` if near, `safe` otherwise) and a simple `note` string per level. The v2 design required:

- Parsing structured metadata (source, timeframe, bias, setup type, trigger, invalidation) from free-text notes
- Grouping levels that share identical `(rank, timeframe, notes)` metadata into clusters
- Explicit tone rules: resistance levels always render as `breach` (red), support levels always as `safe` (green)
- A separate Market Thesis summary rendered above the clusters
- A group-based card layout with bias chips, trigger/invalidation labels, and metadata footers

**Where this pattern lives now:** S/R was extracted from the position-detail endpoint into a pool-scoped BFF endpoint (see [S/R position-to-pool extraction](../best-practices/sr-levels-position-to-pool-extraction-2026-04-27.md)). The view-model logic moved from `PositionDetailViewModel` into its own `SrLevelsViewModel` module, and the UI moved from `PositionDetailScreen` to `MarketContextPanel` on the Positions list page. The design patterns below are still valid — only the file locations and screen context have changed.

## Guidance

### 1. Parse Unstructured Notes into Structured View-Model Fields

Move note parsing into the view-model layer so components receive typed data instead of raw strings.

**`parseNotes(notes)`** — lives in `packages/ui/src/view-models/SrLevelsViewModel.ts`

```typescript
function parseNotes(notes: string | undefined): {
  source?: string;
  timeframe?: string;
  bias?: string;
  setupType?: string;
  trigger?: string;
  invalidation?: string;
  remaining: string;
} {
  if (!notes) return { remaining: '' };
  const parts = notes.split('|').map((s) => s.trim()).filter(Boolean);
  // ... parse source, timeframe, bias, setupType from first section
  // ... parse trigger and invalidation from remaining sections
  return { source, timeframe, bias, setupType, trigger, invalidation, remaining };
}
```

**`SrLevelGroupViewModel`** — lives in `packages/ui/src/view-models/SrLevelsViewModel.ts`

```typescript
export type SrLevelGroupViewModel = {
  levels: SrLevelViewModel[];
  note: string;
  source?: string;
  timeframe?: string;
  bias?: string;
  setupType?: string;
  trigger?: string;
  invalidation?: string;
};
```

### 2. Group Levels by Shared Metadata

In the view-model builder, cluster levels that share identical parsed metadata. Each cluster becomes one `SrLevelGroupViewModel`.

```typescript
const rawGroups = new Map<string, LevelWithMeta[]>();
for (const level of allLevels) {
  const key = `${level.parsed.bias ?? ''}:${level.parsed.source ?? ''}:${level.parsed.timeframe ?? ''}:${level.parsed.setupType ?? ''}:${level.parsed.trigger ?? ''}:${level.parsed.invalidation ?? ''}`;
  const existing = rawGroups.get(key);
  if (existing) existing.push(level);
  else rawGroups.set(key, [level]);
}
```

### 3. Override Tone Explicitly by Level Type

Do not derive tone from dynamic price proximity. Tone is fixed by semantic role:

- **Resistance levels:** always `breach` tone (red)
- **Support levels:** always `safe` tone (green)

Apply this in `buildSrLevelsViewModelBlock()` when mapping domain DTOs to view-models.

### 4. Restructure the Top-Level Block

`SrLevelsViewModelBlock` carries grouped data, an optional market thesis summary, and freshness metadata:

```typescript
export type SrLevelsViewModelBlock = {
  summary?: string | undefined;
  groups: SrLevelGroupViewModel[];
  freshnessLabel: string;
  isStale: boolean;
};
```

### 5. Extract Components Behind a MarketContextPanel Orchestrator

When a subsection exceeds ~30 lines or mixes presentation logic with rendering, extract dedicated presentational components. S/R is now rendered via `MarketContextPanel` which handles loading, error, and unsupported states and delegates to `SrLevelsCard` and `MarketThesisCard`.

**`MarketContextPanel.tsx`** — orchestrator on the Positions list page

```tsx
type Props = {
  srLevels: SrLevelsBlock | null | undefined;
  isLoading: boolean;
  isError: boolean;
  isUnsupported: boolean;
  now: number;
};

export function MarketContextPanel({ srLevels, isLoading, isError, isUnsupported, now }: Props) {
  const showUnavailable = isError || isUnsupported || srLevels === null;
  if (showUnavailable && srLevels == null) return <UnavailableCaption />;
  if (!isLoading && srLevels === undefined) return null;  // not yet fetched
  if (isLoading && srLevels == null) return <Skeleton />;
  const vm = buildSrLevelsViewModelBlock(srLevels, now);
  return (
    <>
      {vm.summary ? <MarketThesisCard summary={vm.summary} /> : null}
      <SrLevelsCard srLevels={vm} />
    </>
  );
}
```

**`SrLevelsCard.tsx`** — renders groups with bias chips, trigger/invalidation labels, and metadata footers.

**`MarketThesisCard.tsx`** — renders the `summary` text with an info icon.

### 6. Keep the Screen Component an Orchestrator Only

The screen should never transform data or contain inline presentation logic. The positions route wires TanStack Query for S/R and passes distinct state flags:

```tsx
// apps/app/app/(tabs)/positions.tsx
const srLevelsQuery = useQuery({
  queryKey: ['sr-levels-current', poolId],
  queryFn: () => fetchCurrentSrLevels(poolId!),
  enabled: poolId != null,
  staleTime: 5 * 60 * 1000,
  refetchOnMount: true,
  refetchOnWindowFocus: false,
  retry: (failureCount, error) =>
    !(error instanceof SrLevelsUnsupportedPoolError) && failureCount < 1,
});

<PositionsListScreen
  srLevels={srLevelsQuery.data?.srLevels ?? null}
  srLevelsLoading={srLevelsQuery.isLoading && srLevelsQuery.fetchStatus !== 'idle'}
  srLevelsError={srLevelsError}
  srLevelsUnsupported={srLevelsUnsupported}
/>
```

## Why This Matters

- **Testability:** View-model logic (parsing, grouping, tone assignment) is unit-testable in isolation. Components become pure render functions.
- **Maintainability:** Screens stay readable. Changes to S/R rendering touch one component, not a 300+ line screen file.
- **Type safety:** Structured fields (`trigger`, `invalidation`, `bias`) are typed, preventing silent breakage when note formats change.
- **Separation of concerns:** The screen orchestrates layout order; the view-model shapes data; components render. No layer re-derives what another already computed.
- **Design fidelity:** Grouped clusters, explicit tone overrides, and parsed metadata let the UI match complex designs without ad-hoc logic in JSX.
- **Scope alignment:** Pool-level S/R data is fetched once per pool, not redundantly per-position. See the [extraction doc](../best-practices/sr-levels-position-to-pool-extraction-2026-04-27.md) for the endpoint and query design.

## When to Apply

- Redesigning a screen section with complex presentation logic
- A screen component grows beyond ~30 lines for a single subsection
- View-model data shape does not match the desired UI layout
- Presentation logic (sorting, tone computation, note formatting) is mixed with rendering
- Free-text backend data contains structured metadata that the UI needs to display explicitly

## Examples

### Before (v1 flat levels, embedded in PositionDetailViewModel)

```typescript
// PositionDetailViewModel.ts — S/R logic embedded in position detail
export type SrLevelViewModel = {
  kind: 'support' | 'resistance';
  rawPrice: number;
  priceLabel: string;
  note: string;
  tone: 'safe' | 'warn' | 'breach';
};

export type SrLevelsViewModelBlock = {
  levels: SrLevelViewModel[];
  freshnessLabel: string;
  isStale: boolean;
};
```

### After (v2 grouped levels with parsed metadata, in SrLevelsViewModel)

```typescript
// SrLevelsViewModel.ts — S/R logic in its own module
export type SrLevelGroupViewModel = {
  levels: SrLevelViewModel[];
  note: string;
  source?: string;
  timeframe?: string;
  bias?: string;
  setupType?: string;
  trigger?: string;
  invalidation?: string;
};

export type SrLevelsViewModelBlock = {
  summary?: string | undefined;
  groups: SrLevelGroupViewModel[];
  freshnessLabel: string;
  isStale: boolean;
};
```

### Screen: Before and After

**Before (v1, PositionDetailScreen):**

```tsx
<SrLevelsCard srLevels={vm.srLevels} />
```

**After (v2, MarketContextPanel on PositionsListScreen):**

```tsx
<MarketContextPanel
  srLevels={srLevels}
  isLoading={srLevelsLoading}
  isError={srLevelsError}
  isUnsupported={srLevelsUnsupported}
  now={Date.now()}
/>
```

## Related

- [S/R position-to-pool extraction](../best-practices/sr-levels-position-to-pool-extraction-2026-04-27.md) — the architectural decision to move S/R from position-scoped to pool-scoped
- `packages/ui/src/view-models/SrLevelsViewModel.ts`
- `packages/ui/src/components/MarketContextPanel.tsx`
- `packages/ui/src/components/SrLevelsCard.tsx`
- `packages/ui/src/components/MarketThesisCard.tsx`
- `packages/adapters/src/inbound/http/SrLevelsController.ts`
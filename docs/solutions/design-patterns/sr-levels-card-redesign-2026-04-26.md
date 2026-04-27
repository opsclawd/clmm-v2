---
title: "S/R Levels Card Redesign v2: Grouped View-Models, Note Parsing, and Component Extraction"
date: 2026-04-26
category: design-patterns
module: packages/ui
problem_type: design_pattern
component: development_workflow
severity: low
applies_when:
  - "Redesigning a screen section with complex presentation logic"
  - "A screen component grows beyond ~30 lines for a single subsection"
  - "View-model data shape does not match the desired UI layout"
  - "Presentation logic (sorting, tone computation, note formatting) is mixed with rendering"
tags:
  - ui-redesign
  - view-model
  - component-extraction
  - presentation-logic
  - design-system
  - note-parsing
  - grouped-levels
---

# S/R Levels Card Redesign v2: Grouped View-Models, Note Parsing, and Component Extraction

## Context

The Position Detail screen's Support & Resistance (S/R) levels section evolved from a simple flat list (v1) to a clustered card layout (v2). The v1 design used a unified `levels` array with tone computed from live price proximity (`breach` if crossed, `warn` if near, `safe` otherwise) and a simple `note` string per level. The v2 design required:

- Parsing structured metadata (source, timeframe, bias, setup type, trigger, invalidation) from free-text notes
- Grouping levels that share identical `(rank, timeframe, notes)` metadata into clusters
- Explicit tone rules: resistance levels always render as `breach` (red), support levels always as `safe` (green)
- A separate Market Thesis summary rendered above the clusters
- A group-based card layout with bias chips, trigger/invalidation labels, and metadata footers

This guidance captures the v2 pattern: moving note parsing and grouping into the view-model, extracting a new `MarketThesisCard` component, redesigning `SrLevelsCard` to render groups, and keeping the screen component thin.

## Guidance

### 1. Parse Unstructured Notes into Structured View-Model Fields

Move note parsing into the view-model layer so components receive typed data instead of raw strings.

**`parseNotes(notes)`**

```typescript
function parseNotes(notes: string) {
  const sections = notes.split('|').map(s => s.trim());
  const first = sections[0] ?? '';
  const sourceMatch = first.match(/^([^,]+),\s*([^\.]+)\.\s*(.+)$/);
  const source = sourceMatch?.[1]?.trim();
  const timeframe = sourceMatch?.[2]?.trim();
  const bias = sourceMatch?.[3]?.trim();
  const setupType = first.includes('.')
    ? first.split('.').pop()?.trim()
    : undefined;

  const trigger = sections
    .find(s => s.startsWith('Trigger:'))
    ?.replace('Trigger:', '')
    .trim();
  const invalidation = sections
    .find(s => s.startsWith('Invalidation:'))
    ?.replace('Invalidation:', '')
    .trim();

  const note = sections
    .filter(s => !s.startsWith('Trigger:') && !s.startsWith('Invalidation:'))
    .slice(1)
    .join(' | ');

  return { source, timeframe, bias, setupType, trigger, invalidation, note };
}
```

**`SrLevelGroupViewModel`**

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

In the view-model builder, cluster levels that share identical `(rank, timeframe, notes)` metadata. Each cluster becomes one `SrLevelGroupViewModel`.

```typescript
const groups = Object.values(
  levels.reduce((acc, level) => {
    const key = `${level.rank}|${level.timeframe}|${level.notes}`;
    if (!acc[key]) {
      acc[key] = { levels: [], ...parseNotes(level.notes) };
    }
    acc[key].levels.push(level);
    return acc;
  }, {} as Record<string, SrLevelGroupViewModel>)
);
```

### 3. Override Tone Explicitly by Level Type

Do not derive tone from dynamic price proximity. In v2, tone is fixed by semantic role:

- **Resistance levels:** always `breach` tone (red)
- **Support levels:** always `safe` tone (green)

Apply this in the view-model builder when mapping domain DTOs to view-models.

### 4. Restructure the Top-Level Block

`SrLevelsViewModelBlock` now carries grouped data and an optional market thesis summary:

```typescript
export type SrLevelsViewModelBlock = {
  groups: SrLevelGroupViewModel[];
  summary?: string;
};
```

### 5. Extract Components to Keep the Screen Thin

When a subsection exceeds ~30 lines or mixes presentation logic with rendering, extract dedicated presentational components.

**`MarketThesisCard.tsx`** (NEW)

Renders the `summary` text with an info icon above the S/R card.

```tsx
export function MarketThesisCard({ summary }: { summary: string }) {
  return (
    <View style={styles.container}>
      <InfoIcon />
      <Text style={styles.text}>{summary}</Text>
    </View>
  );
}
```

**`SrLevelsCard.tsx`** (redesigned)

Renders `groups`, not a flat `levels` array. Each group displays:
- Bias chip (yellow)
- "RESISTANCE CLUSTER" or "SUPPORT CLUSTER" label
- Trigger section with red "Trigger" label
- Invalidation section with green "Invalidation" label
- Shared note at the bottom of the group
- Metadata footer: `Source · TF · Setup`
- Group background: `surfaceRecessed` with border

```tsx
type Props = {
  srLevels?: SrLevelsViewModelBlock | undefined;
};

export function SrLevelsCard({ srLevels }: Props): JSX.Element {
  if (!srLevels || srLevels.groups.length === 0) {
    return <Text>No current MCO levels available</Text>;
  }
  return (
    <View>
      {srLevels.groups.map((group, i) => (
        <View key={i} style={styles.group}>
          <BiasChip bias={group.bias} />
          <ClusterLabel kind={group.levels[0].kind} />
          {group.trigger && <TriggerLabel text={group.trigger} />}
          {group.invalidation && (
            <InvalidationLabel text={group.invalidation} />
          )}
          <Text style={styles.note}>{group.note}</Text>
          <MetaFooter
            source={group.source}
            timeframe={group.timeframe}
            setupType={group.setupType}
          />
        </View>
      ))}
    </View>
  );
}
```

### 6. Keep the Screen Component an Orchestrator Only

The screen should never transform data or contain inline presentation logic.

```tsx
// PositionDetailScreen.tsx
{vm.srLevels ? (
  <>
    {vm.srLevels.summary ? (
      <MarketThesisCard summary={vm.srLevels.summary} />
    ) : null}
    <SrLevelsCard srLevels={vm.srLevels} />
  </>
) : null}
```

## Why This Matters

- **Testability:** View-model logic (parsing, grouping, tone assignment) is unit-testable in isolation. Components become pure render functions.
- **Maintainability:** Screens stay readable. Changes to S/R rendering touch one component, not a 300+ line screen file.
- **Type safety:** Structured fields (`trigger`, `invalidation`, `bias`) are typed, preventing silent breakage when note formats change.
- **Separation of concerns:** The screen orchestrates layout order; the view-model shapes data; components render. No layer re-derives what another already computed.
- **Design fidelity:** Grouped clusters, explicit tone overrides, and parsed metadata let the UI match complex designs without ad-hoc logic in JSX.

## When to Apply

- Redesigning a screen section with complex presentation logic
- A screen component grows beyond ~30 lines for a single subsection
- View-model data shape does not match the desired UI layout
- Presentation logic (sorting, tone computation, note formatting) is mixed with rendering
- Free-text backend data contains structured metadata that the UI needs to display explicitly

## Examples

### Before (v1 flat levels)

```typescript
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

### After (v2 grouped levels with parsed metadata)

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

export type SrLevelsViewModelBlock = {
  groups: SrLevelGroupViewModel[];
  summary?: string;
};
```

### Screen: Before and After

**Before (v1):**

```tsx
<SrLevelsCard srLevels={vm.srLevels} />
```

**After (v2):**

```tsx
{vm.srLevels ? (
  <>
    {vm.srLevels.summary ? (
      <MarketThesisCard summary={vm.srLevels.summary} />
    ) : null}
    <SrLevelsCard srLevels={vm.srLevels} />
  </>
) : null}
```

## Related

- `packages/ui/src/screens/PositionDetailScreen.tsx`
- `packages/ui/src/components/SrLevelsCard.tsx`
- `packages/ui/src/components/MarketThesisCard.tsx`
- `packages/ui/src/view-models/PositionDetailViewModel.ts`
- `docs/architecture/repo-map.md`
- `docs/architecture/domain-model.md`

# View-Model Contract Improvements Design

**Issue:** https://github.com/opsclawd/clmm-v2/issues/71
**Date:** 2026-05-05
**Status:** Approved for implementation planning

## Goal

Clean up two positions-list UI contracts that became brittle during the issue #67 card redesign:

- `PositionCardUtils.getMonitoringDisplay` must consume typed monitoring state instead of display-label strings.
- `PositionCard` must accept the list item view model directly instead of a long list of individual fields.

This is a contained UI contract cleanup. It must stay inside `packages/ui` and must not touch DTOs, application-layer code, adapters, domain logic, trigger qualification, execution logic, or directional-exit policy.

## Scope

In scope:

- Add a `MonitoringStatus` union to `packages/ui/src/view-models/PositionListViewModel.ts`.
- Expose `monitoringStatus: MonitoringStatus` on `PositionListItemViewModel`.
- Map `PositionSummaryDto.monitoringStatus` directly into the list item view model.
- Remove `monitoringLabel` from `PositionListItemViewModel` once the card migration leaves it unused.
- Change `getMonitoringDisplay` to accept `MonitoringStatus`.
- Change `PositionCard` to accept `{ item, onPress }`.
- Change `PositionsListScreen` to pass `item={item}` instead of manually forwarding card fields.
- Update focused tests for view-model mapping, monitoring display, and list/card behavior.

Out of scope:

- DTO changes.
- Application-layer changes.
- Domain or adapter changes.
- API validation changes.
- Trigger qualification changes.
- Directional exit policy changes.
- Execution or signing flow changes.
- Creating a separate `PositionCardItem` subset type unless the full view model creates a concrete compile-time problem.

## Architecture

All changes stay in `packages/ui`.

`PositionListViewModel` becomes the typed boundary for monitoring state used by the card:

```ts
export type MonitoringStatus = 'active' | 'degraded' | 'inactive';

export type PositionListItemViewModel = {
  positionId: string;
  poolId: string;
  poolLabel: string;
  currentPrice: number;
  currentPriceLabel: string;
  rangeStatusKind: 'in-range' | 'below-range' | 'above-range';
  hasAlert: boolean;
  monitoringStatus: MonitoringStatus;
  lowerBoundPrice: number;
  upperBoundPrice: number;
  lowerBoundLabel: string;
  upperBoundLabel: string;
};
```

`buildPositionListViewModel` copies `p.monitoringStatus` through from `PositionSummaryDto`. The application DTO already exposes the same closed union, so UI code should not re-derive monitoring state from copy.

`PositionCard` imports `PositionListItemViewModel` with `import type`, accepts `{ item, onPress }`, and destructures internally. This keeps `PositionsListScreen` responsible for list composition and selection behavior, not the card's internal field list.

## Component Contract

`PositionCard` changes from many individual props to one item prop:

```ts
import type { PositionListItemViewModel } from '../view-models/PositionListViewModel.js';

type PositionCardProps = {
  item: PositionListItemViewModel;
  onPress?: () => void;
};
```

`PositionsListScreen` renders:

```tsx
<PositionCard item={item} onPress={() => onSelectPosition?.(item.positionId)} />
```

The card keeps the current visual behavior: pair glyph, pool ID, chip, range bar, placeholder TVL/fees, and monitor footer. The change is only the TypeScript props API and the typed monitoring input.

## Monitoring Display

`PositionCardUtils.getMonitoringDisplay` accepts `MonitoringStatus`, not a display label:

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
```

Displayed monitor text remains unchanged:

| Status     | Display text | Tone  |
| ---------- | ------------ | ----- |
| `active`   | `Live`       | safe  |
| `degraded` | `Degraded`   | warn  |
| `inactive` | `Inactive`   | faint |

No card logic may branch on `"Monitoring Active"`, `"Monitoring Degraded"`, or `"Monitoring Inactive"`.

## Data Flow

The intended flow is:

1. `PositionSummaryDto.monitoringStatus`
2. `PositionListItemViewModel.monitoringStatus`
3. `PositionCard item.monitoringStatus`
4. `getMonitoringDisplay(status)`
5. `Live`, `Degraded`, or `Inactive`

`monitoringLabel` is removed from the list view model after the migration if a grep confirms no remaining consumer.

## Error Handling

There is no new runtime error path.

The valid statuses are already constrained at the application DTO boundary and mirrored by the UI union. Because `getMonitoringDisplay` receives a closed union, it does not need an unknown fallback branch. Compile-time exhaustiveness is the desired failure mode if a new monitoring status is added later.

## Testing

Update focused tests instead of broad snapshot-style assertions:

- `PositionListViewModel.test.ts`: verify `active`, `degraded`, and `inactive` map through as typed `monitoringStatus`.
- `PositionCardUtils.test.ts`: call `getMonitoringDisplay` with typed statuses and verify `Live`, `Degraded`, `Inactive`, and tones.
- `PositionsListScreen.test.tsx`: update only if prop wiring or displayed behavior assertions require it. Preserve coverage that cards render the monitor text and invoke `onSelectPosition` with the selected `positionId`.

TypeScript should prove that `PositionCard` call sites no longer pass individual card fields.

## Verification

Implementation verification should include:

- `pnpm typecheck`
- `pnpm test`
- `pnpm boundaries`

`pnpm build` and `pnpm lint` are optional for this narrow UI contract cleanup unless implementation touches broader package exports or style-sensitive files.

## Acceptance Criteria

- `PositionListItemViewModel` exposes `monitoringStatus: 'active' | 'degraded' | 'inactive'`.
- `monitoringLabel` is removed from `PositionListItemViewModel` if unused after card migration.
- `getMonitoringDisplay` accepts typed monitoring status, not display-label strings.
- No card logic branches on `"Monitoring Active"`, `"Monitoring Degraded"`, or `"Monitoring Inactive"`.
- `PositionCard` accepts `{ item, onPress }` instead of individual view-model fields.
- `PositionsListScreen` passes `item={item}` and no longer manually forwards each card field.
- Displayed monitor text remains `Live`, `Degraded`, and `Inactive`.
- `pnpm typecheck` passes.
- `pnpm test` passes.
- `pnpm boundaries` passes.

# View-Model Contract Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten two positions-list UI contracts so monitoring state flows through as a typed `MonitoringStatus` union, and `PositionCard` accepts a single `item` view model instead of a long list of individual props.

**Architecture:** All changes stay inside `packages/ui`. `PositionListViewModel.ts` exports a new `MonitoringStatus = 'active' | 'degraded' | 'inactive'` union and exposes `monitoringStatus` (typed) on `PositionListItemViewModel`, copying it directly from `PositionSummaryDto.monitoringStatus`. `PositionCardUtils.getMonitoringDisplay` is rewritten to accept `MonitoringStatus` with an exhaustive `switch`. `PositionCard` swaps individual field props for `{ item, onPress }`. `PositionsListScreen` passes `item={item}` instead of forwarding each field. The legacy `monitoringLabel` view-model field and the in-file `monitoringLabel(status)` helper are deleted once nothing references them.

**Tech Stack:** TypeScript, React + React Native, pnpm workspaces, Vitest, Turbo (`pnpm typecheck`, `pnpm test`), `dependency-cruiser` (`pnpm boundaries`).

---

## File Structure

| File                                                        | Responsibility                                                            | Action                                                                                                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ui/src/view-models/PositionListViewModel.ts`      | List view model + `MonitoringStatus` union, builder maps DTO → view model | Modify: export `MonitoringStatus`; add `monitoringStatus` field; copy from DTO; remove `monitoringLabel` field and `monitoringLabel(status)` helper after callers migrated |
| `packages/ui/src/view-models/PositionListViewModel.test.ts` | View-model unit tests                                                     | Modify: assert `monitoringStatus` is copied for `active`/`degraded`/`inactive`                                                                                             |
| `packages/ui/src/components/PositionCardUtils.ts`           | Pure helpers used by the card, including `getMonitoringDisplay`           | Modify: change `getMonitoringDisplay` signature to take `MonitoringStatus` (imported via `import type`), use exhaustive `switch`                                           |
| `packages/ui/src/components/PositionCardUtils.test.ts`      | Unit tests for the helpers                                                | Modify: rewrite the `getMonitoringDisplay` tests to call with typed statuses                                                                                               |
| `packages/ui/src/components/PositionCard.tsx`               | The card component                                                        | Modify: import `PositionListItemViewModel` via `import type`; replace individual props with `{ item, onPress }`; destructure `item` internally                             |
| `packages/ui/src/screens/PositionsListScreen.tsx`           | Owns `FlatList` rendering of position cards                               | Modify: render `<PositionCard item={item} onPress={...} />` instead of forwarding individual fields                                                                        |
| `packages/ui/src/screens/PositionsListScreen.test.tsx`      | Screen integration tests                                                  | No changes expected; existing assertions (`Live`, `Degraded`, `Inactive`, chip labels, `onSelectPosition`) must keep passing — only update if a fixture stops typechecking |

The contract change is small enough that no new files are needed. The `MonitoringStatus` union lives next to `PositionListItemViewModel` because the view model is its primary source; the card helper consumes it via `import type`.

`PositionCardUtils.ts` already lives in `packages/ui/src/components/`; importing the view-model type from `../view-models/PositionListViewModel.js` is the same direction as `PositionCard.tsx`'s existing import path. `pnpm boundaries` checks cross-package boundaries (e.g., adapters → application), not intra-package paths, so this import is safe — but Task 11 still runs it as part of final verification.

---

## Pre-flight

### Task 0: Confirm baseline is green

**Files:** none

- [ ] **Step 1: Install dependencies (idempotent)**

Run: `pnpm install --frozen-lockfile`
Expected: completes without modifying the lockfile.

- [ ] **Step 2: Confirm typecheck passes on the unchanged branch**

Run: `pnpm typecheck`
Expected: PASS for all packages.

- [ ] **Step 3: Confirm tests pass on the unchanged branch**

Run: `pnpm --filter @clmm/ui test`
Expected: PASS. This is the only package this plan touches; the wider `pnpm test` is run during final verification.

If any of the above fail, stop and resolve before continuing — the plan assumes a green baseline.

---

## Phase 1 — Typed monitoring on the view model

### Task 1: Add a failing test that `buildPositionListViewModel` exposes typed `monitoringStatus`

**Files:**

- Modify: `packages/ui/src/view-models/PositionListViewModel.test.ts`

- [ ] **Step 1: Append a new `describe` block to the test file**

Open `packages/ui/src/view-models/PositionListViewModel.test.ts` and append the following block at the end of the file (after the existing `describe('buildPositionListViewModel', ...)` block, still at top level):

```ts
describe('buildPositionListViewModel monitoringStatus mapping', () => {
  it('copies active monitoring status through as a typed value', () => {
    const vm = buildPositionListViewModel([makeSummaryDto({ monitoringStatus: 'active' })]);
    expect(vm.items[0]!.monitoringStatus).toBe('active');
  });

  it('copies degraded monitoring status through as a typed value', () => {
    const vm = buildPositionListViewModel([makeSummaryDto({ monitoringStatus: 'degraded' })]);
    expect(vm.items[0]!.monitoringStatus).toBe('degraded');
  });

  it('copies inactive monitoring status through as a typed value', () => {
    const vm = buildPositionListViewModel([makeSummaryDto({ monitoringStatus: 'inactive' })]);
    expect(vm.items[0]!.monitoringStatus).toBe('inactive');
  });
});
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run: `pnpm --filter @clmm/ui test -- PositionListViewModel`
Expected: the three new specs FAIL — TypeScript will report `Property 'monitoringStatus' does not exist on type 'PositionListItemViewModel'`, or, if compilation proceeds, the assertions read `undefined`.

If the rest of the file's tests fail for unrelated reasons, stop and investigate.

- [ ] **Step 3: Commit the failing test**

```bash
git add packages/ui/src/view-models/PositionListViewModel.test.ts
git commit -m "test(ui): add failing assertions for typed monitoringStatus on list view model"
```

---

### Task 2: Add `MonitoringStatus` and `monitoringStatus` to the view model

**Files:**

- Modify: `packages/ui/src/view-models/PositionListViewModel.ts`

- [ ] **Step 1: Add the union type and field, and pass `monitoringStatus` through in the mapping**

Open `packages/ui/src/view-models/PositionListViewModel.ts` and replace the entire file with:

```ts
import type { PositionSummaryDto } from '@clmm/application/public';

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
  monitoringLabel: string;
  lowerBoundPrice: number;
  upperBoundPrice: number;
  lowerBoundLabel: string;
  upperBoundLabel: string;
};

export type PositionListViewModel = {
  items: PositionListItemViewModel[];
  isEmpty: boolean;
};

function monitoringLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Monitoring Active';
    case 'degraded':
      return 'Monitoring Degraded';
    case 'inactive':
      return 'Monitoring Inactive';
    default:
      return 'Unknown';
  }
}

export function buildPositionListViewModel(positions: PositionSummaryDto[]): PositionListViewModel {
  const items: PositionListItemViewModel[] = positions.map((p) => ({
    positionId: p.positionId,
    poolId: p.poolId,
    poolLabel: p.tokenPairLabel,
    currentPrice: p.currentPrice,
    currentPriceLabel: p.currentPriceLabel ?? `Current: ${p.currentPrice}`,
    rangeStatusKind: p.rangeState,
    hasAlert: p.hasActionableTrigger,
    monitoringStatus: p.monitoringStatus,
    monitoringLabel: monitoringLabel(p.monitoringStatus),
    lowerBoundPrice: p.lowerBoundPrice,
    upperBoundPrice: p.upperBoundPrice,
    lowerBoundLabel: p.lowerBoundLabel,
    upperBoundLabel: p.upperBoundLabel,
  }));

  return { items, isEmpty: items.length === 0 };
}
```

Note: this intermediate state keeps `monitoringLabel` on the view model so existing card callers continue to typecheck. The legacy field and helper are deleted in Task 8 once `PositionCard` no longer reads them.

`p.monitoringStatus` is already typed `'active' | 'degraded' | 'inactive'` by `PositionSummaryDto` (see `packages/application/src/dto/index.ts:53`), so the assignment to `monitoringStatus: MonitoringStatus` typechecks without a cast.

- [ ] **Step 2: Run the view-model tests and verify they pass**

Run: `pnpm --filter @clmm/ui test -- PositionListViewModel`
Expected: PASS, including the three new monitoring specs.

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @clmm/ui typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/view-models/PositionListViewModel.ts
git commit -m "feat(ui): expose typed monitoringStatus on PositionListItemViewModel"
```

---

## Phase 2 — Typed `getMonitoringDisplay`

### Task 3: Add failing tests that `getMonitoringDisplay` accepts `MonitoringStatus`

**Files:**

- Modify: `packages/ui/src/components/PositionCardUtils.test.ts`

- [ ] **Step 1: Replace the existing `describe('getMonitoringDisplay', ...)` block**

Open `packages/ui/src/components/PositionCardUtils.test.ts`. Find this exact block (currently at lines 180–202):

```ts
describe('getMonitoringDisplay', () => {
  it('maps the active label to Live with the safe tone color', () => {
    const r = getMonitoringDisplay('Monitoring Active');
    expect(r.text).toBe('Live');
    expect(r.tone).toBe('safe');
  });

  it('maps the degraded label to Degraded with the warn tone color', () => {
    const r = getMonitoringDisplay('Monitoring Degraded');
    expect(r.text).toBe('Degraded');
    expect(r.tone).toBe('warn');
  });

  it('falls back to Inactive with a faint tone for any other input', () => {
    const r = getMonitoringDisplay('Monitoring Inactive');
    expect(r.text).toBe('Inactive');
    expect(r.tone).toBe('faint');

    const u = getMonitoringDisplay('totally unknown');
    expect(u.text).toBe('Inactive');
    expect(u.tone).toBe('faint');
  });
});
```

Replace it with:

```ts
describe('getMonitoringDisplay', () => {
  it('maps active to Live with the safe tone', () => {
    const r = getMonitoringDisplay('active');
    expect(r.text).toBe('Live');
    expect(r.tone).toBe('safe');
  });

  it('maps degraded to Degraded with the warn tone', () => {
    const r = getMonitoringDisplay('degraded');
    expect(r.text).toBe('Degraded');
    expect(r.tone).toBe('warn');
  });

  it('maps inactive to Inactive with the faint tone', () => {
    const r = getMonitoringDisplay('inactive');
    expect(r.text).toBe('Inactive');
    expect(r.tone).toBe('faint');
  });
});
```

The "totally unknown" fallback test is intentionally removed: `getMonitoringDisplay` now consumes a closed union, so an unknown string is a TypeScript error rather than a runtime branch.

- [ ] **Step 2: Run the helper tests and verify they fail**

Run: `pnpm --filter @clmm/ui test -- PositionCardUtils`
Expected: the three rewritten specs FAIL. The existing implementation compares against the literal strings `'Monitoring Active'` / `'Monitoring Degraded'` and falls through to `Inactive` for anything else, so:

- `getMonitoringDisplay('active')` returns `{ text: 'Inactive', tone: 'faint' }` — test expects `Live`/`safe`.
- `getMonitoringDisplay('degraded')` returns `{ text: 'Inactive', tone: 'faint' }` — test expects `Degraded`/`warn`.
- `getMonitoringDisplay('inactive')` returns `{ text: 'Inactive', tone: 'faint' }` — passes today by coincidence; will still pass after the implementation change.

If only the third test passes, that matches expectations. Other tests in the file must remain green.

- [ ] **Step 3: Commit the failing tests**

```bash
git add packages/ui/src/components/PositionCardUtils.test.ts
git commit -m "test(ui): drive getMonitoringDisplay toward typed MonitoringStatus input"
```

---

### Task 4: Rewrite `getMonitoringDisplay` to accept `MonitoringStatus`

**Files:**

- Modify: `packages/ui/src/components/PositionCardUtils.ts`

- [ ] **Step 1: Add the type import at the top of the file**

Open `packages/ui/src/components/PositionCardUtils.ts`. The file currently has no imports. Add this as the very first line:

```ts
import type { MonitoringStatus } from '../view-models/PositionListViewModel.js';
```

- [ ] **Step 2: Replace the `getMonitoringDisplay` function body**

Find this exact block (currently lines 80–84):

```ts
export function getMonitoringDisplay(monitoringLabel: string): MonitoringDisplay {
  if (monitoringLabel === 'Monitoring Active') return { text: 'Live', tone: 'safe' };
  if (monitoringLabel === 'Monitoring Degraded') return { text: 'Degraded', tone: 'warn' };
  return { text: 'Inactive', tone: 'faint' };
}
```

Replace it with:

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

The `switch` is exhaustive over the closed union, so TypeScript will allow the function to return `MonitoringDisplay` without a fallback. If a future change adds a new status to the union, this function will fail to compile — that is the desired failure mode (per the spec's Error Handling section).

- [ ] **Step 3: Run the helper tests and verify they pass**

Run: `pnpm --filter @clmm/ui test -- PositionCardUtils`
Expected: PASS for all `getMonitoringDisplay` specs and unchanged for the rest of the file.

- [ ] **Step 4: Run typecheck**

Run: `pnpm --filter @clmm/ui typecheck`
Expected: a NEW error in `packages/ui/src/components/PositionCard.tsx` — `Argument of type 'string' is not assignable to parameter of type 'MonitoringStatus'` at the `getMonitoringDisplay(monitoringLabel)` call site (currently line 55). This is expected and will be fixed in Task 6.

Do not commit yet — the next phase fixes the card to make typecheck green.

---

## Phase 3 — `PositionCard` accepts the view-model item

### Task 5: Update the card component to take `{ item, onPress }`

**Files:**

- Modify: `packages/ui/src/components/PositionCard.tsx`

- [ ] **Step 1: Replace the entire file**

Open `packages/ui/src/components/PositionCard.tsx` and replace the whole file with:

```tsx
import { View, Text, TouchableOpacity } from 'react-native';
import type { PositionListItemViewModel } from '../view-models/PositionListViewModel.js';
import { colors, typography } from '../design-system/index.js';
import { Chip } from './Chip.js';
import { PairGlyph } from './PairGlyph.js';
import { RangeBar } from './RangeBar.js';
import {
  formatPoolId,
  getBreachSide,
  getCardPlaceholderMetrics,
  getMonitoringDisplay,
  getStatusChipProps,
  isNearEdge,
  splitTokenPair,
} from './PositionCardUtils.js';

type Props = {
  item: PositionListItemViewModel;
  onPress?: () => void;
};

function monitoringDotColor(tone: 'safe' | 'warn' | 'faint'): string {
  if (tone === 'safe') return colors.safe;
  if (tone === 'warn') return colors.warn;
  return colors.textFaint;
}

export function PositionCard({ item, onPress }: Props): JSX.Element {
  const {
    poolId,
    poolLabel,
    currentPrice,
    currentPriceLabel,
    lowerBoundPrice,
    upperBoundPrice,
    lowerBoundLabel,
    upperBoundLabel,
    rangeStatusKind,
    hasAlert,
    monitoringStatus,
  } = item;

  const tokens = splitTokenPair(poolLabel);
  const truncatedPoolId = formatPoolId(poolId);
  const nearEdge = isNearEdge({ currentPrice, lowerBoundPrice, upperBoundPrice });
  const chip = getStatusChipProps({ rangeStatusKind, hasAlert, nearEdge });
  const monitoring = getMonitoringDisplay(monitoringStatus);
  const placeholders = getCardPlaceholderMetrics(poolId);

  const breachSide = getBreachSide(hasAlert, rangeStatusKind);

  return (
    <TouchableOpacity
      testID={`position-card-${poolId}`}
      accessibilityRole="button"
      accessibilityLabel={`Position card for ${poolLabel}, ${chip.label}`}
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        padding: 16,
        marginBottom: 10,
        marginHorizontal: 20,
      }}
    >
      {/* Top row: pair glyph + label + pool id, chip on the right */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <PairGlyph a={tokens.a} b={tokens.b} size={30} />
          <View>
            <Text
              style={{
                fontWeight: typography.fontWeight.semibold,
                fontSize: typography.fontSize.md,
                color: colors.textPrimary,
                letterSpacing: -0.01 * typography.fontSize.md,
              }}
            >
              {poolLabel}
            </Text>
            <Text
              style={{
                fontFamily: typography.fontFamily.mono,
                fontSize: 11,
                color: colors.textTertiary,
              }}
            >
              {truncatedPoolId}
            </Text>
          </View>
        </View>
        <Chip tone={chip.tone}>{chip.label}</Chip>
      </View>

      {/* Range bar */}
      <RangeBar
        lowerBoundPrice={lowerBoundPrice}
        upperBoundPrice={upperBoundPrice}
        currentPrice={currentPrice}
        lowerBoundLabel={lowerBoundLabel}
        upperBoundLabel={upperBoundLabel}
        currentPriceLabel={currentPriceLabel}
        {...(breachSide ? { breachSide } : {})}
      />

      {/* Bottom row: TVL · Fees 24h · Monitor */}
      <View
        style={{
          flexDirection: 'row',
          marginTop: 4,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: 0.08,
              color: colors.textTertiary,
              fontWeight: typography.fontWeight.semibold,
            }}
          >
            TVL
          </Text>
          <Text
            style={{
              fontFamily: typography.fontFamily.mono,
              fontSize: 14,
              marginTop: 2,
              color: colors.textPrimary,
            }}
          >
            {placeholders.tvlLabel}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: 0.08,
              color: colors.textTertiary,
              fontWeight: typography.fontWeight.semibold,
            }}
          >
            Fees 24h
          </Text>
          <Text
            style={{
              fontFamily: typography.fontFamily.mono,
              fontSize: 14,
              marginTop: 2,
              color: colors.safe,
            }}
          >
            {placeholders.fees24hLabel}
          </Text>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: 0.08,
              color: colors.textTertiary,
              fontWeight: typography.fontWeight.semibold,
            }}
          >
            Monitor
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                backgroundColor: monitoringDotColor(monitoring.tone),
                marginRight: 5,
              }}
            />
            <Text
              style={{
                fontSize: typography.fontSize.caption,
                color: colors.textBody,
              }}
            >
              {monitoring.text}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}
```

The visual JSX is identical to the previous version — only the props API and the destructuring changed. `monitoringStatus` (typed `MonitoringStatus`) flows directly into `getMonitoringDisplay`, which now accepts that union. `monitoringLabel` is no longer read by this file.

- [ ] **Step 2: Do not run typecheck yet**

After this step `PositionCard.tsx` is internally consistent, but `PositionsListScreen.tsx` still passes the old props (`poolId={item.poolId}`, ..., `monitoringLabel={item.monitoringLabel}`), which will produce a wall of TypeScript errors at the call site. Continue to Task 6 first, then run typecheck.

---

### Task 6: Update `PositionsListScreen` to pass `item={item}`

**Files:**

- Modify: `packages/ui/src/screens/PositionsListScreen.tsx`

- [ ] **Step 1: Replace the `renderItem` block**

Open `packages/ui/src/screens/PositionsListScreen.tsx`. Find this exact block (currently lines 237–252, inside the `FlatList`):

```tsx
      renderItem={({ item }) => (
        <PositionCard
          poolId={item.poolId}
          poolLabel={item.poolLabel}
          currentPrice={item.currentPrice}
          currentPriceLabel={item.currentPriceLabel}
          lowerBoundPrice={item.lowerBoundPrice}
          upperBoundPrice={item.upperBoundPrice}
          lowerBoundLabel={item.lowerBoundLabel}
          upperBoundLabel={item.upperBoundLabel}
          rangeStatusKind={item.rangeStatusKind}
          hasAlert={item.hasAlert}
          monitoringLabel={item.monitoringLabel}
          onPress={() => onSelectPosition?.(item.positionId)}
        />
      )}
```

Replace it with:

```tsx
      renderItem={({ item }) => (
        <PositionCard
          item={item}
          onPress={() => onSelectPosition?.(item.positionId)}
        />
      )}
```

No other lines in this file change.

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @clmm/ui typecheck`
Expected: PASS. The errors introduced in Task 4 and Task 5 are now resolved because the screen passes a `PositionListItemViewModel` whose `monitoringStatus` is a typed `MonitoringStatus`.

- [ ] **Step 3: Run the UI tests**

Run: `pnpm --filter @clmm/ui test`
Expected: PASS for the whole `@clmm/ui` package. In particular:

- `PositionListViewModel.test.ts` (Phase 1 specs).
- `PositionCardUtils.test.ts` (Phase 2 specs).
- `PositionsListScreen.test.tsx` — assertions for `Live` / `Degraded` / `Inactive`, the six chip labels, `onSelectPosition('pos-tap-test')`, and `RangeBar` labels must all keep passing because the rendered output is unchanged.

If a `PositionsListScreen.test.tsx` spec fails, do **not** mass-rewrite the test file. Read the failure: it should be either a fixture missing a typed `monitoringStatus` (already typed as `'active'`/`'degraded'`/`'inactive'` in the fixture, so this should not happen) or a behavioral assertion that legitimately broke (which means the card's visible output drifted — investigate the card change rather than rewriting the test).

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/PositionCardUtils.ts \
        packages/ui/src/components/PositionCard.tsx \
        packages/ui/src/screens/PositionsListScreen.tsx
git commit -m "refactor(ui): PositionCard accepts list item view model and typed monitoring status"
```

This single commit groups the three coupled changes: helper signature, card prop API, screen call site. Splitting them would leave the tree uncompilable between commits (Task 5 alone leaves the screen broken; Task 6 alone leaves the helper unused).

---

## Phase 4 — Remove the now-unused legacy field

### Task 7: Confirm no consumer reads `monitoringLabel`

**Files:** none

- [ ] **Step 1: Grep across `packages/` and `apps/`**

Run:

```bash
grep -rn "monitoringLabel" packages/ apps/ --include='*.ts' --include='*.tsx' \
  | grep -v '/dist/' \
  | grep -v 'apps/app/dist/'
```

Expected output (only the soon-to-be-removed declarations and helper inside `PositionListViewModel.ts`):

```
packages/ui/src/view-models/PositionListViewModel.ts:11:  monitoringLabel: string;
packages/ui/src/view-models/PositionListViewModel.ts:23:function monitoringLabel(status: string): string {
packages/ui/src/view-models/PositionListViewModel.ts:45:    monitoringLabel: monitoringLabel(p.monitoringStatus),
```

If any other source file (anything not under `dist/`) reads `monitoringLabel`, stop and migrate that consumer before continuing. Common places to double-check by hand: the `apps/app` screen wiring and any `*.test.tsx` fixture in the UI package. As of this plan, `PositionsListScreen.test.tsx` constructs `PositionSummaryDto` fixtures (which carry `monitoringStatus`, not `monitoringLabel`), so it does not need changes.

---

### Task 8: Delete `monitoringLabel` from the view model

**Files:**

- Modify: `packages/ui/src/view-models/PositionListViewModel.ts`

- [ ] **Step 1: Remove the field, the helper function, and the mapping line**

Open `packages/ui/src/view-models/PositionListViewModel.ts` and replace the whole file with:

```ts
import type { PositionSummaryDto } from '@clmm/application/public';

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

export type PositionListViewModel = {
  items: PositionListItemViewModel[];
  isEmpty: boolean;
};

export function buildPositionListViewModel(positions: PositionSummaryDto[]): PositionListViewModel {
  const items: PositionListItemViewModel[] = positions.map((p) => ({
    positionId: p.positionId,
    poolId: p.poolId,
    poolLabel: p.tokenPairLabel,
    currentPrice: p.currentPrice,
    currentPriceLabel: p.currentPriceLabel ?? `Current: ${p.currentPrice}`,
    rangeStatusKind: p.rangeState,
    hasAlert: p.hasActionableTrigger,
    monitoringStatus: p.monitoringStatus,
    lowerBoundPrice: p.lowerBoundPrice,
    upperBoundPrice: p.upperBoundPrice,
    lowerBoundLabel: p.lowerBoundLabel,
    upperBoundLabel: p.upperBoundLabel,
  }));

  return { items, isEmpty: items.length === 0 };
}
```

The `monitoringLabel` field, the inner `monitoringLabel(status)` helper, and the `monitoringLabel: monitoringLabel(p.monitoringStatus),` mapping line are all gone. Nothing else changes.

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @clmm/ui typecheck`
Expected: PASS. If TypeScript reports a `monitoringLabel` reference somewhere, return to Task 7 — that consumer was missed.

- [ ] **Step 3: Run the UI tests**

Run: `pnpm --filter @clmm/ui test`
Expected: PASS, including `PositionListViewModel.test.ts` (which never asserted `monitoringLabel`).

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/view-models/PositionListViewModel.ts
git commit -m "refactor(ui): remove legacy monitoringLabel from PositionListItemViewModel"
```

---

## Phase 5 — Final verification

### Task 9: Workspace-wide typecheck

**Files:** none

- [ ] **Step 1: Run typecheck on the whole workspace**

Run: `pnpm typecheck`
Expected: PASS for every package. This catches any consumer outside `packages/ui` that we missed (e.g., a re-export or a screen in `apps/app` that read `monitoringLabel`).

If it fails, identify the consumer, port it to `monitoringStatus`, and re-run before continuing.

---

### Task 10: Workspace-wide tests

**Files:** none

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS for every package. The change is confined to `packages/ui`, so this is a regression check rather than a behavior check.

If a test in another package fails, stop and investigate — this plan should not have changed any contract outside `packages/ui`.

---

### Task 11: Boundaries check

**Files:** none

- [ ] **Step 1: Run dependency-cruiser**

Run: `pnpm boundaries`
Expected: PASS. The new `import type { MonitoringStatus }` from `../view-models/PositionListViewModel.js` inside `PositionCardUtils.ts` is intra-package and intra-`src`; the dependency-cruiser config (`packages/config/boundaries/dependency-cruiser.cjs`) enforces inter-package layering and should not flag it. If it does flag it, surface the rule output and stop — do not silence the rule without discussing with the user.

---

## Acceptance Criteria Trace

Every spec acceptance criterion maps to at least one task above:

- "`PositionListItemViewModel` exposes `monitoringStatus: 'active' | 'degraded' | 'inactive'`." → Task 2.
- "`monitoringLabel` is removed from `PositionListItemViewModel` if unused after card migration." → Task 7 (verify) + Task 8 (delete).
- "`getMonitoringDisplay` accepts typed monitoring status, not display-label strings." → Task 4.
- "No card logic branches on `\"Monitoring Active\"`, `\"Monitoring Degraded\"`, or `\"Monitoring Inactive\"`." → Task 4 deletes those string literals from `getMonitoringDisplay`; Task 5 stops `PositionCard` from forwarding `monitoringLabel`.
- "`PositionCard` accepts `{ item, onPress }` instead of individual view-model fields." → Task 5.
- "`PositionsListScreen` passes `item={item}` and no longer manually forwards each card field." → Task 6.
- "Displayed monitor text remains `Live`, `Degraded`, and `Inactive`." → Task 4 (helper output) + Task 6 Step 3 (`PositionsListScreen.test.tsx` assertions for `Live`/`Degraded`/`Inactive` keep passing).
- "`pnpm typecheck` passes." → Task 9.
- "`pnpm test` passes." → Task 10.
- "`pnpm boundaries` passes." → Task 11.

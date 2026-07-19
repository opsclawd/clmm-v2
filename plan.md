<!-- plan-review-required -->

# Alert Visibility and Fail-Closed RangeBar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve every actionable position alert in the status chip, fail closed when RangeBar prices cannot support an authoritative visualization, and emit structured non-wallet diagnostics through the existing observability seam.

**Architecture:** Keep all classification in pure UI helpers: status-chip precedence remains in `PositionCardUtils.ts`, while a new `RangeBarUtils.ts` returns a discriminated available/unavailable display model. `PositionCard` owns the warning effects because it has the classification results and safe position/pool identifiers; the Expo route injects the existing `TelemetryAdapter` through the approved composition entrypoint. Domain range classification, trigger qualification, and directional exit policy are unchanged.

**Tech Stack:** TypeScript, React 19, React Native, Expo Router, Vitest, Testing Library, `@clmm/application/public`, and the existing `TelemetryAdapter`.

---

# Non-goals

- Do not change trigger qualification, debounce, breach episodes, alert lifecycle, preview, approval, signing, submission, or execution behavior.
- Do not change application DTOs, runtime DTO validation, the canonical range model, or `DirectionalExitPolicyService`.
- Do not infer breach direction for `hasAlert=true` plus `in-range`, including from token order, price proximity, or a default side.
- Do not repair, retry, cache, or substitute invalid prices, and do not create backend telemetry ingestion.
- Do not redesign the position card, change financial metrics, or add new design tokens.

# Affected files

- `packages/ui/src/components/PositionCardUtils.ts` — status precedence and stable alert/range diagnostic classification.
- `packages/ui/src/components/PositionCardUtils.test.ts` — exhaustive alert/range matrix and directionless inconsistent-state tests.
- `packages/ui/src/components/RangeBarUtils.ts` — pure price validation and discriminated display-state calculation.
- `packages/ui/src/components/RangeBarUtils.test.ts` — invalid-reason ordering, overflow protection, clamping, and midpoint tests.
- `packages/ui/src/components/RangeBar.tsx` — available and unavailable render branches.
- `packages/ui/src/components/RangeBar.test.tsx` — marker, decoration, labels, unavailable copy, and accessibility tests.
- `packages/ui/src/components/PositionCard.tsx` — display-state construction and structured warning effects.
- `packages/ui/src/components/PositionCard.test.tsx` — chip/accessibility behavior, warning payloads, coexistence, deduplication-by-dependencies, and press isolation.
- `packages/ui/src/screens/PositionsListScreen.tsx` — required narrow observability dependency threaded to every card.
- `packages/ui/src/screens/PositionsListScreen.test.tsx` — test wrapper for the required dependency plus focused loading/unavailable and pass-through assertions.
- `apps/app/src/composition/index.ts` — approved construction/export of `TelemetryAdapter`.
- `apps/app/app/(tabs)/positions.tsx` — production injection into `PositionsListScreen`.
- `apps/app/src/appShellDependencies.test.ts` — composition/route wiring guard.

# Behavioral invariants

- Alert precedence: `hasAlert=true` with `below-range`, `above-range`, or `in-range` renders `Breach · below`, `Breach · above`, or `Action needed`, respectively; `nearEdge` never hides an alert.
- Directional safety: `hasAlert=true` plus `in-range` remains directionless and never receives below/above breach decoration.
- RangeBar validity: an available state exists only when all prices are finite and strictly positive, bounds ascend, and every intermediate and final percentage is finite over an ascending visual domain.
- Deterministic invalidity: when several validations fail, the first reason in the specified validation order is returned.
- Fail-closed rendering: unavailable state has no marker, current label, active band, or breach decoration, and exposes `Price unavailable` plus `Price range unavailable` accessibility text.
- Midpoint distinction: valid midpoint data remains available and renders a marker at exactly `50%`; it is never confused with unavailable data.
- Independent surfaces: alert inconsistency and invalid RangeBar data may coexist, producing `Action needed`, `Price unavailable`, and both warning records.
- Diagnostic authority: warning effects only call `observability.log`; they never invoke card navigation or any execution callback.
- Diagnostic privacy: contexts contain stable codes, position/pool IDs, range status, alert state, and invalid reason where relevant, but never wallet address, wallet label, or raw invalid numeric values.
- Effect behavior: warnings emit when their classified state mounts or changes; remount/Strict Mode duplicates are permitted, and unchanged rerenders do not create a custom exact-once business guarantee.

## Task 1: Make alert-first status presentation exhaustive

**Files:**

- Modify: `packages/ui/src/components/PositionCardUtils.test.ts` (`getStatusChipProps` and `getBreachSide` describe blocks only)
- Modify: `packages/ui/src/components/PositionCardUtils.ts` (`StatusChipInput`, status derivation, and alert inconsistency helper only)

**Invariants to test first:**

- `returns Action needed for hasAlert + in-range even when nearEdge is true`
- `classifies only hasAlert + in-range as position_alert_in_range`
- `keeps alert + in-range directionless`
- `preserves the complete alert and non-alert status matrix`

- [ ] **Step 1: Add failing matrix and diagnostic tests.** Extend only the existing status and breach-side sections with table-driven cases. Introduce an expectation for a pure helper named `getStatusDiagnosticCode`:

```ts
it.each([
  ['below-range', true, false, 'Breach · below', 'breach'],
  ['above-range', true, false, 'Breach · above', 'breach'],
  ['in-range', true, false, 'Action needed', 'warn'],
  ['in-range', true, true, 'Action needed', 'warn'],
  ['below-range', false, true, 'Below range', 'warn'],
  ['above-range', false, true, 'Above range', 'warn'],
  ['in-range', false, true, 'Near edge', 'warn'],
  ['in-range', false, false, 'In range', 'safe'],
] as const)(
  'maps %s alert=%s nearEdge=%s to %s',
  (rangeStatusKind, hasAlert, nearEdge, label, tone) => {
    expect(getStatusChipProps({ rangeStatusKind, hasAlert, nearEdge })).toEqual({ label, tone });
  },
);

it('classifies only hasAlert + in-range as position_alert_in_range', () => {
  expect(
    getStatusDiagnosticCode({ rangeStatusKind: 'in-range', hasAlert: true, nearEdge: true }),
  ).toBe('position_alert_in_range');
  expect(
    getStatusDiagnosticCode({ rangeStatusKind: 'below-range', hasAlert: true, nearEdge: false }),
  ).toBeUndefined();
  expect(
    getStatusDiagnosticCode({ rangeStatusKind: 'in-range', hasAlert: false, nearEdge: true }),
  ).toBeUndefined();
});
```

- [ ] **Step 2: Run the focused test and confirm it fails because the in-range alert still falls through and the diagnostic helper is absent.**

Run: `pnpm --filter @clmm/ui exec vitest run src/components/PositionCardUtils.test.ts`

Expected: FAIL in the new `Action needed` cases and for missing `getStatusDiagnosticCode`.

- [ ] **Step 3: Add the minimal alert-first branch and pure diagnostic helper.** Evaluate all alert branches before ordinary range/near-edge branches and do not alter `getBreachSide`:

```ts
export type StatusDiagnosticCode = 'position_alert_in_range';

export function getStatusDiagnosticCode({
  rangeStatusKind,
  hasAlert,
}: StatusChipInput): StatusDiagnosticCode | undefined {
  return hasAlert && rangeStatusKind === 'in-range' ? 'position_alert_in_range' : undefined;
}

export function getStatusChipProps(input: StatusChipInput): StatusChipProps {
  const { rangeStatusKind, hasAlert, nearEdge } = input;
  if (hasAlert && rangeStatusKind === 'below-range') {
    return { tone: 'breach', label: 'Breach · below' };
  }
  if (hasAlert && rangeStatusKind === 'above-range') {
    return { tone: 'breach', label: 'Breach · above' };
  }
  if (hasAlert) return { tone: 'warn', label: 'Action needed' };
  if (rangeStatusKind === 'in-range') {
    return nearEdge ? { tone: 'warn', label: 'Near edge' } : { tone: 'safe', label: 'In range' };
  }
  return rangeStatusKind === 'below-range'
    ? { tone: 'warn', label: 'Below range' }
    : { tone: 'warn', label: 'Above range' };
}
```

- [ ] **Step 4: Verify the scoped helper behavior and lint only the changed files.**

Run: `pnpm --filter @clmm/ui exec vitest run src/components/PositionCardUtils.test.ts`

Expected: PASS with every matrix row and the directionless alert test green.

Run: `pnpm --filter @clmm/ui exec eslint src/components/PositionCardUtils.ts src/components/PositionCardUtils.test.ts`

Expected: PASS with no lint errors.

- [ ] **Step 5: Commit the independently usable status derivation.**

```bash
git add packages/ui/src/components/PositionCardUtils.ts packages/ui/src/components/PositionCardUtils.test.ts
git commit -m "fix(ui): preserve in-range alert visibility"
```

## Task 2: Build a fail-closed RangeBar display model

**Files:**

- Create: `packages/ui/src/components/RangeBarUtils.ts`
- Create: `packages/ui/src/components/RangeBarUtils.test.ts`

**Invariants to test first:**

- `returns field-specific non-finite reasons in validation order`
- `rejects zero and negative required prices`
- `rejects equal and inverted bounds`
- `fails closed when finite inputs overflow the visual domain`
- `keeps valid lower midpoint upper and out-of-domain prices available`
- `clamps only finite derived marker percentages`
- `returns an available marker at exactly 50 percent for a genuine midpoint`

- [ ] **Step 1: Create focused failing tests for every reason and valid coordinate class.** Use table cases for `NaN`, positive infinity, and negative infinity in each field; zero/negative values in each field; equal/inverted bounds; `Number.MAX_VALUE` overflow; lower/midpoint/upper; and far-below/far-above current prices. Assert the exact union shape and exact reason strings rather than merely checking truthiness:

```ts
expect(
  buildRangeBarDisplayState({ currentPrice: 150, lowerBoundPrice: 100, upperBoundPrice: 200 }),
).toMatchObject({ kind: 'available', markerPercent: 50 });

expect(
  buildRangeBarDisplayState({ currentPrice: Number.NaN, lowerBoundPrice: 0, upperBoundPrice: 0 }),
).toEqual({ kind: 'unavailable', reason: 'current_price_non_finite' });

expect(
  buildRangeBarDisplayState({
    currentPrice: Number.MAX_VALUE,
    lowerBoundPrice: 1,
    upperBoundPrice: Number.MAX_VALUE,
  }),
).toEqual({ kind: 'unavailable', reason: 'derived_percentage_non_finite' });
```

- [ ] **Step 2: Run the new test and confirm it fails because the module does not exist.**

Run: `pnpm --filter @clmm/ui exec vitest run src/components/RangeBarUtils.test.ts`

Expected: FAIL with module-not-found or missing-export errors.

- [ ] **Step 3: Implement the discriminated model with the fixed validation order.** Keep constants and numeric helpers private; never return a midpoint fallback:

```ts
export type RangeBarUnavailableReason =
  | 'current_price_non_finite'
  | 'lower_price_non_finite'
  | 'upper_price_non_finite'
  | 'current_price_non_positive'
  | 'lower_price_non_positive'
  | 'upper_price_non_positive'
  | 'bounds_not_ascending'
  | 'derived_percentage_non_finite';

export type RangeBarDisplayState =
  | {
      kind: 'available';
      bandLeftPercent: number;
      bandRightPercent: number;
      markerPercent: number;
    }
  | { kind: 'unavailable'; reason: RangeBarUnavailableReason };

export type RangeBarPriceInput = {
  currentPrice: number;
  lowerBoundPrice: number;
  upperBoundPrice: number;
};

const VISUAL_PAD_FRACTION = 0.35;

function finitePercent(price: number, lo: number, hi: number): number | undefined {
  const value = ((price - lo) / (hi - lo)) * 100;
  if (!Number.isFinite(value)) return undefined;
  return Math.min(100, Math.max(0, value));
}

export function buildRangeBarDisplayState(input: RangeBarPriceInput): RangeBarDisplayState {
  const { currentPrice, lowerBoundPrice, upperBoundPrice } = input;
  if (!Number.isFinite(currentPrice))
    return { kind: 'unavailable', reason: 'current_price_non_finite' };
  if (!Number.isFinite(lowerBoundPrice))
    return { kind: 'unavailable', reason: 'lower_price_non_finite' };
  if (!Number.isFinite(upperBoundPrice))
    return { kind: 'unavailable', reason: 'upper_price_non_finite' };
  if (currentPrice <= 0) return { kind: 'unavailable', reason: 'current_price_non_positive' };
  if (lowerBoundPrice <= 0) return { kind: 'unavailable', reason: 'lower_price_non_positive' };
  if (upperBoundPrice <= 0) return { kind: 'unavailable', reason: 'upper_price_non_positive' };
  if (upperBoundPrice <= lowerBoundPrice)
    return { kind: 'unavailable', reason: 'bounds_not_ascending' };

  const width = upperBoundPrice - lowerBoundPrice;
  const pad = width * VISUAL_PAD_FRACTION;
  const lo = lowerBoundPrice - pad;
  const hi = upperBoundPrice + pad;
  if (![width, pad, lo, hi].every(Number.isFinite) || hi <= lo) {
    return { kind: 'unavailable', reason: 'derived_percentage_non_finite' };
  }
  const bandLeftPercent = finitePercent(lowerBoundPrice, lo, hi);
  const bandRightPercent = finitePercent(upperBoundPrice, lo, hi);
  const markerPercent = finitePercent(currentPrice, lo, hi);
  if (bandLeftPercent == null || bandRightPercent == null || markerPercent == null) {
    return { kind: 'unavailable', reason: 'derived_percentage_non_finite' };
  }
  return { kind: 'available', bandLeftPercent, bandRightPercent, markerPercent };
}
```

- [ ] **Step 4: Verify every numeric branch and lint only the new helper files.**

Run: `pnpm --filter @clmm/ui exec vitest run src/components/RangeBarUtils.test.ts`

Expected: PASS for every invalid reason, deterministic precedence, overflow, clamping, and the exact midpoint.

Run: `pnpm --filter @clmm/ui exec eslint src/components/RangeBarUtils.ts src/components/RangeBarUtils.test.ts`

Expected: PASS with no lint errors.

- [ ] **Step 5: Commit the pure display model.**

```bash
git add packages/ui/src/components/RangeBarUtils.ts packages/ui/src/components/RangeBarUtils.test.ts
git commit -m "feat(ui): classify unavailable range bars"
```

## Task 3: Render RangeBar from the discriminated state

**Files:**

- Modify: `packages/ui/src/components/RangeBar.test.tsx`
- Modify: `packages/ui/src/components/RangeBar.tsx`
- Modify: `packages/ui/src/components/PositionCard.tsx` (RangeBar caller migration only)

**Invariants to test first:**

- `renders Price unavailable with accessible unavailable text and no authoritative elements`
- `renders a genuine midpoint with a tick and without unavailable copy`
- `renders directional breach decoration only for available states`
- `renders provided numeric labels only for available states`

- [ ] **Step 1: Rewrite the existing RangeBar tests around `displayState`.** Preserve available below/above and clamping assertions, replace the former collapsed/NaN/Infinity midpoint-fallback expectations with one unavailable branch assertion, and name all authoritative elements with stable test IDs:

```tsx
render(
  <RangeBar
    displayState={{ kind: 'unavailable', reason: 'current_price_non_finite' }}
    lowerBoundLabel="USDC 100.00"
    upperBoundLabel="USDC 200.00"
    currentPriceLabel="∞"
    breachSide="above"
  />,
);
expect(screen.getByText('Price unavailable')).toBeTruthy();
expect(screen.getByLabelText('Price range unavailable')).toBeTruthy();
expect(screen.queryByTestId('range-bar-tick')).toBeNull();
expect(screen.queryByTestId('range-bar-active-band')).toBeNull();
expect(screen.queryByTestId('range-bar-breach-above')).toBeNull();
expect(screen.queryByText('∞')).toBeNull();
```

- [ ] **Step 2: Run the focused renderer test and confirm the old numeric-prop component fails the new contract.**

Run: `pnpm --filter @clmm/ui exec vitest run src/components/RangeBar.test.tsx`

Expected: FAIL because `displayState` is not accepted and unavailable output does not exist.

- [ ] **Step 3: Change `RangeBarProps` to accept `displayState: RangeBarDisplayState`, delete `pricePercent`, `clampPercent`, and price calculations, and return a fixed-height unavailable branch before rendering available coordinates.** Reuse existing colors and typography:

```tsx
export type RangeBarProps = {
  displayState: RangeBarDisplayState;
  lowerBoundLabel: string;
  upperBoundLabel: string;
  currentPriceLabel: string;
  breachSide?: 'below' | 'above';
};

if (displayState.kind === 'unavailable') {
  return (
    <View
      testID="range-bar-unavailable"
      accessibilityLabel="Price range unavailable"
      style={{ paddingTop: 8, paddingBottom: 32, paddingHorizontal: 4 }}
    >
      <View style={{ height: TRACK_HEIGHT, backgroundColor: colors.border, borderRadius: 999 }} />
      <Text style={{ marginTop: 12, height: 14, color: colors.textTertiary }}>
        Price unavailable
      </Text>
    </View>
  );
}

const { bandLeftPercent, bandRightPercent, markerPercent } = displayState;
```

Add `testID="range-bar-active-band"` to the available band and use only the union's percentages for positioning. The unavailable branch must not access or render the supplied labels or `breachSide`.

- [ ] **Step 4: Migrate the only production caller in the same signature-changing task.** In `PositionCard.tsx`, import the helper, derive the model from the three raw prices, and replace the three numeric RangeBar props with `displayState`. Do not add effects or observability yet:

```tsx
const rangeBarDisplayState = buildRangeBarDisplayState({
  currentPrice,
  lowerBoundPrice,
  upperBoundPrice,
});

<RangeBar
  displayState={rangeBarDisplayState}
  lowerBoundLabel={lowerBoundLabel}
  upperBoundLabel={upperBoundLabel}
  currentPriceLabel={currentPriceLabel}
  {...(breachSide ? { breachSide } : {})}
/>;
```

- [ ] **Step 5: Verify the renderer branches, caller regression, and lint only the changed component files.**

Run: `pnpm --filter @clmm/ui exec vitest run src/components/RangeBar.test.tsx src/components/PositionCard.test.tsx`

Expected: PASS; unavailable has no authoritative elements, and valid midpoint/directional render cases remain distinct.

Run: `pnpm --filter @clmm/ui exec eslint src/components/RangeBar.tsx src/components/RangeBar.test.tsx src/components/PositionCard.tsx`

Expected: PASS with no lint errors.

- [ ] **Step 6: Commit the fail-closed renderer and its caller migration.**

```bash
git add packages/ui/src/components/RangeBar.tsx packages/ui/src/components/RangeBar.test.tsx packages/ui/src/components/PositionCard.tsx
git commit -m "fix(ui): hide invalid range visualization"
```

## Task 4: Wire structured diagnostics through composition and the position list

**Files:**

- Modify: `packages/ui/src/components/PositionCard.test.tsx`
- Modify: `packages/ui/src/components/PositionCard.tsx`
- Modify: `packages/ui/src/screens/PositionsListScreen.test.tsx`
- Modify: `packages/ui/src/screens/PositionsListScreen.tsx`
- Modify: `apps/app/src/composition/index.ts`
- Modify: `apps/app/app/(tabs)/positions.tsx`
- Modify: `apps/app/src/appShellDependencies.test.ts`

**Invariants to test first:**

- `logs position_alert_in_range with position and pool identity but no wallet data`
- `logs range_bar_input_invalid with the deterministic reason and safe state fields`
- `renders Action needed and Price unavailable together and emits both independent warnings`
- `does not log warnings for a normal available card`
- `keeps alert + in-range directionless and free of breach decoration`
- `does not log again on an unchanged rerender`
- `still calls only onPress when the card is tapped`
- `keeps loading distinct from a loaded card with unavailable prices`
- `passes the composed observability dependency from route to screen to every card`

- [ ] **Step 1: Add focused failing card tests with a narrow recording logger.** Update existing card renders to pass the required logger, then add assertions against exact warning calls. Clear the mock in `afterEach`:

```ts
const observability = { log: vi.fn() };

it('renders both warnings and logs safe structured contexts', () => {
  render(
    <PositionCard
      observability={observability}
      item={makeItem({ currentPrice: Number.NaN, hasAlert: true, rangeStatusKind: 'in-range' })}
    />,
  );
  expect(screen.getByText('Action needed')).toBeTruthy();
  expect(screen.getByText('Price unavailable')).toBeTruthy();
  expect(screen.queryByTestId('range-bar-tick')).toBeNull();
  expect(observability.log).toHaveBeenCalledWith(
    'warn',
    'Position card alert conflicts with range status',
    {
      code: 'position_alert_in_range',
      positionId: 'pos-1',
      poolId: baseItem.poolId,
      hasAlert: true,
      rangeStatusKind: 'in-range',
    },
  );
  expect(observability.log).toHaveBeenCalledWith(
    'warn',
    'Position card range visualization unavailable',
    {
      code: 'range_bar_input_invalid',
      reason: 'current_price_non_finite',
      positionId: 'pos-1',
      poolId: baseItem.poolId,
      rangeStatusKind: 'in-range',
      hasAlert: true,
    },
  );
});
```

Also inspect the serialized mock calls to assert that neither `walletAddress` nor any raw price field is present, verify no warnings for the base card, verify unchanged `rerender` call count, and retain the existing press-only assertion.

- [ ] **Step 2: Run the card test and confirm it fails on the missing dependency, unavailable state, and warning effects.**

Run: `pnpm --filter @clmm/ui exec vitest run src/components/PositionCard.test.tsx`

Expected: FAIL because `observability` is not accepted and warnings/display-state construction are absent.

- [ ] **Step 3: Make `PositionCard` log its already-built RangeBar model and status presentation from independent effects.** Import `useEffect` and `useMemo`, `ObservabilityPort` from `@clmm/application/public`, and `getStatusDiagnosticCode`. Require only the logger method, and memoize the display model introduced in Task 3 so an unchanged rerender does not create a new effect dependency:

```tsx
type PositionCardObservability = Pick<ObservabilityPort, 'log'>;

type Props = {
  item: PositionListItemViewModel;
  observability: PositionCardObservability;
  onPress?: () => void;
};

const rangeBarDisplayState = useMemo(
  () => buildRangeBarDisplayState({ currentPrice, lowerBoundPrice, upperBoundPrice }),
  [currentPrice, lowerBoundPrice, upperBoundPrice],
);
const statusDiagnosticCode = getStatusDiagnosticCode({ rangeStatusKind, hasAlert, nearEdge });

useEffect(() => {
  if (statusDiagnosticCode == null) return;
  observability.log('warn', 'Position card alert conflicts with range status', {
    code: statusDiagnosticCode,
    positionId: item.positionId,
    poolId,
    hasAlert,
    rangeStatusKind,
  });
}, [hasAlert, item.positionId, observability, poolId, rangeStatusKind, statusDiagnosticCode]);

useEffect(() => {
  if (rangeBarDisplayState.kind !== 'unavailable') return;
  observability.log('warn', 'Position card range visualization unavailable', {
    code: 'range_bar_input_invalid',
    reason: rangeBarDisplayState.reason,
    positionId: item.positionId,
    poolId,
    rangeStatusKind,
    hasAlert,
  });
}, [hasAlert, item.positionId, observability, poolId, rangeBarDisplayState, rangeStatusKind]);
```

Pass `displayState={rangeBarDisplayState}` to `RangeBar` and preserve the existing conditional `breachSide`; `getBreachSide(true, 'in-range')` must remain `undefined`.

- [ ] **Step 4: Prepare the large screen test file without splitting its established describe block.** Because the file exceeds 500 lines, avoid touching each test case independently: add one `recordingObservability` fixture and a local `TestPositionsListScreen` wrapper that injects it, then mechanically replace existing JSX uses with the wrapper. Add only two focused cases near the existing status/RangeBar cases: one proving a loaded invalid card receives/logs unavailable while loading shows no card warning, and one proving `Action needed` plus unavailable coexist. This is a supporting caller update in the same signature-changing task, not a standalone test-update task.

```tsx
const recordingObservability = { log: vi.fn() };

function TestPositionsListScreen(
  props: Omit<React.ComponentProps<typeof PositionsListScreen>, 'observability'>,
): JSX.Element {
  return <PositionsListScreen {...props} observability={recordingObservability} />;
}
```

Reset `recordingObservability.log` after each test. Do not refactor unrelated S/R, regime, policy, or financial-metric cases.

- [ ] **Step 5: Require and thread the same narrow logger through `PositionsListScreen` and `ConnectedPositionsList`.** Import only the public application type and pass the dependency unchanged:

```tsx
type PositionsListObservability = Pick<ObservabilityPort, 'log'>;

type Props = {
  observability: PositionsListObservability;
  // existing props unchanged
};

<PositionCard
  item={item}
  observability={observability}
  onPress={() => onSelectPosition?.(item.positionId)}
/>;
```

The disconnected, loading, error, empty, partial-data, and loaded-list branches remain otherwise unchanged.

- [ ] **Step 6: Add production composition and route wiring plus a static guard test.** Construct the existing adapter only in the approved composition entrypoint, export it under the narrow operational name, import that export in the positions route, and pass it to the screen:

```ts
import { TelemetryAdapter } from '@clmm/adapters/src/outbound/observability/TelemetryAdapter';

export const positionCardObservability = new TelemetryAdapter();
```

```tsx
import { positionCardObservability } from '../../src/composition';

<PositionsListScreen observability={positionCardObservability} /* existing props */ />;
```

Extend only the `appShellDependencies.test.ts` positions wiring section to assert that composition contains `TelemetryAdapter` and `positionCardObservability`, while the route imports/passes `observability={positionCardObservability}`. Preserve the existing root-barrel prohibition.

- [ ] **Step 7: Run the scoped cross-boundary tests.**

Run: `pnpm --filter @clmm/ui exec vitest run src/components/PositionCard.test.tsx src/screens/PositionsListScreen.test.tsx`

Expected: PASS, including warning payload/privacy, coexistence, unchanged rerender, loading distinction, and existing list behavior.

Run: `pnpm --filter @clmm/app exec vitest run --config vitest.config.ts src/appShellDependencies.test.ts`

Expected: PASS, including approved deep-import composition and route injection guards.

- [ ] **Step 8: Lint only the files changed in this vertical slice.**

Run: `pnpm --filter @clmm/ui exec eslint src/components/PositionCard.tsx src/components/PositionCard.test.tsx src/screens/PositionsListScreen.tsx src/screens/PositionsListScreen.test.tsx`

Expected: PASS with no lint errors.

Run: `pnpm --filter @clmm/app exec eslint src/composition/index.ts 'app/(tabs)/positions.tsx' src/appShellDependencies.test.ts`

Expected: PASS with no lint errors.

- [ ] **Step 9: Commit the complete type-safe observability slice.**

```bash
git add packages/ui/src/components/PositionCard.tsx packages/ui/src/components/PositionCard.test.tsx packages/ui/src/screens/PositionsListScreen.tsx packages/ui/src/screens/PositionsListScreen.test.tsx apps/app/src/composition/index.ts 'apps/app/app/(tabs)/positions.tsx' apps/app/src/appShellDependencies.test.ts
git commit -m "feat(ui): report unsafe position card states"
```

# Validation commands

The implementation loop runs `pnpm -r typecheck` after every task; each task above is bounded so that gate remains green. After all implementation tasks, the dedicated validate phase must run the repository-required broad checks because the final change crosses UI, application-public typing, app composition, and adapter boundaries:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
```

Expected: every command exits zero. The focused task commands are the acceptance checks for task-local behavior; this final automatic phase is not an implementation task and must not be converted into one.

# Risk areas

- Floating-point subtraction and padding can overflow even for finite inputs; the helper must validate intermediates and the visual domain before calculating any percentage.
- React development Strict Mode and remounts may duplicate warnings. These records are diagnostic, at-least-once signals, not counters or execution events.
- Including the entire `rangeBarDisplayState` object in an effect dependency can re-run on ordinary rerenders if it is rebuilt each render. Use `useMemo` keyed by the three numeric inputs or depend on stable scalar `kind`/`reason` fields so the named unchanged-rerender test passes without claiming exact-once delivery across remounts.
- The screen test is already large. Limit edits to a dependency-injecting wrapper and the status/RangeBar cases; do not mix in unrelated test cleanup.
- Invalid numeric labels must not leak into unavailable UI or logs, since displaying them would undermine fail-closed presentation and JSON can coerce non-finite values misleadingly.
- The logger must enter the Expo shell only through `apps/app/src/composition/index.ts`; importing adapters directly from the route or UI violates repository boundaries.
- `Action needed` must stay neutral and directionless. No task may derive lower/upper direction outside `DirectionalExitPolicyService` or alter the release-blocker mapping.

# Stop conditions

- Stop if implementation appears to require changing application/domain range classification, trigger qualification, or directional exit policy; that is outside this issue and could violate the release-blocker invariant.
- Stop if `TelemetryAdapter` cannot be imported through the approved app composition entrypoint without adding an adapters dependency to UI or route code.
- Stop if a required logger signature cannot be made workspace-typecheck-clean in the same vertical task; do not land a port/caller mismatch or weaken the dependency to `any`.
- Stop if any unavailable branch still needs a fabricated numeric coordinate, cached price, zero, or midpoint to preserve layout; use a fixed non-authoritative placeholder instead.
- Stop if tests reveal the approved stable copy (`Action needed`, `Price unavailable`) or reason-code order conflicts with a newer repository contract; reconcile the contract before proceeding rather than inventing alternatives.
- Stop if unrelated pre-existing failures prevent distinguishing changed behavior after the focused tests pass; report the exact failing command and preserve the scoped evidence.

# Plan self-review

- Spec coverage: all acceptance criteria map to Tasks 1–4; no trigger/execution semantics or directional mapping changes are planned.
- Placeholder scan: the plan contains no deferred implementation placeholders; code steps define all new types, symbols, messages, codes, and dependency paths used later.
- Type consistency: `getStatusDiagnosticCode`, `RangeBarDisplayState`, `buildRangeBarDisplayState`, `observability`, and `positionCardObservability` use the same names and shapes throughout.
- Risk classification: the first-line review marker is required because Task 4 introduces observable warning side effects and effect re-emission behavior.

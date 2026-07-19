# Task Context: Task 4

Title: Wire structured diagnostics through composition and the position list

## Workspace & Scope Constraints

## WORKSPACE CONSTRAINTS

Your working directory is a dedicated git worktree with the repository's complete history. Run all commands from it. Do NOT cd to or read paths outside this directory — external-directory access is automatically rejected. git log, git diff, etc. work here directly.

.ai-orchestrator.local.json, if one exists, lives only in the main checkout and is intentionally not copied into your worktree — it is operator-machine-specific and not part of your task. Do not search for it or read it outside this directory. Reason about configuration using only .ai-orchestrator.json in your own working directory; treat it as the effective config for your task.

Working Directory: /home/gary/.openclaw/workspace/clmm-superpowers-v2/.ai-worktrees/issue-72
Repository: opsclawd/clmm-v2
Branch: ai/issue-72
Start Commit: 572b4b6664dc6ca14583b483060acbf48ef7c47e

## Task Requirements

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

## Repository Targets

### Expected Files

- packages/ui/src/components/PositionCard.test.tsx
- packages/ui/src/components/PositionCard.tsx
- packages/ui/src/screens/PositionsListScreen.test.tsx
- packages/ui/src/screens/PositionsListScreen.tsx
- apps/app/src/composition/index.ts
- apps/app/app/(tabs)/positions.tsx
- apps/app/src/appShellDependencies.test.ts

## Validation Commands

```bash
pnpm --filter @clmm/ui exec vitest run src/components/PositionCard.test.tsx src/screens/PositionsListScreen.test.tsx
pnpm --filter @clmm/app exec vitest run --config vitest.config.ts src/appShellDependencies.test.ts
pnpm --filter @clmm/ui exec eslint src/components/PositionCard.tsx src/components/PositionCard.test.tsx src/screens/PositionsListScreen.tsx src/screens/PositionsListScreen.test.tsx
pnpm --filter @clmm/app exec eslint src/composition/index.ts 'app/(tabs)/positions.tsx' src/appShellDependencies.test.ts
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **alert diagnostic privacy**: The inconsistent alert warning contains its stable code, position ID, pool ID, alert state, and range status without wallet or raw price data. (Test: `logs position_alert_in_range with position and pool identity but no wallet data`)
- **range invalidity diagnostic**: An unavailable RangeBar emits the stable invalid-input code, deterministic reason, safe identities, and relevant state fields. (Test: `logs range_bar_input_invalid with the deterministic reason and safe state fields`)
- **independent warning surfaces**: Alert inconsistency and RangeBar invalidity render and log independently when they coexist. (Test: `renders Action needed and Price unavailable together and emits both independent warnings`)
- **normal-state silence**: A normal card with valid prices and no inconsistent alert emits no warning. (Test: `does not log warnings for a normal available card`)
- **directional safety at integration boundary**: The integrated in-range alert remains directionless and has no breach decoration. (Test: `keeps alert + in-range directionless and free of breach decoration`)
- **stable effect dependencies**: Rerendering with unchanged classification and identities does not emit another warning within the same mount. (Test: `does not log again on an unchanged rerender`)
- **diagnostic non-authority**: Card interaction remains navigation-only and warning classification never invokes another callback. (Test: `still calls only onPress when the card is tapped`)
- **loading versus unavailable**: Screen loading renders no unavailable card warning, while a loaded invalid position renders and reports unavailable. (Test: `keeps loading distinct from a loaded card with unavailable prices`)
- **production dependency threading**: The existing telemetry adapter is created only in approved app composition and passed from the route through the screen to each card. (Test: `passes the composed observability dependency from route to screen to every card`)

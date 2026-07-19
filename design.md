# Alert Visibility and Fail-Closed RangeBar Design

## Summary

This change fixes two safety-relevant presentation defects on the positions list:

1. `hasAlert=true` combined with `rangeStatusKind="in-range"` currently falls through to the ordinary `In range` or `Near edge` chip, hiding an actionable alert.
2. `RangeBar` currently converts invalid inputs and invalid derived coordinates to `50%`, producing a credible-looking midpoint marker from data that cannot support one.

The proposed design keeps the change in the presentation path. It makes status precedence explicit, converts RangeBar calculation into a fail-closed discriminated result, renders an unavailable branch with no marker, and reports both inconsistency classes through the existing `ObservabilityPort`. It does not change range classification, trigger qualification, directional exit policy, preview creation, approval, signing, or execution.

## Why This Matters

The positions list is operational UI, not merely an analytics display. Hiding an actionable alert can delay a user's response to a qualified trigger. Fabricating a centered marker can make corrupt or unavailable financial data appear healthy and precise. Both defects violate the product's safety posture: the UI must preserve higher-priority operational state and must expose uncertainty rather than inventing a plausible value.

The issue is especially important because the current types alone do not make the rendering path safe. `PositionSummaryDto` uses plain `number` fields, and `isPositionSummaryRecord` validates finite lower and upper bounds but does not validate `currentPrice`, positivity, or bound ordering. Even if upstream producers normally emit good data, the component remains a necessary defensive boundary for direct use, malformed runtime values, and future contract drift.

## Current Code Analysis

- `packages/ui/src/components/PositionCardUtils.ts` owns pure display derivations. `getStatusChipProps` handles alert-plus-below and alert-plus-above first, but has no alert-plus-in-range branch. The latter therefore reaches normal in-range presentation.
- `isNearEdge` already follows the repository's guard-first pattern: non-finite, out-of-range, zero-width, and inverted ranges return `false`.
- `packages/ui/src/components/RangeBar.tsx` contains private `pricePercent` and `clampPercent` helpers. Both use `50` as their non-finite fallback. The component also substitutes a width of `1` for invalid bounds, so malformed input still reaches an authoritative-looking visualization.
- `packages/ui/src/components/PositionCard.tsx` is the only production caller of `RangeBar`. It has the position and pool identities needed for diagnostics and already computes presentation-only card state.
- `packages/ui/src/screens/PositionsListScreen.tsx` builds list-item view models and renders cards. The screen receives no observability dependency today.
- `ObservabilityPort` is an application-owned public contract with structured `log(level, message, context)` semantics. `TelemetryAdapter` is the existing implementation and emits structured JSON. The only approved app-to-adapter dependency seam is `apps/app/src/composition/index.ts`.
- The repository's issue #67 learning explicitly says derived UI state belongs in pure utilities, range predicates must fail safely, and alert/range branches require complete tests.

## Design Decisions and Alternatives

### Decision 1: preserve the existing range classification and fix presentation precedence locally

`hasAlert=true` is already the application's actionable-trigger signal. The UI will treat it as higher priority than a normal in-range label. For `hasAlert + in-range`, the chip becomes a neutral warning with the stable label `Action needed`. It must not infer `below` or `above`; `getBreachSide` remains `undefined` for this combination.

Directional alert behavior remains unchanged:

| Alert | Range status               | Chip                          |
| ----- | -------------------------- | ----------------------------- |
| yes   | below-range                | `Breach · below`, breach tone |
| yes   | above-range                | `Breach · above`, breach tone |
| yes   | in-range                   | `Action needed`, warning tone |
| no    | below-range                | `Below range`, warning tone   |
| no    | above-range                | `Above range`, warning tone   |
| no    | in-range and near edge     | `Near edge`, warning tone     |
| no    | in-range and not near edge | `In range`, safe tone         |

The warning tone is preferred over the breach tone for `Action needed` because no breach direction is known. Existing `Chip` tokens already provide a neutral warning treatment, so no new visual token or chip variant is needed.

Alternative considered: repair or reject the inconsistent state in the application/domain layer. This was rejected for this issue because an actionable trigger and a current range observation can legitimately diverge in time, and the issue explicitly excludes changing the canonical model and trigger semantics. Presentation must remain honest even when the two inputs disagree.

Alternative considered: map alert-plus-in-range to a directional breach using token order, price proximity, or a default side. This is prohibited. It would invent direction and risks violating the release-blocker directional invariant.

### Decision 2: represent RangeBar validity as a discriminated display model

Extract the numeric validation and coordinate calculation from `RangeBar.tsx` into a focused pure helper, preferably `RangeBarUtils.ts`. The helper returns exactly one of:

```ts
type RangeBarDisplayState =
  | {
      kind: 'available';
      bandLeftPercent: number;
      bandRightPercent: number;
      markerPercent: number;
    }
  | {
      kind: 'unavailable';
      reason: RangeBarUnavailableReason;
    };
```

`RangeBarUnavailableReason` uses stable machine-readable codes:

- `current_price_non_finite`
- `lower_price_non_finite`
- `upper_price_non_finite`
- `current_price_non_positive`
- `lower_price_non_positive`
- `upper_price_non_positive`
- `bounds_not_ascending`
- `derived_percentage_non_finite`

Validation order is the order above. When more than one input is invalid, the first matching reason is reported. This makes telemetry and tests deterministic without implying that later inputs are valid.

The available branch is created only after all three prices are finite and strictly positive and `upperBoundPrice > lowerBoundPrice`. The helper then computes the padded visual domain and all three percentages. If width, padding, visual-domain endpoints, or any derived percentage becomes non-finite or non-ascending because of overflow or floating-point collapse, the result is `derived_percentage_non_finite`. Clamping is allowed only for a finite percentage and continues to support genuine far-below and far-above prices at the track edges. No calculation function returns a midpoint fallback.

`PositionCard` builds this model once and passes it to `RangeBar` with the existing display labels. `RangeBar` becomes a renderer of an already-classified state; it cannot accidentally place a marker for an unavailable state.

Alternative considered: keep returning a number and use `null`, `undefined`, or `NaN` for invalid results. This is smaller but makes it easy for rendering code to coerce or default the value again, and it loses the reason needed for structured diagnostics.

Alternative considered: normalize invalid data to zero, a previous value, or a midpoint. This is rejected because all such values fabricate location. Missing or invalid is not zero.

### Decision 3: render a dedicated unavailable branch, not a degraded active chart

When `RangeBarDisplayState.kind === 'unavailable'`, `RangeBar` will:

- render no `range-bar-tick` marker;
- render no current-price label positioned on the track;
- render no active in-range band or directional breach decoration;
- render a muted, disabled track or equivalent fixed-height placeholder using existing surface, border, and tertiary-text tokens;
- show stable copy `Price unavailable`;
- expose stable accessibility text such as `Price range unavailable`;
- retain approximately the current component height so card layout does not jump.

The unavailable branch does not reuse raw labels. If a numeric input is invalid, continuing to display a formatted current or bound label beside a disabled chart could imply that the value is authoritative. A genuine midpoint remains in the available branch and renders a marker at `50%`, which makes it behaviorally distinct from unavailable.

Loading remains a screen-level state. A loading positions screen does not render cards or `Price unavailable`; an unavailable RangeBar appears only after a position has loaded. No new loading prop is added to `RangeBar`.

### Decision 4: report diagnostics through the existing observability seam

The UI will consume a narrow logger typed from the public application contract, such as `Pick<ObservabilityPort, 'log'>`. Production composition will instantiate or export the existing `TelemetryAdapter` from the approved `apps/app/src/composition/index.ts` entrypoint, and the positions route will pass it to `PositionsListScreen`, which passes it to each `PositionCard`.

`PositionCard` is the reporting boundary because it has both the pure classification results and non-wallet identities. Effects, rather than render-time calls, emit warnings when a classified warning state is mounted or changes. The two warnings are independent, so a card with alert-plus-in-range and invalid prices emits both and renders both `Action needed` and `Price unavailable`.

Suggested structured events:

```text
level: warn
message: Position card alert conflicts with range status
context: {
  code: "position_alert_in_range",
  positionId,
  poolId,
  hasAlert: true,
  rangeStatusKind: "in-range"
}

level: warn
message: Position card range visualization unavailable
context: {
  code: "range_bar_input_invalid",
  reason,
  positionId,
  poolId,
  rangeStatusKind,
  hasAlert
}
```

Wallet addresses, wallet labels, and other wallet metadata are not logged. Raw non-finite values are also omitted because JSON serialization can collapse them to `null`; the field-specific reason code carries the useful diagnostic class. Repeated mounts may produce repeated warning records, so these events are diagnostic signals rather than exact-once business events.

Alternative considered: call `console.warn` directly inside UI helpers. This was rejected because pure helpers should remain side-effect free and the repository already has a structured application port and adapter.

Alternative considered: send a new telemetry request to the backend. This would add a new network contract and infrastructure outside the issue's scope. The existing telemetry adapter is sufficient for the requested structured warning/logging behavior.

## Proposed Component and Data Flow

1. The existing BFF and client API return `PositionSummaryDto` values unchanged.
2. `buildPositionListViewModel` continues mapping stable DTO fields without changing domain or application contracts.
3. `PositionCard` derives the status-chip presentation through the pure status helper. Alert branches are evaluated before near-edge and normal branches.
4. `PositionCard` derives `RangeBarDisplayState` through the pure range helper.
5. `PositionCard` reports any status inconsistency and range-unavailable reason through the injected observability logger in effects.
6. `RangeBar` renders either the authoritative available visualization or the explicit unavailable branch. The union prevents shared rendering code from accessing a marker percentage in the unavailable case.
7. Card press behavior remains navigation-only. Neither classification nor logging invokes any execution use case.

The precedence is therefore applied without coupling the two surfaces:

- Alert state controls the chip first and always remains visible.
- Price validity controls whether RangeBar is authoritative.
- Directional breach, near-edge, and ordinary in-range presentation are used only in their existing valid contexts.
- Alert and RangeBar unavailability may coexist; neither suppresses the other.

RangeBar invalidity does not rewrite the application-provided range classification. For example, a non-alerting `below-range` position with invalid prices retains its `Below range` chip while the RangeBar says `Price unavailable`; the warning supersedes the chart, not the independently supplied status. This is the narrow interpretation of the issue's statement that chip status and RangeBar availability are separate concerns.

## Expected File-Level Changes

- `packages/ui/src/components/PositionCardUtils.ts` and its tests: add the alert-plus-in-range status branch and diagnostic code/result.
- `packages/ui/src/components/RangeBarUtils.ts` and focused tests: add validation, reason classification, finite coordinate calculation, and the available/unavailable union.
- `packages/ui/src/components/RangeBar.tsx` and its tests: render from the discriminated state and add unavailable/accessibility behavior.
- `packages/ui/src/components/PositionCard.tsx` and its tests: build both presentations, emit structured warnings through the injected logger, and prove alert/unavailable coexistence.
- `packages/ui/src/screens/PositionsListScreen.tsx` and its tests: accept and pass the observability dependency without changing list state behavior.
- `apps/app/src/composition/index.ts`: expose the existing telemetry adapter through the approved composition seam.
- `apps/app/app/(tabs)/positions.tsx` and relevant shell/composition tests: inject observability into the screen.

No changes are proposed to `packages/domain`, application DTOs/use cases, position controllers, trigger repositories, execution code, or directional exit policy.

## Testing Strategy

Pure status tests cover the complete alert/range matrix:

- alert plus below, above, and in-range;
- no alert plus below and above;
- no alert plus in-range near-edge and ordinary in-range;
- alert precedence over `nearEdge=true`;
- alert-plus-in-range yields `Action needed` and the inconsistency diagnostic without a breach side.

Pure RangeBar tests cover:

- `NaN`, positive infinity, and negative infinity for each required price field;
- zero and negative current, lower, and upper prices;
- equal and inverted bounds;
- overflow or another non-finite derived-percentage case;
- valid lower, midpoint, upper, far-below, and far-above values;
- finite clamping at track edges;
- exact midpoint remains available with a `50%` marker.

Component tests cover:

- unavailable renders `Price unavailable` and accessibility text;
- unavailable has no tick, current label, active band, or breach decoration;
- available midpoint has a tick and does not show unavailable copy;
- directional below/above alert styling remains unchanged for valid data;
- `Action needed` and `Price unavailable` render together when both conditions exist;
- the card's accessibility label includes `Action needed` for the inconsistent alert state;
- each warning carries its stable code, position ID, pool ID, and relevant state, with no wallet address;
- a normal card emits no warning;
- clicking the card still only calls `onPress`.

Screen/route tests cover:

- the production route supplies the composed observability dependency;
- loading remains distinct from unavailable;
- existing disconnected, error, empty, partial-data, and loaded-list behavior is unchanged.

Implementation verification should use the narrow UI and app tests during development, followed by `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm boundaries`, and `pnpm test` because the observability injection crosses UI, app shell, and adapter composition boundaries.

## Assumptions

- `hasAlert` continues to mean that an actionable trigger already exists; this issue does not re-qualify it.
- `rangeStatusKind` remains the application's current derived range classification and may be temporally newer than the actionable trigger.
- All RangeBar price inputs are required to be strictly positive for this component, including the current price.
- `Action needed` is the approved stable copy for alert-plus-in-range, and the existing warning chip tone is the approved neutral-warning treatment.
- `Price unavailable` is the approved stable copy for every invalid input reason; reason-specific details belong in telemetry, not user copy.
- Position and pool IDs are acceptable diagnostic identifiers; wallet addresses are unnecessary and must not be included.
- The existing `TelemetryAdapter` is safe for the Expo client because it depends only on `console` and `Date`, and its use is wired only through the approved composition entrypoint.
- Diagnostic warnings are at-least-once per mounted warning state, not exact-once events.
- Invalid input rendering is a defensive UI concern even if upstream validation is strengthened later.

## In Scope

- Status-chip precedence and `Action needed` presentation.
- RangeBar input validation and derived-coordinate validation.
- A discriminated available/unavailable RangeBar rendering model.
- Disabled/unavailable UI, stable copy, test IDs, and accessibility text.
- Structured warnings through existing observability composition.
- Focused helper, component, screen, composition, and route tests.

## Explicitly Out of Scope

- Trigger qualification, debounce, breach episode, or alert lifecycle changes.
- Inferring a breach direction for alert-plus-in-range.
- Changes to the canonical position/range domain model or directional exit mapping.
- Repairing, caching, retrying, or substituting upstream price data.
- Creating previews, approvals, signatures, submissions, or execution attempts.
- Backend telemetry ingestion APIs or a new client analytics system.
- Broad position-card redesign or unrelated view-model cleanup.
- Changing financial metric behavior or market insight sections.

## Risks and Concerns

- **React effect duplication:** development Strict Mode or remounts can duplicate warnings. Consumers must not treat these logs as counters or execution events.
- **Validation drift:** `isNearEdge` and RangeBar validity both reason about prices. Keeping all authoritative RangeBar validity and coordinate logic in one helper reduces drift; tests must prove invalid values cannot reach an available model.
- **DTO validation gap:** list DTO runtime validation currently allows some values that the RangeBar contract rejects and does not validate `currentPrice`. The UI guard is intentional, but upstream validation may deserve a separate follow-up. Tightening it here could turn a recoverable per-card state into a whole-list fetch failure and is therefore out of scope.
- **Floating-point extremes:** finite inputs can still overflow during subtraction or padding. The derived-result guard must include intermediate values, not only final percentages.
- **Misleading residual labels:** retaining numeric labels in unavailable mode could undermine the fail-closed behavior. The unavailable branch should avoid presenting them as authoritative.
- **Observability wiring omission:** making the logger required at the production screen boundary and covering route composition in tests prevents a silent no-op in production.
- **Execution coupling:** diagnostic callbacks must expose only logging. They must not reuse alert acknowledgement, preview, approval, or execution handlers.
- **Directional invariant:** alert-plus-in-range must remain directionless. No UI helper may derive lower/upper breach direction from token order, proximity, or a fallback.

## Completion Criteria

The design is satisfied when every actionable alert has visible chip presentation, every invalid RangeBar input produces only the explicit unavailable state, both warnings can coexist, structured diagnostics identify the affected position/pool and reason without wallet data, and all trigger and execution semantics remain unchanged.

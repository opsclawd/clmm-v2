# fix: preserve alert visibility and fail closed on invalid RangeBar prices

## Summary

Resolve two edge-case display defects from the positions-list card redesign:

1. an actionable alert can be hidden by an `in-range` classification;
2. invalid/non-finite prices can render a plausible but fabricated centered RangeBar marker.

The product decisions are now fixed below. This issue is ready for implementation and may be enqueued in the issue-to-PR orchestrator.

## Decision 1: actionable alert takes precedence over normal in-range presentation

When `hasAlert === true` and `rangeStatusKind === "in-range"`, render a distinct neutral-warning status such as:

```text
Action needed
```

Do not render `In range` or `Near edge` for this combination.

This state is internally inconsistent or temporally divergent: an actionable trigger exists while the current derived range classification says the position is in range. The UI must preserve the operationally important alert rather than silently suppressing it.

### Required behavior

- `hasAlert=true` always produces an alert-visible presentation.
- When the range direction is known:
  - `hasAlert + below-range` retains the directional lower-breach presentation;
  - `hasAlert + above-range` retains the directional upper-breach presentation.
- When `hasAlert + in-range`, use a neutral `Action needed` state rather than inventing a breach direction.
- Emit structured warning telemetry or logging for the inconsistent `hasAlert + in-range` combination.
- Include position/pool identity and the relevant range/alert state in diagnostics, without exposing sensitive wallet data unnecessarily.
- Do not initiate execution merely because this inconsistent UI state exists. Execution remains governed by the existing trigger qualification, preview, approval, signing, and safety flow.

## Decision 2: invalid RangeBar inputs render unavailable, never centered

When any required RangeBar price input is invalid, do not calculate a percentage and do not place the marker at `50%`.

Render an explicit disabled/unavailable state with copy such as:

```text
Price unavailable
```

The current centered fallback is prohibited because it converts corrupt or missing data into a credible-looking position.

### Invalid input rules

Treat the RangeBar as unavailable when any of the following is true:

- current price is `NaN`, positive/negative `Infinity`, or otherwise non-finite;
- lower price is non-finite;
- upper price is non-finite;
- any required price is zero or negative where the component contract requires positive prices;
- `upperPrice <= lowerPrice`;
- the derived percentage is non-finite after validation.

### Required unavailable presentation

- Hide the current-price marker rather than centering it.
- Render the track in a disabled/non-authoritative state or omit the active visualization, following existing UI conventions.
- Show `Price unavailable` or equivalent stable copy.
- Do not substitute zero, the midpoint, a previous unrelated value, or any other fabricated location.
- Emit structured warning telemetry or logging with a reason code for the invalid input class.
- Keep invalid/unavailable distinct from loading and from a genuine price located at the range midpoint.

## Display precedence

Apply status presentation in this order:

```text
1. Actionable alert
2. Invalid/unavailable data warning
3. Below-range or above-range state
4. Near-edge state
5. Normal in-range state
```

Clarification: the alert chip and RangeBar availability are separate concerns. A position may show `Action needed` while its RangeBar independently shows `Price unavailable` if alert state is present but price inputs are invalid.

## Scope

In scope:

- `getStatusChipProps` or the equivalent status-mapping logic;
- `pricePercent` and/or its validation boundary;
- `RangeBar` unavailable rendering;
- structured warning telemetry/logging through existing application conventions;
- focused unit/component tests;
- accessibility text affected by the unavailable state.

Out of scope:

- changing trigger qualification or breach debounce rules;
- creating or submitting execution attempts;
- repairing upstream price data;
- changing the canonical position/range domain model;
- broad redesign of the position card.

## Guardrails

- An actionable alert must never be silently hidden by a lower-priority display state.
- Invalid financial data must never be converted into a plausible visualization.
- Missing/invalid is not zero.
- A diagnostic warning is not execution authority.
- Reuse existing design tokens and telemetry infrastructure rather than creating parallel systems.

## Acceptance criteria

- [ ] `hasAlert=true + below-range` renders the existing directional lower-alert state.
- [ ] `hasAlert=true + above-range` renders the existing directional upper-alert state.
- [ ] `hasAlert=true + in-range` renders `Action needed` or the approved equivalent, never `In range` or `Near edge`.
- [ ] The inconsistent alert/in-range combination emits structured warning telemetry/logging.
- [ ] Non-finite current, lower, or upper prices never produce a centered marker.
- [ ] Zero/negative invalid prices and `upperPrice <= lowerPrice` render the unavailable state.
- [ ] Invalid RangeBar inputs hide the marker and show `Price unavailable` or the approved equivalent.
- [ ] Loading, unavailable, genuine midpoint, below-range, in-range, and above-range states remain behaviorally distinct.
- [ ] Alert presentation and RangeBar unavailability can coexist without one suppressing the other.
- [ ] Tests cover `NaN`, positive/negative `Infinity`, zero/negative values, inverted/equal bounds, genuine midpoint, and every alert/range-status combination.
- [ ] No execution behavior or trigger-qualification semantics change in this issue.

## Context

Follow-up from the positions-list card redesign review in #67.

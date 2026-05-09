# Regime Threshold Formatting Design

## Source

GitHub issue: https://github.com/opsclawd/clmm-v2/issues/86

## Goal

Fix the Regime card freshness threshold labels so they are directly comparable to the latest candle age. The card currently shows latest candle age in minutes, but rounds freshness thresholds into whole hours. That makes a correct hard-stale classification appear contradictory when a 90-minute threshold renders as `2h`.

The UI should render Regime freshness thresholds as exact minute labels:

```text
Latest candle: 110m old
Soft stale threshold: 75m
Hard stale threshold: 90m
```

## Scope

In scope:

- Update Regime freshness threshold formatting in `packages/ui/src/view-models/RegimeViewModel.ts`.
- Keep formatting ownership in the Regime view model.
- Update Regime view-model tests to cover threshold labels for 75m, 90m, 120m, and 150m.
- Optionally cover rounding behavior around minute boundaries.

Out of scope:

- No adapter, DTO, component, domain, or execution-policy changes.
- No shared or general human-readable duration formatter.
- No changes to `packages/ui/src/components/RegimeSection.tsx`; it already renders precomputed freshness rows.
- No changes to `DirectionalExitPolicyService` or directional exit mapping.

## Design

Replace the existing Regime threshold formatter with a narrow helper in `RegimeViewModel.ts`:

```ts
function formatFreshnessThresholdSeconds(seconds: number): string {
  return `${Math.round(seconds / 60)}m`;
}
```

This helper is intentionally specific to Regime freshness thresholds. It does not format general durations, and it must not switch to hours or mixed units. The purpose is comparability with the existing latest-candle age label, which is formatted as `Xm old`.

`buildFreshnessRows` continues to own the expanded freshness rows:

- `Latest candle`
- `Soft stale threshold`
- `Hard stale threshold`

Only the threshold row values change. `RegimeSection.tsx` remains a thin renderer of view-model output.

## Expected Formatting

Required cases:

- `4500s -> 75m`
- `5400s -> 90m`
- `7200s -> 120m`
- `9000s -> 150m`

Optional rounding cases:

- `4529s -> 75m`
- `4531s -> 76m`

## Testing

Update `packages/ui/src/view-models/RegimeViewModel.test.ts` with a focused test that builds Regime view models using different `softStaleSeconds` and `hardStaleSeconds` values, then asserts the corresponding `expandedFreshnessRows` values.

The tests should verify:

- `softStaleSeconds = 4500` renders `75m`, not `1h`.
- `hardStaleSeconds = 5400` renders `90m`, not `2h`.
- `7200` renders `120m`.
- `9000` renders `150m`.
- Optional: second rounding behavior follows `Math.round(seconds / 60)`.

No component test is required for this change because `RegimeSection.tsx` renders the view-model rows without interpreting threshold values.

## Verification

Run the narrow UI checks after implementation:

```text
pnpm --filter @clmm/ui test -- RegimeViewModel
pnpm --filter @clmm/ui typecheck
```

If implementation stays limited to the view-model and its tests, full cross-package checks are not required for confidence. If the implementation touches any exported DTO, adapter, component, or app code, escalate verification to the broader repo checks from `AGENTS.md`.

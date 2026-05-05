# Positions List Card And Range Redesign Design

**Issue:** https://github.com/opsclawd/clmm-v2/issues/67
**Date:** 2026-05-05
**Status:** Approved for implementation planning

## Goal

Refresh `PositionsListScreen` to match the issue #67 design reference with a portfolio summary strip, redesigned position cards, real range bars, and reordered market sections.

This is a focused UI refresh. It must not change backend behavior, DTO contracts, trigger qualification, domain policy, adapter code, or the release-blocker directional exit mapping.

## Scope

In scope:

- Redesign the connected positions list layout.
- Add a local portfolio summary strip with placeholder values:
  - `Portfolio` -> `$24,812`
  - `Fees earned` -> `+$142.30`
- Redesign `PositionCard` with pair glyphs, truncated pool ID, status chip, range bar, and bottom metrics.
- Add a reusable `RangeBar` component.
- Use real bound fields from issue #66:
  - `lowerBoundPrice`
  - `upperBoundPrice`
  - `lowerBoundLabel`
  - `upperBoundLabel`
- Add local pure display helpers for chip mapping, near-edge calculation, pool ID formatting, glyph selection, monitoring text/color, and placeholder metric lookup.
- Render sections in this order for connected wallets with positions:
  1. Portfolio summary
  2. Position cards
  3. Support & Resistance
  4. Market Thesis
- Make the smallest targeted `MarketContextPanel` change needed for this ordering.
- Update tests for the new layout, status labels, and ordering.

Out of scope:

- Backend, API, adapter, application DTO, domain, trigger qualification, and exit-policy changes.
- Moving temporary placeholder KPI values into `PositionListViewModel`.
- Moving display-only chip state into `PositionListViewModel`.
- Full decomposition of market context into independent market section components. That remains follow-up story #70 unless the existing wrapper blocks issue #67.

## Architecture

All changes stay in `packages/ui`.

`PositionsListScreen` keeps the existing flow:

1. Receive `PositionSummaryDto[]`.
2. Build `PositionListViewModel` with `buildPositionListViewModel`.
3. Render the existing disconnected, loading, error, empty, partial-data, and degraded-capability states.
4. Render the connected list when positions are available.

`PositionCard` must not receive raw DTOs. If it needs stable position data that is currently missing from the view model, expose that data explicitly through `PositionListItemViewModel`.

Two stable view-model additions are expected:

- `poolId`: needed for truncated pool ID display and placeholder metric lookup.
- `currentPrice`: needed for `RangeBar` tick positioning and near-edge calculation.

These are stable DTO-derived fields, not temporary placeholders or display-only chip state.

Temporary values remain local to the screen/card layer:

- Portfolio total.
- Fees earned.
- Per-card TVL.
- Per-card Fees 24h.
- Status chip label/tone.
- Near-edge state.

## Component Design

### Portfolio Summary Strip

Render a two-column strip above the positions section:

- Left card: label `Portfolio`, value `$24,812`.
- Right card: label `Fees earned`, value `+$142.30` using safe/positive color.

These values are local constants inside the UI layer. They are presentation placeholders and must not enter application DTOs or view models.

### PositionCard

The card layout follows `design/screens-a.jsx`:

Top row:

- Overlapping token pair glyph.
- Token pair label, for example `SOL / USDC`.
- Truncated pool ID, for example `Czfq...44zE`.
- Status chip aligned to the right.

Middle:

- `RangeBar` using real price bounds and labels from the list view model.
- Current price tick positioned by numeric `currentPrice`.

Bottom row:

- `TVL`
- `Fees 24h`
- `Monitor`

TVL and Fees 24h are local placeholders. Prefer stable lookup keyed by `poolId` or `positionId`, with deterministic fallback values for tests and unknown fixtures.

Monitor uses the existing monitoring mapping:

| Existing value        | Display text |
| --------------------- | ------------ |
| `Monitoring Active`   | `Live`       |
| `Monitoring Degraded` | `Degraded`   |
| `Monitoring Inactive` | `Inactive`   |

### RangeBar

`RangeBar` is reusable and accepts display-ready values:

```ts
type RangeBarProps = {
  lowerBoundPrice: number;
  upperBoundPrice: number;
  currentPrice: number;
  lowerBoundLabel: string;
  upperBoundLabel: string;
  currentPriceLabel: string;
  breachSide?: 'below' | 'above';
};
```

Behavior:

- Extend the visual domain beyond both bounds so the in-range band sits in the middle of the track.
- Render out-of-range shading on both sides.
- Render the in-range band between lower and upper prices.
- Render a current price tick.
- Clamp the tick to the track if current price is far outside the visual domain.
- Use breach styling only when `breachSide` is present.
- Render lower/current/upper labels below the track.

The UI must not re-derive tick-to-price values. It only consumes price-space fields already produced by the application layer.

### Pair Glyph And Pool Formatting

Add local pure helpers:

- Split `poolLabel` like `SOL / USDC` into token symbols for glyphs.
- Fall back safely if the label is malformed.
- Format pool IDs as first four characters, ellipsis, and last four characters when long enough.

The glyph is a simple display atom, not a token-brand asset.

## Status Mapping

Status chip logic stays local to `PositionCard` or nearby display helpers.

Near edge threshold:

- Compute only for in-range positions.
- A position is near edge when current price is within 10% of total range width from either bound.
- Total range width is `upperBoundPrice - lowerBoundPrice`.
- If the range width is zero, negative, or non-finite, do not mark near edge.

Mapping:

| Condition                                              | Chip tone | Chip label       |
| ------------------------------------------------------ | --------- | ---------------- |
| `hasAlert=true` and `rangeStatusKind='below-range'`    | `breach`  | `Breach · below` |
| `hasAlert=true` and `rangeStatusKind='above-range'`    | `breach`  | `Breach · above` |
| `rangeStatusKind='in-range'` and near either bound     | `warn`    | `Near edge`      |
| `rangeStatusKind='in-range'` and not near either bound | `safe`    | `In range`       |
| `rangeStatusKind='below-range'` and no alert           | `warn`    | `Below range`    |
| `rangeStatusKind='above-range'` and no alert           | `warn`    | `Above range`    |

`Near edge` never applies to out-of-range positions. Non-actionable out-of-range states remain `Below range` or `Above range`. Actionable out-of-range states become `Breach · below` or `Breach · above`.

## Market Section Ordering

Current market rendering combines Market Thesis and Support & Resistance in `MarketContextPanel`, with thesis first. Issue #67 requires Support & Resistance before Market Thesis, after the position cards.

Use the smallest change that achieves the visible requirement:

- Preserve existing loading, unavailable, unsupported, mixed-pool, degraded, and cached-data behavior.
- Render the combined market context after position cards.
- Change the rendered order inside the panel so `SrLevelsCard` appears before `MarketThesisCard`.

Do not fully decompose `MarketContextPanel` unless the existing wrapper blocks the required ordering. Full independent section decomposition is follow-up story #70.

## Error Handling

Keep existing screen state behavior:

- Disconnected wallets show `ConnectWalletEntry`.
- Loading connected wallets show the loading state.
- Fatal position load errors with no positions show the error state.
- Background refetch errors do not replace already loaded positions.
- Empty connected wallets show the empty state.
- Partial-data warnings render above the connected content when provided.
- Degraded capability banners remain at the top.
- S/R unsupported, loading, error, cached-data, and mixed-pool states remain non-blocking for the positions list.

`RangeBar` should degrade gracefully when numeric inputs are malformed: avoid crashes and render stable labels where possible. Invalid numeric inputs should not produce misleading near-edge or breach state.

## Testing

Update `PositionsListScreen.test.tsx` and focused component tests where useful.

Required assertions:

- Disconnected wallet state still renders connect-wallet entry.
- Loading state still hides market context and positions.
- Empty state still hides market context and positions.
- Background refetch error keeps rendering existing cards.
- Partial-data warning still renders alongside cards.
- Degraded and unsupported S/R states still render correctly and do not block cards.
- Mixed-pool unavailable message still renders.
- Tap selection still calls `onSelectPosition` with the position ID.
- Summary strip renders `Portfolio`, `$24,812`, `Fees earned`, and `+$142.30`.
- Section ordering is summary strip, active positions/cards, Support & Resistance, Market Thesis.
- Status chips render:
  - `In range`
  - `Near edge`
  - `Below range`
  - `Above range`
  - `Breach · below`
  - `Breach · above`
- `Near edge` only applies to in-range positions within 10% of total range width from either bound.
- Non-actionable out-of-range positions are not labeled `Near edge`.
- `RangeBar` renders lower, current, and upper labels from view-model fields.

Validation planned for implementation:

- `pnpm typecheck`
- `pnpm test`
- `pnpm boundaries`

Run narrower UI tests during development as needed, then run the listed checks before claiming implementation completion.

## Boundaries And Invariants

Do not touch:

- `packages/domain`
- `packages/application` DTO contracts or application package code
- `packages/ui` behavior outside the stable list view-model fields needed by the card
- `packages/adapters`
- `apps/app` API validation
- Trigger qualification logic
- Directional exit policy logic

The release-blocker directional mapping remains untouched:

```text
LowerBoundBreach -> RemoveLiquidity -> CollectFees -> Swap SOL->USDC -> ExitToUSDC posture
UpperBoundBreach -> RemoveLiquidity -> CollectFees -> Swap USDC->SOL -> ExitToSOL posture
```

This feature is presentation work only.

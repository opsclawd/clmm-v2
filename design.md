# Authoritative Financial Metrics for the Positions Experience

**Issue:** #94 — remove fabricated portfolio and position-card financial metrics  
**Status:** Design only  
**Affected area:** positions list read model and UI

## Problem and why it matters

The connected positions screen currently presents invented financial values as if they were facts:

- `PortfolioSummaryStrip.tsx` hard-codes `$24,812` and `+$142.30`.
- `PositionCardUtils.ts` hashes a pool ID into one of three plausible TVL and 24-hour-fee pairs.
- `PositionCard.tsx` renders those generated labels with the same typography and positive color treatment that real financial data would receive.

This is a P0 trust and correctness defect. A user cannot distinguish a missing measurement from a real dollar amount, and the values can influence financial decisions despite having no source, observation time, or defined scope.

The correction must do more than replace the current constants with different placeholders. It must preserve four distinct states:

1. The positions request is still loading.
2. The request completed but a metric is unavailable.
3. An authoritative metric is exactly zero.
4. An authoritative non-zero metric is available.

Missing data must never be converted to zero, included in a total, or inferred from another field with weaker semantics.

## Repository findings

The existing data path is:

```text
Orca position read adapter
  -> SupportedPositionReadPort
  -> listSupportedPositions
  -> PositionController GET /positions/:walletId
  -> apps/app fetchSupportedPositions
  -> PositionsListScreen
  -> PositionListViewModel
  -> PortfolioSummaryStrip / PositionCard
```

Relevant findings from that path:

- `PositionSummaryDto` contains price, bounds, fee-rate, range, alert, and monitoring fields, but no portfolio value, pool TVL, or trailing fee metrics.
- `listSupportedPositions` fetches position identities and pool metadata only. It does not fetch position details or token price quotes.
- `PoolData.liquidity` is the Whirlpool's raw concentrated-liquidity scalar. It is not a USD TVL and must not be formatted or relabeled as one.
- `PositionDetailDto.unclaimedFees` represents currently claimable fees. It is not lifetime fees earned or historically collected fees, and it is not fetched by the list use case.
- `GetPositionDetail` currently uses `0` for USD enrichment when price quotes are unavailable. That behavior is a separate risk and makes `unclaimedFees.totalUsd` unsafe to reuse as an authoritative aggregate without first fixing its availability semantics.
- The read-model validator checks only a subset of `PositionSummaryDto`; any new available metric crossing HTTP needs explicit runtime validation.
- The screen already keeps initial loading separate from loaded content: while `positionsLoading` is true, neither the summary strip nor position cards render.
- The architecture requires UI to consume application-facing contracts only. No Orca, pricing, or adapter logic may be added to `packages/ui` or the Expo route.
- Product scope explicitly excludes a general portfolio analytics or performance-history implementation.

These findings mean there is no valid authoritative source to wire in this issue. The safe initial production behavior is to show unavailable metrics. The design adds a narrow, semantic contract so a later authoritative producer can populate them without changing UI meaning.

## Design decisions

### 1. Correct the semantics as well as the numbers

The summary labels should become:

- `Position value`, not `Portfolio`, because the product only covers supported Orca positions and must not imply wallet-wide holdings.
- `Unclaimed fees`, not `Fees earned`, because lifetime earned/collected fee history is outside the current read model and product scope.

The card labels should become:

- `Pool TVL`, making clear that the value is pool-wide rather than the value of this position.
- `Pool fees · 24h`, making the pool scope and time window visible.

This avoids retaining a misleading label even after the fabricated number is removed.

### 2. Use nullable, metric-specific application DTOs

Add a response-level application DTO for list financial metrics rather than scattering display strings through UI props or duplicating pool-wide values on every position:

```ts
type PositionListFinancialMetricsDto = {
  positionValue: PositionValueMetricDto | null;
  unclaimedFees: UnclaimedFeesMetricDto | null;
  poolsById: Readonly<Record<string, PoolFinancialMetricsDto>>;
};

type PoolFinancialMetricsDto = {
  tvl: PoolTvlMetricDto | null;
  fees24h: PoolFees24hMetricDto | null;
};
```

Each non-null metric is numeric and carries the metadata needed to justify its label:

| Metric         | Required fields and semantics                                                                                                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Position value | finite non-negative `valueUsd`; `valuedAtUnixMs`; source; included-assets declaration limited to principal token amounts in the returned supported positions; explicitly excludes wallet balances, fees, rewards, collected history, and P&L |
| Unclaimed fees | finite non-negative `valueUsd`; `valuedAtUnixMs`; source; basis fixed to currently claimable trading fees for the returned supported positions; excludes rewards and collected/lifetime history                                              |
| Pool TVL       | finite non-negative `valueUsd`; `observedAtUnixMs`; source; pool ID; scope fixed to the whole Orca pool                                                                                                                                      |
| Pool fees 24h  | finite non-negative `valueUsd`; source; pool ID; explicit `windowStartUnixMs` and `windowEndUnixMs` spanning the source's trailing 24-hour interval                                                                                          |

The types should be metric-specific rather than one generic `{ value, timestamp }` bag. That prevents a future caller from passing unclaimed fees into a lifetime-earned label or raw liquidity into a TVL slot.

`null` means the application has no authoritative value. Zero remains a valid non-null measurement. The UI must not accept preformatted dollar labels in these DTOs.

### 3. Keep metric scope aligned with the response

Portfolio/position aggregates belong once at response level. Pool metrics belong in a pool-ID keyed map because multiple positions may share the same pool. `PositionSummaryDto` remains focused on a position and does not duplicate pool data.

The positions HTTP success response becomes conceptually:

```ts
{
  positions: PositionSummaryDto[];
  financialMetrics: PositionListFinancialMetricsDto;
  warning?: string;
}
```

The application list result and controller should always emit `financialMetrics`, initially with both summary values `null` and each returned pool's TVL/24-hour fee values `null`. During a rolling deployment, a missing `financialMetrics` field from an older backend is normalized by the app client to the same all-unavailable structure. A malformed non-null metric is rejected rather than displayed.

This creates a truthful seam without adding a price provider, detail fan-out, accounting calculation, or market-data adapter in this issue.

### 4. Convert transport nullability into explicit UI state

The UI view model should not pass nullable numbers directly to components. It should map each value to a closed display union:

```ts
type FinancialMetricViewModel =
  | { kind: 'unavailable'; label: '—' }
  | { kind: 'available'; valueUsd: number; label: string };
```

Formatting rules:

- `null` or an omitted legacy field -> unavailable -> `—`.
- `0` -> available -> `$0.00`.
- A positive finite number -> available -> a consistently formatted USD value.
- Negative, `NaN`, or infinite values -> invalid input; do not render them as available.
- Unavailable text uses a neutral/tertiary color. Available values also use neutral text by default; green must not imply investment performance.
- No helper may coerce with patterns such as `value || 0`, `value ?? 0`, or sum only the known subset.

Initial request loading continues to use the screen's existing loading state, where summary and cards are absent. Once the positions request resolves, a missing metric is `unavailable`, not indefinitely `loading`. No separate metric spinner is introduced because metrics arrive in the same response.

`PositionListViewModel` receives the response-level metrics and looks up pool metrics by `poolId`. `PortfolioSummaryStrip` receives two display-state props. `PositionCard` receives its pool TVL and pool-fee display states as part of `PositionListItemViewModel`. Components render display state; they do not derive, total, fetch, or invent financial data.

### 5. Do not calculate totals in the UI

The summary strip renders only authoritative aggregate metrics supplied by the application response. It must not sum card metrics, position details, or the available subset of partially missing positions.

This is especially important because pool TVL is pool-wide and would be double-counted across positions, while unclaimed-fee USD values can be unavailable independently due to price data. If the application cannot assert completeness for an aggregate, the aggregate is `null`.

## Approaches considered

### Recommended: semantic response-level contract with unavailable defaults

This is the approach described above. It removes the trust defect immediately, preserves the existing visual structure, encodes metric scope and time semantics, and gives future authoritative producers a safe integration point. Its cost is a cross-layer contract change and updates to fixtures/validators, even though all production values begin unavailable.

### Alternative: UI-only replacement with em dashes

Delete the constants and placeholder helper, then hard-code `—` in both components. This has the smallest diff and fixes the immediate production deception. It was not selected because it has no application-owned path for the acceptance case where authoritative values are supplied; a later implementation could reintroduce ambiguous display strings or ad hoc component props.

### Alternative: derive values from existing pool/detail data

Fetch every position detail, fetch prices, sum unclaimed fees, and infer TVL from raw pool liquidity. This was rejected. It expands the list read path, adds RPC load and partial-failure complexity, creates new portfolio accounting, and still cannot produce authoritative lifetime fees or USD TVL from the fields currently available. It would violate both the issue guardrails and product scope.

### Alternative: remove all four metric surfaces

Removing the summary strip and the two card columns is truthful and simpler than showing unavailable values. It was not selected because the issue explicitly includes their presentation and authoritative-value behavior, and retaining stable locations makes absence visible rather than silently hiding a data-quality limitation. If product design later decides that persistent unavailable values add no value, removal can be a separate visual decision.

## Proposed data flow

1. `listSupportedPositions` builds the existing position summaries and a `PositionListFinancialMetricsDto` whose values are null because no authoritative producer exists today.
2. `PositionController` returns positions, financial metrics, and any existing warnings. Trigger enrichment remains unchanged.
3. `fetchSupportedPositions` validates available metric objects. Missing response-level metrics from an older server normalize to all-unavailable; invalid non-null objects fail closed.
4. The Expo route passes the entire positions result to `PositionsListScreen`; it performs no financial derivation.
5. `buildPositionListViewModel` maps null metrics to `unavailable`, formats valid numeric metrics, and looks up pool metrics by pool ID.
6. `PortfolioSummaryStrip` and `PositionCard` render only view-model labels and tones.
7. The existing initial loading, fatal error, partial warning, cached-position, disconnected, and empty states retain their current control flow.

## Expected code impact

The eventual implementation is expected to touch these focused areas:

- `packages/application/src/dto/index.ts`: metric-specific DTOs and the list response/read-model type.
- `packages/application/src/dto/validation.ts`: strict runtime validation for non-null metrics.
- `packages/application/src/use-cases/positions/ListSupportedPositions.ts`: explicit unavailable metrics; no new reads or calculations.
- `packages/adapters/src/inbound/http/PositionController.ts`: serialize the financial metrics alongside positions.
- `apps/app/src/api/positions.ts` and its tests: parse, validate, and legacy-normalize the response.
- `apps/app/app/(tabs)/positions.tsx`: pass through metrics only.
- `packages/ui/src/view-models/PositionListViewModel.ts`: map nullable DTOs to display unions and format USD values.
- `packages/ui/src/components/PortfolioSummaryStrip.tsx`: remove constants and accept display-state props.
- `packages/ui/src/components/PositionCard.tsx`: remove placeholder lookup and render view-model metrics.
- `packages/ui/src/components/PositionCardUtils.ts`: delete `CardPlaceholderMetrics`, the fallback deck, hash helper, and `getCardPlaceholderMetrics`; retain unrelated card helpers.
- Existing position fixtures and tests across application, adapter, app, and UI packages: add explicit unavailable metrics or use a shared factory.
- `docs/product-scope.md` (or an adjacent concise metrics-contract document): record the four metric definitions, sources, inclusions/exclusions, and time requirements.

No domain changes are needed. No external SDK or adapter documentation lookup is needed unless a later issue adds an actual authoritative data provider.

## Testing strategy

Tests should be organized around state semantics, not snapshot appearance.

### Application and transport

- The list use case returns explicit null metrics and never derives them from `PoolData.liquidity`.
- HTTP serialization preserves null and preserves exact zero in available metric objects.
- Runtime validation accepts finite non-negative zero/populated values with required metadata.
- Runtime validation rejects negative/non-finite values, missing source/timestamps, invalid windows, and pool-ID mismatches.
- A legacy response without `financialMetrics` normalizes to unavailable.
- A malformed non-null metric fails closed rather than becoming unavailable silently.

### View model and components

- Initial positions loading renders the existing loading state and no metric components.
- Null/missing metrics render `—` with unavailable styling.
- Exact zero renders `$0.00`, never `—`.
- Populated authoritative values render with consistent USD formatting.
- Available pool metrics are matched by pool ID, including multiple positions in one pool and positions in different pools.
- Summary aggregates are never computed from cards or the available subset.
- Unavailable fees do not use positive/green styling.
- The old values (`$24,812`, `+$142.30`, and all three generated fallback pairs) do not appear in production UI or fixtures.
- `getCardPlaceholderMetrics` has no production or test callers and its placeholder-specific tests are deleted.
- Existing disconnected, error, empty, warning, card-selection, status-chip, range-bar, and market-section-order tests continue to pass.

After implementation, run focused application/app/UI tests first, then the repository checks required for a cross-package contract change: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm boundaries`, and `pnpm test`.

## Assumptions

- There are no substantive issue comments beyond the issue description; `issue-comments.md` is empty.
- The current list path has no authoritative provider for any of the four displayed financial metrics.
- The initial shipped behavior after this fix may show `—` for all four metric classes. Truthful absence is preferable to a plausible estimate.
- The summary is intentionally narrowed from wallet-wide portfolio/lifetime performance to supported-position value and currently unclaimed fees.
- An authoritative future producer will supply complete aggregate values. The UI will not decide whether a partial aggregate is acceptable.
- Currency is USD for this issue; multi-currency formatting is out of scope.
- Financial values are non-negative amounts, not signed P&L. A negative value is invalid rather than rendered.
- Existing position response and screen loading behavior remains the only loading state; no independent metrics request is added.
- Backward compatibility with an older backend is handled only for an absent metrics block. Malformed claimed data is not tolerated.

## In scope

- Removal of all hard-coded/generated financial values and dead placeholder helpers.
- A nullable, source-aware application read contract for summary and pool metrics.
- Transport validation and pass-through needed by that contract.
- View-model representation and formatting for unavailable, zero, and populated metrics.
- Honest summary/card presentation and corrected labels.
- Tests covering loading, unavailable, zero, populated, malformed, and legacy-omitted states.
- Concise durable documentation of metric scope, source, inclusions/exclusions, and timing.

## Explicitly out of scope

- Adding an Orca analytics, indexer, pricing, or accounting adapter.
- Computing position principal value, wallet-wide portfolio value, P&L, lifetime fees, collected fees, yield, APR/APY, or performance history.
- Treating raw concentrated-liquidity units as USD TVL.
- Fetching every position detail from the list endpoint to synthesize aggregates.
- Intelligence-pipeline feature derivation.
- PairGlyph parsing/fallback behavior.
- Range, monitoring, trigger, preview, signing, execution, reconciliation, or directional-exit behavior.
- Domain-layer changes or changes to the release-blocker directional mapping.
- Broader visual redesign of the positions screen.

## Risks and concerns

### Contract rollout risk

The BFF and Expo client may deploy independently. Normalizing an absent metrics block to unavailable prevents an older backend from breaking the new client. The reverse direction is naturally safe because older clients ignore extra JSON fields. Available metric objects still require strict validation.

### Semantic drift risk

Names such as `liquidity`, `fees`, and `earned` are easy to overstate. Metric-specific DTOs, fixed labels, and required metadata are the primary defense. Raw values must never be relabeled at the controller or UI boundary.

### False-zero risk in existing detail enrichment

`GetPositionDetail` currently represents missing USD price enrichment as zero. This issue should not broaden into fixing the detail screen, but the new summary contract must not reuse those totals. A future producer of aggregate unclaimed-fee USD must first preserve price availability explicitly.

### Partial aggregate risk

Summing only positions with available prices would produce a plausible but incomplete total. Aggregate providers must return null unless they can meet the documented included-assets contract for the complete returned set.

### Stale-data risk

Every available metric carries observation or valuation time. This issue does not introduce a staleness threshold, so a future source must define freshness policy before being wired. Until then, no available values should be produced.

### UI utility coupling

`PositionCardUtils.ts` contains both valid card helpers and the placeholder generator. Removal must be surgical so status, breach-side, range-edge, monitoring, pool-format, and token-pair behavior remain unchanged.

### Scope pressure

The empty metric seam may invite adding an external analytics provider in the same change. That would materially increase reliability, caching, source-of-truth, and testing concerns and should be handled as a separately designed issue.

## Completion boundary

This issue is complete when production UI contains no fabricated financial values, unavailable values are explicit and distinct from loading and zero, authoritative contract values can render without semantic relabeling, dead placeholder code is gone, and metric semantics are documented. It does not require any metric to be populated in production today.

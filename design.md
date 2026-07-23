# PolicyInsight UI Delta Design Document (Issue #93)

## 1. Problem Being Solved and Why It Matters

Issue #93 requires completing the UI presentation for the canonical `PolicyInsight v1` contract. Pull Request #92 successfully centralized contract parsing and DTO mapping, ensuring that the frontend only ever receives validated view models. However, the UI component (`PolicyInsightsSection`) and its View-Model (`PolicyInsightsViewModel`) do not yet display several critical pieces of canonical data, nor do they fully implement the distinct presentation states (like `degraded` and `malformed`) required by the product rules.

Implementing this delta ensures users have the complete, accurate context—such as market regime, support/resistance levels, and evidence quality—needed to make informed manual exit decisions without relying on raw, confusing JSON dumps.

## 2. Key Design Decisions and Trade-offs

- **View-Model Centralization**: All formatting and conditional logic for the new fields will reside in `PolicyInsightsViewModel.ts`. The React component will only receive pre-formatted strings or boolean flags.
  - _Trade-off_: Slightly larger View-Model, but ensures the UI remains purely presentational and easily unit-testable.
- **Distinct `malformed` State**: The acceptance criteria demand that `malformed` and `upstream-error` be _distinct_ states. Currently, `CurrentPolicyInsightsAdapter` maps shape validation failures (supplied by #92) to `upstream-error`. We will update the adapter and port definitions to explicitly return a `malformed` kind.
  - _Trade-off_: Requires a minor change to the adapter boundary, but is necessary to fulfill the "distinct and tested" UI requirement without duplicating parsing logic.
- **Evidence Summary Conciseness**: Instead of displaying raw `bundleHash` or `referenceId` arrays, the UI will summarize the evidence (e.g., "Full evidence based on 3 sources").
  - _Rationale_: Aligns with the product rule "Do not dump raw evidence internals" while satisfying "selected evidence/bundle summary appropriate for a user".

## 3. Proposed Approach

### 3.1 View-Model Extensions (`PolicyInsightsViewModel.ts`)

Add the following to the view-model:

- `marketRegimeLabel`: Formatted string for `block.marketRegime`.
- `fundamentalRegimeLabel`: Formatted string for `block.fundamentalRegime`.
- `supportLevels` & `resistanceLevels`: Arrays of strings representing valid price levels. Empty levels will be filtered out.
- `evidenceSummary`: A concise string derived from `block.evidence.selectionStatus` and the lengths of `selectedBundleRefs`/`selectedSourceRefs`.
- `warningsList`: Array of human-readable warning strings mapped from `block.warnings` and `block.reasonCodes`.
- `isDegraded`: Boolean set to `true` if `selectionStatus` is `PARTIAL` or `DEGRADED`, or if `dataQuality` is not `COMPLETE`.

### 3.2 UI Component Updates (`PolicyInsightsSection.tsx`)

- **Layout**: Inject the new regimes and levels next to the existing `postureLabel` to keep market context grouped.
- **Missing Levels**: If `supportLevels` or `resistanceLevels` are empty, display "No eligible levels" or omit the line entirely. Never render `0` or `0.00`.
- **Degraded State**: If `vm.isDegraded` is true, apply a visual warning treatment (e.g., `colors.warn` text or a distinct border) alongside the `evidenceSummary`.
- **Unavailable Mapping**: Add support for the new `malformed` unavailable reason to the `unavailableCopy` helper, rendering a fail-closed message: "Policy insight payload was malformed."

### 3.3 Application Port & Adapter Updates

- **`PolicyInsightsUnavailableReason` & `PolicyInsightsReadResult`**: Add `'malformed'` to these types in `@clmm/application/public` and `@clmm/application/ports`.
- **`CurrentPolicyInsightsAdapter.ts`**: Update line 66 so that if `parsePolicyInsightBlock(body)` returns `null`, the adapter returns `{ kind: 'malformed' }` rather than `{ kind: 'upstream-error' }`.
- **`PolicyInsightsController` (BFF)**: Ensure the HTTP controller propagates the `malformed` state to the client payload.

## 4. Assumptions Made

1.  **Adapter modification is acceptable**: Modifying `CurrentPolicyInsightsAdapter` to return `malformed` is assumed to be within scope, as it's the only way to satisfy the AC requiring `malformed` and `upstream-error` to be strictly distinct without writing a second parser.
2.  **`PARTIAL` maps to Degraded**: The canonical DTO uses `FULL`, `PARTIAL`, and `DEGRADED` for `selectionStatus`. I assume `PARTIAL` should trigger the same visually degraded presentation state as `DEGRADED`.
3.  **Loading State Behavior**: I assume "Do not show stale placeholder values as current" means the UI should overlay a loading indicator or dim the existing values when a background refresh is triggered, rather than completely unmounting the card (which would cause layout shift).
4.  **No `NONE` enum**: The issue description mentions a `NONE` selection status, but the canonical DTO (`PolicyInsightSelectionStatus`) does not include it. I assume the canonical DTO is the source of truth, and `PARTIAL`/`DEGRADED` handle the suboptimal evidence states.

## 5. Scope

**In Scope:**

- Adding `marketRegime`, `fundamentalRegime`, `supportsUsdcPerSol`, `resistancesUsdcPerSol` to the view-model and UI.
- Formatting an evidence summary and mapping warnings/reason codes to stable copy.
- Modifying `PolicyInsightsUnavailableReason`, the read port, and `CurrentPolicyInsightsAdapter` to distinctly support the `malformed` state.
- Implementing distinct visual states for degraded evidence and malformed contracts.
- Writing fixture-driven tests for the new view-model fields and component states.

**Out of Scope:**

- Creating a new `PolicyInsight` parser.
- Modifying the canonical wire contract schema (`schemas/regime-engine/policy-insight.v1`).
- Modifying the deterministic execution preview/sign/submit screens.
- General redesign of the Positions list screen.

## 6. Risks or Concerns Identified

- **UI Clutter**: Appending regimes, arrays of price levels, warnings, and evidence summaries to a single `PolicyInsightsSection` risks violating the rule to "Keep the UI concise and decision-focused". Care must be taken to format levels compactly (e.g., comma-separated on a single line) and only show warnings if they exist.
- **Adapter Blast Radius**: Changing `CurrentPolicyInsightsAdapter` to return `malformed` requires ensuring that `PolicyInsightsController` explicitly maps this to the same HTTP 200 null-envelope pattern used by all other unavailable reasons (`not-found`, `store-unavailable`, `config-error`, `upstream-error`), otherwise the client might fail to distinguish malformed from other error types.

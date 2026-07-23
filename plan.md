# PolicyInsight Canonical v1 UI Delta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the existing PolicyInsights presentation so validated canonical v1 insights expose concise market, level, evidence, freshness, and warning context while malformed and unavailable responses fail closed without affecting deterministic position protection.

**Architecture:** Preserve the single parser and DTO boundary introduced by issue #92. Extend the application-owned result unions through their existing adapter, controller, client, and UI consumers, then keep all canonical-to-display formatting in `PolicyInsightsViewModel.ts` so `PolicyInsightsSection.tsx` remains presentational. No directional-exit mapping is introduced or re-derived.

**Tech Stack:** TypeScript, React Native/React Native Web, Expo Router, TanStack Query, NestJS, Vitest, Testing Library, pnpm workspaces.

---

## Goal

Render the remaining decision-relevant `PolicyInsight v1` fields and explicit presentation states on the existing positions screen, using only the validated application DTO and never exposing raw evidence identifiers.

## Non-goals

- Do not add or change a PolicyInsight parser, JSON Schema, fixture, synthesis rule, or Regime Engine HTTP route.
- Do not create a second PolicyInsight card, screen, adapter, or view model.
- Do not alter execution preview, signing, submission, breach-direction mapping, or deterministic stop-loss behavior.
- Do not add retry behavior to `CurrentPolicyInsightsAdapter`; its existing no-retry policy remains intact.
- Do not introduce a synthetic `NONE` evidence enum. The pinned canonical schema defines only `FULL`, `PARTIAL`, and `DEGRADED`.
- Do not render raw `bundleHash`, `referenceId`, locator, publisher, source ID, run ID, or selection-policy internals.
- Do not redesign the positions list or add analytics/dashboard behavior.

## Pre-implementation audit

| Concern                                     | Existing coverage                                                                                                                                               | Exact delta                                                                                                                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recommended action                          | `PolicyInsightsViewModel` maps all six canonical actions, including `EXIT_TO_USDC` and `EXIT_TO_SOL`; component renders the label without an execution control. | Strengthen advisory copy so exit recommendations cannot read as signed or automatic instructions.                                                                               |
| Freshness/stale                             | Relative age and a stale warning already render from canonical freshness.                                                                                       | Include canonical as-of/expiry context, treat an already-expired insight as stale, and distinguish active refresh from current data.                                            |
| Posture, range bias, rebalance sensitivity  | Already rendered.                                                                                                                                               | Convert enum text to stable human-readable labels while retaining the existing fields.                                                                                          |
| Maximum capital deployment and confidence   | Already rendered from basis points.                                                                                                                             | Replace rounding/floating formatting with exact basis-point formatting (`3750 -> 37.5%`, `1 -> 0.01%`) and add low-confidence weakening.                                        |
| Risk and data quality                       | Already rendered; action/risk drive border severity.                                                                                                            | Fold stale/degraded/low-confidence context into warning treatment without overriding critical danger treatment.                                                                 |
| Reasoning                                   | Already rendered as one raw canonical string.                                                                                                                   | Bound the display string to 240 characters with an ellipsis.                                                                                                                    |
| Market/fundamental regime                   | DTO fields exist but are not rendered.                                                                                                                          | Add display-ready labels in the view model and render them with posture.                                                                                                        |
| Support/resistance levels                   | Canonical decimal-string arrays exist but are not rendered.                                                                                                     | Filter lexical zero values, preserve decimal-string precision, render concise comma-separated USDC/SOL labels, and show one unavailable line only when both arrays are empty.   |
| Evidence selection                          | Validated DTO exists but is not rendered.                                                                                                                       | Add `FULL`/`PARTIAL`/`DEGRADED` coverage copy and aggregate bundle/source counts without identifiers. Empty refs remain valid and are not mislabeled as a non-canonical `NONE`. |
| Warnings/reason codes                       | Validated machine-readable arrays exist but are not rendered.                                                                                                   | Map codes to stable copy, deduplicate, and cap the combined list at three items. Never display upstream free-form warning messages.                                             |
| Loading and cached refresh                  | Initial no-data loading skeleton exists; cached data remains visible during query refresh without a refresh label.                                              | Pass `isFetching` to the card and label cached content as “Updating” while the request is active.                                                                               |
| Unavailable/not found/store/config/upstream | Result unions and generic/not-found copy already exist.                                                                                                         | Give each outcome stable, bounded copy that says monitoring and deterministic stop-loss protection continue independently.                                                      |
| Malformed                                   | Parser rejects malformed bodies and adapter logs them, but collapses the result into `upstream-error`.                                                          | Add a distinct `malformed` result from adapter through controller/client/UI, retain observability, and never partially render rejected content.                                 |

## Affected files

- `packages/application/src/dto/policyInsights.ts` — add the public malformed unavailable reason.
- `packages/application/src/ports/index.ts` — add the malformed read-result variant.
- `packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.ts` — return malformed after canonical shape rejection.
- `packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.test.ts` — verify malformed classification and observability.
- `packages/adapters/src/inbound/http/PolicyInsightsController.ts` — map malformed to the BFF envelope.
- `packages/adapters/src/inbound/http/PolicyInsightsController.test.ts` — verify the malformed envelope.
- `apps/app/src/api/policyInsights.ts` — accept malformed as a typed BFF unavailable reason.
- `apps/app/src/api/policyInsights.test.ts` — verify malformed envelope parsing remains distinct from client-side invalid JSON/body failures.
- `packages/ui/src/screens/PositionsListScreen.tsx` — admit malformed in the existing PolicyInsights prop and continue passing it to the existing section.
- `packages/ui/src/view-models/PolicyInsightsViewModel.ts` — centralize all new display formatting and weakening flags.
- `packages/ui/src/view-models/PolicyInsightsViewModel.test.ts` — add canonical-fixture-driven formatting and invariant tests.
- `packages/ui/src/components/PolicyInsightsSection.tsx` — render the new view-model fields and explicit states.
- `packages/ui/src/components/PolicyInsightsSection.test.tsx` — cover the presentation matrix and absence of raw evidence internals.
- `apps/app/app/(tabs)/positions.tsx` — pass active query fetching, including background refresh, into the existing PolicyInsights section.

## Cross-task implementation constraints

- Write each named invariant test before its implementation and confirm the focused test fails for the intended reason.
- After each task, the implement loop will automatically run `pnpm -r typecheck`. Do not defer a union consumer or adapter update to a later task if that would break this gate.
- Use canonical fixtures from `schemas/regime-engine/policy-insight.v1/fixtures/valid/`; derive focused variants by cloning and overriding only the field under test.
- Do not modify the vendored schema or fixtures.
- Keep exact decimal levels as strings. Filtering zero must use a lexical predicate such as `/^0(?:\.0+)?$/`, not `Number(...)`.
- Treat low confidence as `confidenceBps < 5000`. This plan documents that UI-only threshold because the canonical contract does not define one.
- Preserve danger precedence: critical risk and `EXIT_TO_USDC`/`EXIT_TO_SOL` remain danger even when the insight is also stale or degraded.

## Task 1: Propagate a distinct malformed outcome through the existing read path

**Files:**

- Modify: `packages/application/src/dto/policyInsights.ts`
- Modify: `packages/application/src/ports/index.ts`
- Modify: `packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.ts`
- Modify: `packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.test.ts`
- Modify: `packages/adapters/src/inbound/http/PolicyInsightsController.ts`
- Modify: `packages/adapters/src/inbound/http/PolicyInsightsController.test.ts`
- Modify: `apps/app/src/api/policyInsights.ts`
- Modify: `apps/app/src/api/policyInsights.test.ts`
- Modify: `packages/ui/src/components/PolicyInsightsSection.tsx`
- Modify: `packages/ui/src/components/PolicyInsightsSection.test.tsx`
- Modify: `packages/ui/src/screens/PositionsListScreen.tsx`

**Behavioral invariants:**

- A syntactically valid `200` JSON body rejected by `parsePolicyInsightBlock` yields `{ kind: 'malformed' }`, logs the existing shape-validation warning, and never yields a block.
- Invalid JSON, a timeout, a network error, and non-2xx responses remain `upstream-error`; malformed is reserved for canonical schema rejection after JSON decoding.
- The controller maps `malformed` to `{ policyInsight: null, unavailableReason: 'malformed' }`.
- The app client accepts the typed malformed null envelope but still throws when the BFF itself sends a malformed top-level envelope or invalid embedded block.
- The UI renders malformed as a fail-closed unavailable card and never calls the view-model builder for absent/rejected data.
- Every unavailable copy states that position monitoring and deterministic stop-loss protection continue independently; not-found, store-unavailable, config-error, upstream-error, and malformed use distinct text.

- [ ] **Step 1: Write the failing boundary tests**

Update the existing focused cases and add exact tests named:

```text
returns kind:"malformed" when a 200 payload violates the canonical schema
logs contract validation failure when returning kind:"malformed"
maps malformed to { policyInsight: null, unavailableReason: "malformed" }
returns { policyInsight: null, unavailableReason } for malformed
renders fail-closed unavailable copy for malformed
renders distinct bounded copy for every unavailable reason
```

Keep the existing invalid-JSON test asserting `upstream-error` and the app-client malformed-block tests asserting thrown errors.

- [ ] **Step 2: Run focused tests and confirm the new cases fail**

Run:

```bash
pnpm --filter @clmm/adapters test -- src/outbound/regime-engine/CurrentPolicyInsightsAdapter.test.ts src/inbound/http/PolicyInsightsController.test.ts
pnpm --filter @clmm/app test -- src/api/policyInsights.test.ts
pnpm --filter @clmm/ui test -- src/components/PolicyInsightsSection.test.tsx
```

Expected: the new `malformed` expectations fail because the unions, mappings, reason allowlist, and UI copy do not yet contain that variant.

- [ ] **Step 3: Extend the port and all implementations/consumers atomically**

Make these exact surface changes in one step so the workspace typecheck remains green:

```ts
export type PolicyInsightsUnavailableReason =
  | 'not-found'
  | 'store-unavailable'
  | 'config-error'
  | 'malformed'
  | 'upstream-error';

export type PolicyInsightsReadResult =
  | { kind: 'block'; block: PolicyInsightBlock }
  | { kind: 'not-found' }
  | { kind: 'store-unavailable' }
  | { kind: 'config-error' }
  | { kind: 'malformed' }
  | { kind: 'upstream-error' };
```

Return `malformed` only from the adapter branch where parsed JSON fails `parsePolicyInsightBlock`. Add the matching exhaustive controller case, app-client allowlist entry, `PositionsListScreen` prop member, and `PolicyInsightsSection` unavailable-copy branch. Use stable copy with these meanings:

```text
not-found: No policy insight is available yet.
store-unavailable: The policy insight store is temporarily unavailable.
config-error: Policy analysis is not configured.
malformed: The policy insight payload was malformed, so guidance was withheld.
upstream-error: The policy insight service could not be reached.
shared suffix: Position monitoring and deterministic stop-loss protection continue independently.
```

Do not expose parser diagnostics or rejected payload fields to the UI.

- [ ] **Step 4: Run focused verification**

Run:

```bash
pnpm --filter @clmm/adapters test -- src/outbound/regime-engine/CurrentPolicyInsightsAdapter.test.ts src/inbound/http/PolicyInsightsController.test.ts
pnpm --filter @clmm/app test -- src/api/policyInsights.test.ts
pnpm --filter @clmm/ui test -- src/components/PolicyInsightsSection.test.tsx
pnpm --filter @clmm/application typecheck
pnpm --filter @clmm/adapters typecheck
pnpm --filter @clmm/app typecheck
pnpm --filter @clmm/ui typecheck
```

Expected: all focused tests and package typechecks pass; invalid JSON is still upstream-error, schema-invalid decoded JSON is malformed, and no union consumer is non-exhaustive.

- [ ] **Step 5: Commit the atomic boundary change**

```bash
git add packages/application/src/dto/policyInsights.ts packages/application/src/ports/index.ts packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.ts packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.test.ts packages/adapters/src/inbound/http/PolicyInsightsController.ts packages/adapters/src/inbound/http/PolicyInsightsController.test.ts apps/app/src/api/policyInsights.ts apps/app/src/api/policyInsights.test.ts packages/ui/src/components/PolicyInsightsSection.tsx packages/ui/src/components/PolicyInsightsSection.test.tsx packages/ui/src/screens/PositionsListScreen.tsx
git commit -m "feat: distinguish malformed policy insights"
```

## Task 2: Build the complete display-ready PolicyInsight view model

**Files:**

- Modify: `packages/ui/src/view-models/PolicyInsightsViewModel.ts`
- Modify: `packages/ui/src/view-models/PolicyInsightsViewModel.test.ts`

**Behavioral invariants:**

- Basis points format exactly without floating-point rounding: `0 -> 0%`, `1 -> 0.01%`, `3750 -> 37.5%`, and `10000 -> 100%`.
- Market, fundamental, posture, range-bias, and sensitivity enums map to stable title/sentence-case labels in the view model; the component never interprets raw enums.
- Canonical level strings retain their supplied precision and order, while lexical zero values (`0`, `0.0`, `0.00`) are removed. A side with valid values gets one comma-separated `USDC/SOL` label; when both sides are empty, one `No eligible support or resistance levels` label is supplied.
- Evidence copy maps `FULL`, `PARTIAL`, and `DEGRADED` to `Full`, `Partial`, and `Limited evidence coverage`, appending pluralized aggregate bundle/source counts only; raw IDs never enter the view model.
- `isDegraded` is true for `PARTIAL`/`DEGRADED` evidence or non-`COMPLETE` data quality. `isLowConfidence` is true below 5000 bps.
- `isStale` is true when canonical freshness is `STALE` or `expiresAt <= now`; as-of and expiry labels are always display-ready UTC strings.
- Stable warning copy is keyed by warning/reason code, upstream free-form warning messages are ignored, duplicates are removed, and at most three items are returned in canonical order.
- Reasoning is unchanged through 240 characters and becomes the first 239 characters plus `…` when longer.
- Critical risk and exit recommendations remain `danger`; otherwise stale, degraded, low-confidence, elevated-risk, or stand-down insights are `warning`; only fresh/full/complete/high-confidence normal insights are `neutral`.

- [ ] **Step 1: Write the failing view-model tests**

Add exact tests named:

```text
formats basis points exactly without rounding away precision
maps market and fundamental regimes to display-ready labels
preserves canonical decimal levels while filtering zero placeholders
marks both empty level arrays unavailable instead of rendering zero
summarizes evidence coverage and aggregate counts without raw identifiers
marks partial degraded and low-confidence insights as visually weaker
marks an expired insight stale even when freshness.status is FRESH
maps deduplicates and bounds warning and reason-code copy
bounds long reasoning for display
keeps critical and exit actions at danger precedence
```

Use `current-pair.json` for fresh/full/empty-level coverage, `current-position.json` for multiple levels/partial evidence/exit action, and `history.json` item 2 for degraded/stale coverage. Clone before overrides so imported fixtures remain immutable.

- [ ] **Step 2: Run the focused view-model test and confirm it fails**

Run:

```bash
pnpm --filter @clmm/ui test -- src/view-models/PolicyInsightsViewModel.test.ts
```

Expected: failures identify missing fields, the current rounded `3750 -> 38%` behavior, missing expiry handling, and absent evidence/warning/level formatting.

- [ ] **Step 3: Add display-ready fields and pure formatting helpers**

Extend the exported `PolicyInsightsViewModel` with this required shape:

```ts
type PolicyInsightsViewModel = {
  actionLabel: string;
  severity: PolicyInsightsSeverity;
  marketRegimeLabel: string;
  fundamentalRegimeLabel: string;
  postureLabel: string;
  rangeBiasLabel: string;
  rebalanceSensitivityLabel: string;
  maxDeploymentLabel: string;
  riskLabel: string;
  confidenceLabel: string;
  dataQualityLabel: string;
  freshnessLabel: string;
  asOfLabel: string;
  expiresLabel: string;
  isStale: boolean;
  isDegraded: boolean;
  isLowConfidence: boolean;
  supportsLabel: string | null;
  resistancesLabel: string | null;
  levelsUnavailableLabel: string | null;
  evidenceSummary: string;
  warningLabels: string[];
  reasoning: string;
  subtitle: string;
};
```

Implement small pure helpers for exact basis-point formatting, enum labels, UTC timestamp labels, lexical-zero level filtering, evidence-count pluralization, stable code mapping/deduplication, and bounded text. Use this advisory subtitle:

```text
Advisory policy context only. Nothing is signed or applied; deterministic stop-loss monitoring continues independently.
```

Do not return evidence reference objects or free-form warning messages.

- [ ] **Step 4: Run focused verification**

Run:

```bash
pnpm --filter @clmm/ui test -- src/view-models/PolicyInsightsViewModel.test.ts
pnpm --filter @clmm/ui typecheck
```

Expected: all view-model tests pass with exact basis-point values, canonical fixture coverage, bounded copy, no fake zero levels, and no raw evidence identifiers.

- [ ] **Step 5: Commit the view-model delta**

```bash
git add packages/ui/src/view-models/PolicyInsightsViewModel.ts packages/ui/src/view-models/PolicyInsightsViewModel.test.ts
git commit -m "feat: format canonical policy insight context"
```

## Task 3: Render fresh, refreshing, stale, degraded, and advisory UI states

**Files:**

- Modify: `packages/ui/src/components/PolicyInsightsSection.tsx`
- Modify: `packages/ui/src/components/PolicyInsightsSection.test.tsx`
- Modify: `apps/app/app/(tabs)/positions.tsx`

**Behavioral invariants:**

- Disabled remains `null`; initial active loading with no data renders only the skeleton.
- Active fetching with a cached block renders the block as last available data plus `Updating policy insight…`; it does not present the cached values as newly current.
- Fresh/full/complete/high-confidence data renders normal treatment with freshness, as-of, and expiry context.
- Stale or expired data renders visibly weaker warning treatment and explicit `Stale — last update …`, as-of, and expiry context.
- Partial/degraded/low-confidence data remains renderable but shows warning treatment, evidence coverage, and bounded stable warnings.
- Valid support/resistance arrays render concise labels; a missing side is omitted, and when both sides are empty exactly one unavailable-level line renders.
- Advisory copy is always present, including for both exit recommendations, and no sign/execute control is added.
- Raw evidence identifiers, locators, free-form upstream warning messages, and more than three mapped warnings never render.
- Refresh failure with cached data remains distinct from evidence degradation: it renders `Refresh failed — showing last available policy insight.` in addition to any canonical degraded treatment.

- [ ] **Step 1: Write the failing component-state tests**

Add exact tests named:

```text
renders market regimes multiple levels and evidence summary from the canonical position fixture
renders one unavailable-level line for empty canonical level arrays
renders degraded evidence and bounded stable warning copy
renders stale as-of and expiry context with weaker treatment
labels cached data as updating during an active refresh
keeps refresh failure distinct from canonical evidence degradation
keeps EXIT_TO_USDC and EXIT_TO_SOL advisory and non-executable
does not render raw evidence identifiers or upstream warning messages
```

Retain existing tests for disabled, initial loading, fresh canonical fixtures, not-found, store/config/upstream/malformed, and cached error behavior.

- [ ] **Step 2: Run the focused component test and confirm it fails**

Run:

```bash
pnpm --filter @clmm/ui test -- src/components/PolicyInsightsSection.test.tsx
```

Expected: new field/state assertions fail because the component does not yet render the expanded view model or cached-refresh label.

- [ ] **Step 3: Render only display-ready view-model values**

Update the existing card in place:

- Group market regime, fundamental regime, and posture before CLMM policy details.
- Render support and resistance labels only when non-null, otherwise render the single unavailable-level label.
- Render evidence summary on every ready card; apply warning color when degraded or low-confidence.
- Render at most the view model’s three warning labels.
- Render as-of and expiry labels alongside fresh/stale context.
- Preserve danger border precedence, using warning border/text for neutral cards that are stale, degraded, or low-confidence.
- Render `Updating policy insight…` when `isLoading` is true and a block exists.
- Keep the refresh-error message separate from canonical degraded warnings.

No raw-contract switch, number formatting, warning mapping, or evidence counting belongs in the component.

- [ ] **Step 4: Pass active fetch state from the route**

Change only the PolicyInsights loading prop to reflect every active request:

```tsx
policyInsightsLoading={
  policyInsightsQuery.isFetching && policyInsightsQuery.fetchStatus !== 'idle'
}
```

Leave the enable guard, query key, stale time, retry configuration, and independent query/error state unchanged.

- [ ] **Step 5: Run focused verification**

Run:

```bash
pnpm --filter @clmm/ui test -- src/components/PolicyInsightsSection.test.tsx
pnpm --filter @clmm/ui typecheck
pnpm --filter @clmm/app typecheck
```

Expected: component tests pass for the complete state matrix, and both packages typecheck with the route passing active refresh state.

- [ ] **Step 6: Commit the presentation delta**

```bash
git add packages/ui/src/components/PolicyInsightsSection.tsx packages/ui/src/components/PolicyInsightsSection.test.tsx apps/app/app/\(tabs\)/positions.tsx
git commit -m "feat: render policy insight evidence states"
```

## Tests to add or update

- `packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.test.ts`: schema-invalid decoded payload becomes malformed and emits observability; JSON/network/HTTP failures remain upstream-error.
- `packages/adapters/src/inbound/http/PolicyInsightsController.test.ts`: malformed is preserved in the null BFF envelope.
- `apps/app/src/api/policyInsights.test.ts`: malformed envelope is accepted, while malformed BFF bodies still throw.
- `packages/ui/src/view-models/PolicyInsightsViewModel.test.ts`: canonical fixture-driven regimes, exact bps, multiple/empty/zero levels, evidence coverage, degradation, staleness/expiry, stable warning mapping, bounded lists/text, and exit-action severity.
- `packages/ui/src/components/PolicyInsightsSection.test.tsx`: loading/refreshing/fresh/stale/degraded/unavailable/malformed/store/upstream states, advisory copy, concise levels/evidence, and absence of raw identifiers.

The two existing UI test files exceed ten cases after this work, but neither task is primarily a test-file update: each test change is paired with its independently committable production behavior. Do not create a separate bulk test-update task.

## Validation commands

Use the focused commands embedded in each task as its acceptance criteria. The implementation runner additionally performs its mandatory workspace gate after every task:

```bash
pnpm -r typecheck
```

After all implementation tasks, the dedicated validation phase may run the repository-required broad checks:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
```

These are validation-phase commands, not a standalone implementation task.

## Risk areas

- **Union blast radius:** Adding `malformed` makes exhaustive switches fail until the adapter, controller, app client, screen prop, and UI copy are changed together. Task 1 intentionally keeps them atomic.
- **Malformed classification drift:** Invalid JSON must remain upstream-error; only decoded JSON rejected by the canonical parser is malformed.
- **Precision loss:** Parsing canonical decimal-string levels as JavaScript numbers could round values or turn zero placeholders into apparent prices. Keep strings throughout.
- **Invented contract states:** The issue mentions `NONE`, but the pinned schema does not. Do not add it locally.
- **Directional implication:** UI copy for `EXIT_TO_USDC`/`EXIT_TO_SOL` is advisory only. Do not infer breach direction or swap behavior in UI/application/adapters.
- **Information density:** Regimes, levels, evidence, and warnings can overwhelm the card. Cap warnings at three, reasoning at 240 characters, and use aggregate counts only.
- **Overlapping weak states:** An insight can be stale, degraded, low-confidence, and refresh-failed simultaneously. Danger action/risk remains highest priority; canonical weak-state copy and transport refresh failure remain separately visible.
- **Loading semantics:** TanStack Query `isLoading` does not cover cached background refresh. Use `isFetching` only for the PolicyInsights prop and do not alter other query behavior.
- **Observability privacy:** Log the contract-validation event, not the raw rejected payload.

## Stop conditions

Abort implementation and report the blocker instead of continuing if:

- The checked-in `PolicyInsight v1` schema or #92 parser no longer exposes the fields/enums assumed here, especially if `selectionStatus` differs from `FULL | PARTIAL | DEGRADED`.
- More than one `PolicyInsightsReadPort` implementation exists and cannot be updated in the same atomic Task 1.
- A proposed UI change requires re-parsing unknown JSON, importing adapters/Solana SDKs into UI, or bypassing `@clmm/application/public`.
- Any requirement would require changing the release-blocking directional mapping or deriving it outside `DirectionalExitPolicyService`.
- The upstream contract permits levels that cannot be safely represented as validated decimal strings without changing the canonical schema/parser.
- The only way to distinguish malformed from upstream-error would be to duplicate the parser or expose rejected payload contents.
- Existing unrelated failing focused tests prevent demonstrating the required red-to-green behavior; record the exact pre-existing failures rather than broadening scope.

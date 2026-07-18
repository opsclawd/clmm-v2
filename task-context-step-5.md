# Task Context: Task 5

Title: Render truthful metrics and remove fabricated placeholders

## Workspace & Scope Constraints

## WORKSPACE CONSTRAINTS

Your working directory is a dedicated git worktree with the repository's complete history. Run all commands from it. Do NOT cd to or read paths outside this directory — external-directory access is automatically rejected. git log, git diff, etc. work here directly.

.ai-orchestrator.local.json, if one exists, lives only in the main checkout and is intentionally not copied into your worktree — it is operator-machine-specific and not part of your task. Do not search for it or read it outside this directory. Reason about configuration using only .ai-orchestrator.json in your own working directory; treat it as the effective config for your task.

Working Directory: /home/gary/.openclaw/workspace/clmm-superpowers-v2/.ai-worktrees/issue-94
Repository: opsclawd/clmm-v2
Branch: ai/issue-94
Start Commit: 10bbee223a2aec85c23242ae9a4601d38fe69046

## Task Requirements

**Files:**

- Modify: `packages/ui/src/components/PortfolioSummaryStrip.tsx`
- Modify: `packages/ui/src/components/PositionCard.tsx`
- Modify: `packages/ui/src/components/PositionCard.test.tsx`
- Modify: `packages/ui/src/components/PositionCardUtils.ts`
- Modify: `packages/ui/src/components/PositionCardUtils.test.ts`
- Modify: `packages/ui/src/screens/PositionsListScreen.tsx`
- Modify: `packages/ui/src/screens/PositionsListScreen.test.tsx`

**Exported signature changes:** Change exported `PortfolioSummaryStrip` from a no-argument component to require `positionValue` and `unclaimedFees` display-state props. Remove internal module symbols `CardPlaceholderMetrics`, `CARD_PLACEHOLDER_FALLBACKS`, `hashStringToIndex`, and `getCardPlaceholderMetrics` from `PositionCardUtils.ts` (these are not exported; they are module-internal implementation details). `PositionCard` continues to receive `PositionListItemViewModel`, whose required metric fields were added in Task 4.

**Behavioral invariants to write as named tests first:**

- `renders unavailable financial metrics as em dashes with neutral styling` — loaded null values show `—`, not zero and not green.
- `renders exact zero financial metrics as $0.00` — all four surfaces preserve true zero.
- `renders populated authoritative financial metrics with corrected labels` — labels are `Position value`, `Unclaimed fees`, `Pool TVL`, and `Pool fees · 24h`.
- `does not render metric components while positions are loading` — loading remains screen-owned and separate from unavailable.
- `does not calculate unavailable summary values from populated pool cards` — null aggregates remain dashes.
- `renders shared pool metrics on each matching card without double counting the summary` — lookup is display-only.
- `contains none of the removed fabricated financial labels` — `$24,812`, `+$142.30`, `$8,420.19`, `$6,220.00`, `$3,105.77`, `+$12.40`, `+$4.82`, and `+$1.95` disappear from production and test fixtures.
- `preserves summary cards positions and market sections ordering` — the existing list layout remains summary, cards, S/R, thesis.

- [ ] **Step 1: Replace old screen expectations with failing semantic state tests**

Within the existing `describe('PositionsListScreen', ...)` block, replace only the portfolio-summary and ordering cases around the current summary section; add zero, populated, null, loading, and no-derived-total cases with the exact names above. In `PositionCard.test.tsx`, add direct unavailable/zero/populated rendering cases. Do not split unrelated market, navigation, range, or status tests out of the 574-line screen file.

- [ ] **Step 2: Run only the changed component and screen cases and confirm failure**

Run: `pnpm --filter @clmm/ui test -- src/components/PositionCard.test.tsx src/screens/PositionsListScreen.test.tsx -t "financial metrics|exact zero|authoritative|summary cards|loading|shared pool"`

Expected: FAIL while the hard-coded constants and generated placeholder helper still drive rendering.

- [ ] **Step 3: Make the summary strip render display-state props**

Delete `PORTFOLIO_VALUE` and `FEES_EARNED_VALUE`. Accept two `FinancialMetricViewModel` props, render their labels verbatim, and select `colors.textPrimary` for available values and `colors.textTertiary` for unavailable values. Use the corrected semantic labels and stable test IDs such as `position-summary-value` and `position-summary-unclaimed-fees`.

```tsx
<SummaryCard
  testID="position-summary-value"
  label="Position value"
  metric={positionValue}
/>
<SummaryCard
  testID="position-summary-unclaimed-fees"
  label="Unclaimed fees"
  metric={unclaimedFees}
/>
```

- [ ] **Step 4: Make cards render pool display states and remove green performance styling**

Destructure `poolTvl` and `poolFees24h` from the item. Render `Pool TVL` and `Pool fees · 24h`; use `colors.textPrimary` for available and `colors.textTertiary` for unavailable. Do not prefix fees with `+`, and do not call any utility to invent a value.

- [ ] **Step 5: Surgically delete placeholder-only utilities and tests**

From `PositionCardUtils.ts`, remove only `CardPlaceholderMetrics`, `CARD_PLACEHOLDER_FALLBACKS`, `hashStringToIndex`, and `getCardPlaceholderMetrics`. Remove their import and `describe('getCardPlaceholderMetrics', ...)` block from `PositionCardUtils.test.ts`. Retain and rerun all tests for token splitting, pool formatting, near-edge status, monitoring display, and breach side.

- [ ] **Step 6: Connect screen summary props and verify loaded-state control flow**

Pass `viewModel.positionValue` and `viewModel.unclaimedFees` to `PortfolioSummaryStrip`; cards already receive item-scoped metrics. Do not render the connected list for disconnected, loading, error-without-cache, or empty states, preserving the existing conditional control flow.

- [ ] **Step 7: Run focused UI tests and package gates**

Run: `pnpm --filter @clmm/ui test -- src/components/PositionCard.test.tsx src/components/PositionCardUtils.test.ts src/screens/PositionsListScreen.test.tsx src/view-models/PositionListViewModel.test.ts`

Expected: PASS for truthful state rendering plus all retained range, monitoring, selection, warning, and market-order behavior in the touched files.

Run: `pnpm --filter @clmm/ui typecheck && pnpm --filter @clmm/ui lint`

Expected: PASS with no placeholder imports or invalid component props.

- [ ] **Step 8: Commit the truthful rendering change**

```bash
git add packages/ui/src/components/PortfolioSummaryStrip.tsx packages/ui/src/components/PositionCard.tsx packages/ui/src/components/PositionCard.test.tsx packages/ui/src/components/PositionCardUtils.ts packages/ui/src/components/PositionCardUtils.test.ts packages/ui/src/screens/PositionsListScreen.tsx packages/ui/src/screens/PositionsListScreen.test.tsx
git commit -m "fix(ui): remove fabricated position financial values"
```

## Repository Targets

### Expected Files

- packages/ui/src/components/PortfolioSummaryStrip.tsx
- packages/ui/src/components/PositionCard.tsx
- packages/ui/src/components/PositionCard.test.tsx
- packages/ui/src/components/PositionCardUtils.ts
- packages/ui/src/components/PositionCardUtils.test.ts
- packages/ui/src/screens/PositionsListScreen.tsx
- packages/ui/src/screens/PositionsListScreen.test.tsx

## Validation Commands

```bash
pnpm --filter @clmm/ui test -- src/components/PositionCard.test.tsx src/components/PositionCardUtils.test.ts src/screens/PositionsListScreen.test.tsx src/view-models/PositionListViewModel.test.ts
pnpm --filter @clmm/ui typecheck && pnpm --filter @clmm/ui lint
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **unavailable renders neutrally**: Loaded unavailable values render em dashes using neutral or tertiary text rather than zero or green. (Test: `renders unavailable financial metrics as em dashes with neutral styling`)
- **true zero renders as money**: Each summary and pool surface renders an authoritative zero as $0.00. (Test: `renders exact zero financial metrics as $0.00`)
- **authoritative values use accurate labels**: Populated values render with Position value, Unclaimed fees, Pool TVL, and Pool fees · 24h labels. (Test: `renders populated authoritative financial metrics with corrected labels`)
- **loading hides metric components**: While the positions request is loading, the existing loading screen renders and neither summary nor cards appear. (Test: `does not render metric components while positions are loading`)
- **cards never produce summary totals**: Populated pool card metrics cannot turn unavailable response aggregates into displayed totals. (Test: `does not calculate unavailable summary values from populated pool cards`)
- **shared pool display does not double count**: Matching cards may repeat their pool-wide display, but the response-level summary remains independently supplied. (Test: `renders shared pool metrics on each matching card without double counting the summary`)
- **fabricated deck is fully removed**: No former hard-coded or generated placeholder amount remains in production or updated fixtures. (Test: `contains none of the removed fabricated financial labels`)
- **existing screen order is preserved**: The summary remains above cards, followed by support/resistance and market thesis sections. (Test: `preserves summary cards positions and market sections ordering`)

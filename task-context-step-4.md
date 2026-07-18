# Task Context: Task 4

Title: Map financial metrics into closed UI display states

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

- Modify: `packages/ui/src/view-models/PositionListViewModel.ts`
- Modify: `packages/ui/src/view-models/PositionListViewModel.test.ts`
- Modify: `packages/ui/src/screens/PositionsListScreen.tsx`
- Modify: `packages/ui/src/screens/PositionsListScreen.test.tsx`
- Modify: `packages/ui/src/components/PositionCard.test.tsx`
- Modify: `packages/ui/src/index.ts`
- Modify: `apps/app/app/(tabs)/positions.tsx`
- Modify: `apps/app/src/appShellDependencies.test.ts`

**Exported signature changes:** Add exported `FinancialMetricViewModel`; add pool metric fields to `PositionListItemViewModel` and summary fields to `PositionListViewModel`; change `buildPositionListViewModel` to require `(positions, financialMetrics)`; change `PositionsListScreen` to accept `financialMetrics`; update the app route call site in the same task so workspace typecheck remains green.

**Behavioral invariants to write as named tests first:**

- `maps null financial metrics to unavailable display states` — output is exactly `{ kind: 'unavailable', label: '—' }`.
- `maps exact zero financial metrics to available $0.00 display states` — truthiness cannot erase zero.
- `formats positive financial metrics consistently in USD` — all four surfaces share one formatter.
- `fails closed when a view model receives negative or non-finite values` — defense in depth yields unavailable, never a displayed invalid amount.
- `matches pool metrics by exact pool id for shared and distinct pools` — shared-pool items reuse one mapping; different pools retain their own values.
- `does not compute summary metrics from pool metrics or position fields` — null aggregates stay unavailable even when every pool metric is populated.
- `passes response financial metrics through the Expo route without derivation` — composition forwards `positionsResult.financialMetrics`.

- [ ] **Step 1: Add failing view-model tests and update the card fixture shape**

Extend `PositionListViewModel.test.ts` using a metrics factory. Add the exact mapping invariant test names above. Update `baseItem` in `PositionCard.test.tsx` with unavailable `poolTvl` and `poolFees24h` fields so the additive required item shape typechecks before components consume the fields. Add `it('passes response financial metrics through the Expo route without derivation', ...)` to the existing app-shell guard; inspect `app/(tabs)/positions.tsx` and require both `financialMetrics={financialMetrics}` and assignment from `positionsResult?.financialMetrics`.

```ts
export type FinancialMetricViewModel =
  | { kind: 'unavailable'; label: '—' }
  | { kind: 'available'; valueUsd: number; label: string };
```

- [ ] **Step 2: Run view-model tests and confirm the new mapping API is absent**

Run: `pnpm --filter @clmm/ui test -- src/view-models/PositionListViewModel.test.ts`

Expected: FAIL because `buildPositionListViewModel` does not accept or map financial metrics.

- [ ] **Step 3: Implement one closed-state mapper and one USD formatter**

Use `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })`. Map null and invalid defensive inputs to unavailable; map finite non-negative numbers, including zero, to available. Do not export nullable numbers to components.

```ts
function toFinancialMetricViewModel(
  metric: { valueUsd: number } | null | undefined,
): FinancialMetricViewModel {
  if (metric == null || !Number.isFinite(metric.valueUsd) || metric.valueUsd < 0) {
    return { kind: 'unavailable', label: '—' };
  }
  return {
    kind: 'available',
    valueUsd: metric.valueUsd,
    label: USD_FORMATTER.format(metric.valueUsd),
  };
}
```

- [ ] **Step 4: Extend the list view model without aggregating**

Require `PositionListFinancialMetricsDto` as the second builder argument. Map `positionValue` and `unclaimedFees` directly at response level. For each item, read `financialMetrics.poolsById[p.poolId]`; absent entries defensively become unavailable. Never sum `items`, pool values, or known subsets.

```ts
export type PositionListViewModel = {
  items: PositionListItemViewModel[];
  isEmpty: boolean;
  positionValue: FinancialMetricViewModel;
  unclaimedFees: FinancialMetricViewModel;
};
```

- [ ] **Step 5: Update all signature call sites atomically**

Add `financialMetrics?: PositionListFinancialMetricsDto` to `PositionsListScreen` only at the outer state boundary, but require it inside `ConnectedPositionsList`. Use an all-unavailable empty object only as a defensive default for direct UI callers; the Expo route passes `positionsResult?.financialMetrics` unchanged. Update the UI index export and every builder call in the view-model/screen tests. Do not render metric labels in this task; Task 5 changes the components.

- [ ] **Step 6: Run focused mapping tests and cross-package type gates**

Run: `pnpm --filter @clmm/ui test -- src/view-models/PositionListViewModel.test.ts src/components/PositionCard.test.tsx`

Expected: PASS for the mapping invariants and the updated item fixture.

Run: `pnpm --filter @clmm/app test -- src/appShellDependencies.test.ts -t "passes response financial metrics through the Expo route without derivation"`

Expected: PASS for route-level pass-through without calculations.

Run: `pnpm --filter @clmm/ui typecheck && pnpm --filter @clmm/app typecheck`

Expected: PASS with the updated exported UI signatures and route call site.

- [ ] **Step 7: Commit the UI contract plumbing**

```bash
git add packages/ui/src/view-models/PositionListViewModel.ts packages/ui/src/view-models/PositionListViewModel.test.ts packages/ui/src/screens/PositionsListScreen.tsx packages/ui/src/screens/PositionsListScreen.test.tsx packages/ui/src/components/PositionCard.test.tsx packages/ui/src/index.ts 'apps/app/app/(tabs)/positions.tsx' apps/app/src/appShellDependencies.test.ts
git commit -m "feat(ui): map position metrics to explicit display states"
```

## Repository Targets

### Expected Files

- packages/ui/src/view-models/PositionListViewModel.ts
- packages/ui/src/view-models/PositionListViewModel.test.ts
- packages/ui/src/screens/PositionsListScreen.tsx
- packages/ui/src/screens/PositionsListScreen.test.tsx
- packages/ui/src/components/PositionCard.test.tsx
- packages/ui/src/index.ts
- apps/app/app/(tabs)/positions.tsx
- apps/app/src/appShellDependencies.test.ts

## Validation Commands

```bash
pnpm --filter @clmm/ui test -- src/view-models/PositionListViewModel.test.ts src/components/PositionCard.test.tsx
pnpm --filter @clmm/app test -- src/appShellDependencies.test.ts -t "passes response financial metrics through the Expo route without derivation"
pnpm --filter @clmm/ui typecheck && pnpm --filter @clmm/app typecheck
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **null maps to unavailable**: Null or defensively absent metrics map to the closed unavailable state with an em dash label. (Test: `maps null financial metrics to unavailable display states`)
- **zero maps to available**: Exact zero maps to an available state labeled $0.00. (Test: `maps exact zero financial metrics to available $0.00 display states`)
- **positive values share one formatter**: All response and pool metrics use the same en-US USD formatting rules. (Test: `formats positive financial metrics consistently in USD`)
- **defensive invalid input fails closed**: Negative and non-finite values received by the mapper become unavailable, never available labels. (Test: `fails closed when a view model receives negative or non-finite values`)
- **pool lookup uses exact identity**: Positions sharing a pool reuse its metrics while positions in different pools receive only their matching metrics. (Test: `matches pool metrics by exact pool id for shared and distinct pools`)
- **summary values are not derived**: Null response aggregates stay unavailable even when pool or position-level fields are populated. (Test: `does not compute summary metrics from pool metrics or position fields`)
- **composition is pass-through only**: The Expo route forwards positionsResult.financialMetrics to the screen without calculation or relabeling. (Test: `passes response financial metrics through the Expo route without derivation`)

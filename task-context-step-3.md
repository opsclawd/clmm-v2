# Task Context: Task 3

Title: Render fresh, refreshing, stale, degraded, and advisory UI states

## Workspace & Scope Constraints

## WORKSPACE CONSTRAINTS

Your working directory is a dedicated git worktree with the repository's complete history. Run all commands from it. Do NOT cd to or read paths outside this directory — external-directory access is automatically rejected. git log, git diff, etc. work here directly.

.ai-orchestrator.local.json, if one exists, lives only in the main checkout and is intentionally not copied into your worktree — it is operator-machine-specific and not part of your task. Do not search for it or read it outside this directory. Reason about configuration using only .ai-orchestrator.json in your own working directory; treat it as the effective config for your task.

Working Directory: /home/gary/.openclaw/workspace/clmm-superpowers-v2/.ai-worktrees/issue-93
Repository: opsclawd/clmm-v2
Branch: ai/issue-93
Start Commit: ea439d93e9d2ece2778fd487e370173c295002c9

## Task Requirements

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

## Repository Targets

### Expected Files

- packages/ui/src/components/PolicyInsightsSection.tsx
- packages/ui/src/components/PolicyInsightsSection.test.tsx
- apps/app/app/(tabs)/positions.tsx

## Validation Commands

```bash
pnpm --filter @clmm/ui test -- src/components/PolicyInsightsSection.test.tsx
pnpm --filter @clmm/ui typecheck
pnpm --filter @clmm/app typecheck
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **initial loading has no stale content**: Enabled loading with no block renders only the PolicyInsights skeleton. (Test: `renders a skeleton when loading with no data`)
- **cached refresh is labeled**: An active fetch with cached data renders that data as last available and displays an updating label. (Test: `labels cached data as updating during an active refresh`)
- **fresh state stays strong**: Fresh full-evidence complete high-confidence data renders normal treatment with freshness, as-of, and expiry context. (Test: `renders fresh full-evidence insight with current timing context`)
- **stale state is visibly weaker**: Stale or expired data renders warning treatment plus explicit last-update, as-of, and expiry context. (Test: `renders stale as-of and expiry context with weaker treatment`)
- **degraded state remains qualified**: Valid partial or degraded evidence remains visible with warning treatment, evidence coverage, and bounded stable warning copy. (Test: `renders degraded evidence and bounded stable warning copy`)
- **empty levels never become zero prices**: A missing side is omitted and two empty sides render exactly one unavailable-level line. (Test: `renders one unavailable-level line for empty canonical level arrays`)
- **exit actions remain advisory**: EXIT_TO_USDC and EXIT_TO_SOL retain advisory independent-monitoring copy and add no execute or sign control. (Test: `keeps EXIT_TO_USDC and EXIT_TO_SOL advisory and non-executable`)
- **evidence internals never render**: Raw bundle/source identifiers, locators, upstream warning messages, and warning items beyond the view-model cap are absent. (Test: `does not render raw evidence identifiers or upstream warning messages`)
- **transport and canonical degradation are separate**: Cached refresh failure copy renders independently of canonical degraded evidence copy. (Test: `keeps refresh failure distinct from canonical evidence degradation`)

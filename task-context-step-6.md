# Task Context: Task 6

Title: Document financial metric semantics and source requirements

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

- Modify: `docs/product-scope.md`

**Behavioral invariants:** None; this task changes documentation only.

- [ ] **Step 1: Add a focused `Displayed financial metric semantics` section**

Document the four contracts in a compact table:

| Display label   | Scope                        | Required timing            | Included                                | Excluded                                               | Current production source |
| --------------- | ---------------------------- | -------------------------- | --------------------------------------- | ------------------------------------------------------ | ------------------------- |
| Position value  | Returned supported positions | `valuedAtUnixMs`           | Principal token amounts                 | Wallet balances, fees, rewards, collected history, P&L | None; unavailable         |
| Unclaimed fees  | Returned supported positions | `valuedAtUnixMs`           | Currently claimable trading fees        | Rewards, collected/lifetime fees                       | None; unavailable         |
| Pool TVL        | Whole identified Orca pool   | `observedAtUnixMs`         | Source-reported USD TVL                 | Raw concentrated-liquidity scalar                      | None; unavailable         |
| Pool fees · 24h | Whole identified Orca pool   | Explicit 24-hour start/end | Source-reported pool fees in the window | Position fees and lifetime fees                        | None; unavailable         |

State that `null` means unavailable, zero is authoritative, claimed values require a named source, and summary totals must be complete rather than sums of available subsets.

- [ ] **Step 2: Inspect only the added documentation section**

Run: `sed -n '/^## Displayed Financial Metric Semantics$/,/^## /p' docs/product-scope.md`

Expected: The section contains all four labels, scopes, timing rules, exclusions, null/zero distinction, and the statement that no production source exists yet.

- [ ] **Step 3: Commit the semantic documentation**

```bash
git add docs/product-scope.md
git commit -m "docs: define displayed financial metric semantics"
```

**Tests to add or update**

- Add `packages/application/src/dto/validation.test.ts` for strict metric-contract validation.
- Update the list use-case tests for explicit null metrics, unique pool coverage, and independence from raw liquidity.
- Update controller tests for the success envelope and unchanged request-failure envelope.
- Update only the `fetchSupportedPositions` section of the large app API test for legacy omission, null, zero, populated, malformed, and coverage cases.
- Update view-model tests for the closed union, USD formatting, defensive invalid handling, exact pool lookup, and no aggregation.
- Update card tests for corrected labels and unavailable/zero/populated rendering.
- Remove only placeholder-specific utility tests; retain all unrelated `PositionCardUtils` tests.
- Update only financial-summary/loading/order cases in the large screen test, leaving unrelated market and interaction coverage intact.

**Validation commands after all implementation tasks complete**

These are final cross-package checks for the explicitly affected application, adapter, app, UI, and documentation change set; they are not a standalone implementation task:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
```

Expected: all commands exit 0. Before these checks in a fresh worktree, run `pnpm install --frozen-lockfile` if `node_modules` is absent; if workspace build outputs are absent after installation, run `pnpm build` before focused downstream-package tests.

**Risk areas**

- Contract rollout: new clients must normalize only an absent legacy block; malformed claimed values must still reject.
- False zero: no `value || 0`, `value ?? 0`, default-zero DTO, or subset sum is permitted.
- Semantic drift: raw liquidity and claimable detail totals must not be relabeled as TVL, position value, or lifetime earnings.
- Pool identity: map keys and embedded metric pool IDs must match, and the current response must cover every returned pool.
- Partial aggregates: summary values remain null unless a future producer can value the complete returned supported-position set.
- Existing large tests: edit only the targeted describe blocks/cases in `apps/app/src/api/positions.test.ts` and `packages/ui/src/screens/PositionsListScreen.test.tsx`; do not opportunistically rewrite them.
- UI styling: green currently suggests positive performance; financial amounts must use neutral/tertiary colors.
- Surgical cleanup: preserve unrelated `PositionCardUtils` range, monitoring, pool-format, token-pair, and breach helpers.

**Stop conditions**

- Stop if implementation would require a new external provider, position-detail fan-out, price quote, database write, cache, or retry/recovery subsystem; that needs separate design.
- Stop if any proposed value can only be sourced from `PoolData.liquidity`, `PositionDetailDto.unclaimedFees.totalUsd`, UI calculation, a fixture deck, or a hash.
- Stop if a metric's source, scope, inclusion set, or observation/valuation time cannot satisfy its metric-specific DTO.
- Stop if a summary aggregate would include only the positions with available prices or otherwise represent an incomplete subset.
- Stop if a change reaches `packages/domain`, execution/directional policy code, PairGlyph behavior, or broader portfolio analytics.
- Stop if a required exported signature cannot be updated together with every call site needed to keep the automatic workspace `pnpm -r typecheck` gate passing after that task.
- Stop if unrelated user changes overlap a listed file and cannot be preserved with a narrow edit.

**Plan self-review outcome**

- Spec coverage: all acceptance criteria map to Tasks 1–6; no authoritative producer is invented.
- Placeholder scan: the plan contains no deferred implementation placeholders; every code-changing task includes exact types, behavior, test names, commands, and expected results.
- Type consistency: `PositionListFinancialMetricsDto` is the sole transport shape; `FinancialMetricViewModel` is the sole component-facing shape; Task 4 updates all builder/screen call sites atomically.
- Task sizing: no task exists solely to run validation or repair CI. Large existing test files are changed only inside named feature sections as support for implementation tasks, not as oversized test-only tasks.

## Repository Targets

### Expected Files

- docs/product-scope.md

## Validation Commands

```bash
sed -n '/^## Displayed Financial Metric Semantics$/,/^## /p' docs/product-scope.md
```

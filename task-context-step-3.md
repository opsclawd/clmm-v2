# Task Context: Task 3

Title: Validate current responses and normalize legacy Expo responses

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

- Modify: `apps/app/src/api/positions.ts`
- Modify: `apps/app/src/api/positions.test.ts`

**Exported signature changes:** Add required `financialMetrics: PositionListFinancialMetricsDto` to exported `PositionsResult`, changing the return shape of exported `fetchSupportedPositions`.

**Behavioral invariants to write as named tests first:**

- `normalizes a legacy response without financialMetrics to unavailable metrics for every returned pool` — omission is the only backward-compatible fallback.
- `preserves exact zero and populated authoritative financial metrics` — valid claimed values survive parsing unchanged.
- `preserves null financial metrics as unavailable` — explicit nulls are not coerced to zero.
- `rejects malformed non-null financial metrics instead of normalizing them` — invalid values, source/timing metadata, or windows reject the whole claimed response.
- `rejects a present financialMetrics block that omits a returned pool` — current-contract responses cover every returned pool.
- `rejects pool metrics whose embedded pool id differs from the response map key` — no cross-pool display leakage.

- [ ] **Step 1: Add failing `fetchSupportedPositions` cases in its existing describe block**

Keep changes within the `describe('fetchSupportedPositions', ...)` section of the 448-line test file; do not alter `fetchPositionDetail` cases. Add a local valid metrics factory that returns fresh objects for mutation.

```ts
function unavailableMetricsFor(poolId: string): PositionListFinancialMetricsDto {
  return {
    positionValue: null,
    unclaimedFees: null,
    poolsById: { [poolId]: { tvl: null, fees24h: null } },
  };
}
```

- [ ] **Step 2: Run only the changed API describe block and confirm failure**

Run: `pnpm --filter @clmm/app test -- src/api/positions.test.ts -t "fetchSupportedPositions"`

Expected: FAIL because `PositionsResult` has no financial metrics validation or legacy normalization.

- [ ] **Step 3: Add the response contract and a pool-coverage guard**

Import `PositionListFinancialMetricsDto` and `isPositionListFinancialMetricsDto`. Treat `financialMetrics?: unknown` as transport input. After positions validation and successful-error handling:

```ts
const financialMetrics =
  payload.financialMetrics === undefined
    ? unavailableMetricsForPositions(payload.positions)
    : payload.financialMetrics;

if (!isPositionListFinancialMetricsDto(financialMetrics)) {
  throw new Error('Malformed positions financial metrics');
}

const returnedPoolIds = new Set(payload.positions.map((position) => position.poolId));
if ([...returnedPoolIds].some((poolId) => financialMetrics.poolsById[poolId] === undefined)) {
  throw new Error('Malformed positions financial metrics: missing returned pool');
}
```

The local legacy helper must create one null entry per unique returned `poolId`; it must not inspect position prices, fee labels, or raw liquidity and must not accept malformed present data as legacy.

- [ ] **Step 4: Return validated metrics with existing warning behavior intact**

Return `{ positions, financialMetrics, warning? }`. Preserve the current rule that an error with zero positions rejects and an error with partial positions becomes a warning. Do not modify `fetchPositionDetail`.

- [ ] **Step 5: Run focused API tests and app package gates**

Run: `pnpm --filter @clmm/app test -- src/api/positions.test.ts -t "fetchSupportedPositions"`

Expected: PASS for legacy omission, explicit null, zero, populated, malformed, coverage, existing warning, and existing error cases.

Run: `pnpm --filter @clmm/app typecheck`

Expected: PASS with the enriched `PositionsResult` signature.

- [ ] **Step 6: Commit the Expo boundary change**

```bash
git add apps/app/src/api/positions.ts apps/app/src/api/positions.test.ts
git commit -m "feat(app): validate and normalize position financial metrics"
```

## Repository Targets

### Expected Files

- apps/app/src/api/positions.ts
- apps/app/src/api/positions.test.ts

## Validation Commands

```bash
pnpm --filter @clmm/app test -- src/api/positions.test.ts -t "fetchSupportedPositions"
pnpm --filter @clmm/app typecheck
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **legacy omission normalizes to unavailable**: Only an absent financialMetrics block is normalized, with one null pool entry per unique returned pool. (Test: `normalizes a legacy response without financialMetrics to unavailable metrics for every returned pool`)
- **claimed values survive parsing**: Valid zero and positive metrics are returned unchanged rather than being truthiness-coerced. (Test: `preserves exact zero and populated authoritative financial metrics`)
- **explicit null remains unavailable**: Valid null metrics remain null and are not converted to zero. (Test: `preserves null financial metrics as unavailable`)
- **malformed claims reject**: A present but invalid non-null metric fails the positions request rather than silently becoming unavailable. (Test: `rejects malformed non-null financial metrics instead of normalizing them`)
- **current responses cover returned pools**: A present financialMetrics block must have an entry for each unique pool in the returned positions. (Test: `rejects a present financialMetrics block that omits a returned pool`)
- **transport pool identity cannot drift**: An embedded metric poolId different from its map key causes response rejection. (Test: `rejects pool metrics whose embedded pool id differs from the response map key`)

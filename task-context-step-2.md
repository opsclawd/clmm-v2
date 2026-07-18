# Task Context: Task 2

Title: Produce unavailable metrics and serialize the success envelope

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

- Modify: `packages/application/src/use-cases/positions/ListSupportedPositions.ts`
- Modify: `packages/application/src/use-cases/positions/ListSupportedPositions.test.ts`
- Modify: `packages/adapters/src/inbound/http/PositionController.ts`
- Modify: `packages/adapters/src/inbound/http/PositionController.test.ts`

**Exported signature changes:** Add `financialMetrics: PositionListFinancialMetricsDto` to `ListSupportedPositionsResult`, changing the declared result of `listSupportedPositions`; add the same field to the successful return shape of `PositionController.listPositions`. No port or adapter interface method is added.

**Behavioral invariants to write as named tests first:**

- `returns unavailable financial metrics for every returned unique pool` — aggregates are null and every pool represented by a returned summary has `{ tvl: null, fees24h: null }`.
- `does not derive financial metrics from raw pool liquidity` — changing `PoolData.liquidity` cannot change the all-unavailable metric object.
- `deduplicates unavailable pool metrics when positions share a pool` — one map entry per pool, not one per position.
- `serializes financial metrics on successful position list responses` — the controller success envelope includes the use-case block alongside positions and warnings.
- `keeps transient list failures as error envelopes without claimed financial metrics` — existing error behavior remains distinct from a successful unavailable measurement.

- [ ] **Step 1: Add failing use-case and controller tests**

Extend the existing test files with the exact names above. Build a second position sharing `FIXTURE_POOL_DATA.poolId` for deduplication. For the raw-liquidity test, run the use case against otherwise identical pool data with different `liquidity` strings and assert equal financial metrics.

```ts
expect(result.financialMetrics).toEqual({
  positionValue: null,
  unclaimedFees: null,
  poolsById: {
    [FIXTURE_POOL_DATA.poolId]: { tvl: null, fees24h: null },
  },
});
```

- [ ] **Step 2: Run the focused tests and confirm the new response field is missing**

Run: `pnpm --filter @clmm/application test -- src/use-cases/positions/ListSupportedPositions.test.ts`

Expected: FAIL on `result.financialMetrics`.

Run: `pnpm --filter @clmm/adapters test -- src/inbound/http/PositionController.test.ts`

Expected: FAIL because successful list responses do not yet serialize `financialMetrics`.

- [ ] **Step 3: Build unavailable metrics from unique successfully summarized pool IDs**

After summary creation, derive keys only from `summaryDtos` so the map matches positions actually returned to the client. Do not read `poolData.liquidity`, call another port method, catch a metrics failure, or calculate a total.

```ts
const poolsById = Object.fromEntries(
  [...new Set(summaryDtos.map((dto) => dto.poolId))].map((poolId) => [
    poolId,
    { tvl: null, fees24h: null },
  ]),
);

const financialMetrics: PositionListFinancialMetricsDto = {
  positionValue: null,
  unclaimedFees: null,
  poolsById,
};

return { positions, summaryDtos, poolMetadataFailures, financialMetrics };
```

- [ ] **Step 4: Thread the block through the controller success response**

Add `financialMetrics` to `ListPositionsSuccessResponse`, capture it from the use-case result, and include it unchanged in the success object. Leave transient and pool-metadata error responses unchanged, because they represent request failure rather than a successfully measured unavailable state.

```ts
type ListPositionsSuccessResponse = {
  positions: PositionSummaryDto[];
  financialMetrics: PositionListFinancialMetricsDto;
  warning?: string;
};
```

- [ ] **Step 5: Run focused tests and package gates**

Run: `pnpm --filter @clmm/application test -- src/use-cases/positions/ListSupportedPositions.test.ts`

Expected: PASS, including unavailable, raw-liquidity independence, and deduplication cases.

Run: `pnpm --filter @clmm/adapters test -- src/inbound/http/PositionController.test.ts`

Expected: PASS, including the successful envelope and unchanged error cases.

Run: `pnpm --filter @clmm/application typecheck && pnpm --filter @clmm/adapters typecheck`

Expected: PASS across the changed producer and transport packages.

- [ ] **Step 6: Commit the producer and transport change**

```bash
git add packages/application/src/use-cases/positions/ListSupportedPositions.ts packages/application/src/use-cases/positions/ListSupportedPositions.test.ts packages/adapters/src/inbound/http/PositionController.ts packages/adapters/src/inbound/http/PositionController.test.ts
git commit -m "feat(positions): return explicit unavailable financial metrics"
```

## Repository Targets

### Expected Files

- packages/application/src/use-cases/positions/ListSupportedPositions.ts
- packages/application/src/use-cases/positions/ListSupportedPositions.test.ts
- packages/adapters/src/inbound/http/PositionController.ts
- packages/adapters/src/inbound/http/PositionController.test.ts
- packages/adapters/src/inbound/http/AppModule.ts

## Validation Commands

```bash
pnpm --filter @clmm/application test -- src/use-cases/positions/ListSupportedPositions.test.ts
pnpm --filter @clmm/adapters test -- src/inbound/http/PositionController.test.ts
pnpm --filter @clmm/application typecheck && pnpm --filter @clmm/adapters typecheck
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **every returned pool is explicitly unavailable**: The use case returns null aggregates and null TVL and 24-hour fees for each unique pool represented in returned summaries. (Test: `returns unavailable financial metrics for every returned unique pool`)
- **raw liquidity is never a financial metric**: Changing PoolData.liquidity cannot change any list financial metric. (Test: `does not derive financial metrics from raw pool liquidity`)
- **pool metrics are deduplicated**: Multiple returned positions sharing a pool create one poolsById entry. (Test: `deduplicates unavailable pool metrics when positions share a pool`)
- **successful HTTP responses include metric state**: A successful positions response serializes financialMetrics unchanged alongside positions and optional warnings. (Test: `serializes financial metrics on successful position list responses`)
- **request failure is not metric unavailability**: Transient list failures keep the existing error envelope and do not claim a successful unavailable measurement. (Test: `keeps transient list failures as error envelopes without claimed financial metrics`)

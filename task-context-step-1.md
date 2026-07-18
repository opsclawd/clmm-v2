# Task Context: Task 1

Title: Define and strictly validate the financial metrics contract

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

- Modify: `packages/application/src/dto/index.ts`
- Modify: `packages/application/src/dto/validation.ts`
- Create: `packages/application/src/dto/validation.test.ts`
- Modify: `packages/application/src/public/index.ts`

**Exported signature changes:** Add and publicly export `PositionValueMetricDto`, `UnclaimedFeesMetricDto`, `PoolTvlMetricDto`, `PoolFees24hMetricDto`, `PoolFinancialMetricsDto`, `PositionListFinancialMetricsDto`, and `isPositionListFinancialMetricsDto` from the application public boundary.

**Behavioral invariants to write as named tests first:**

- `accepts unavailable financial metrics` — both response aggregates may be null and every pool metric may be null.
- `accepts exact zero when required metric metadata is present` — zero is a valid non-null USD measurement for all four metric types.
- `accepts populated metrics with matching pool ids and a trailing 24 hour window` — complete positive values pass validation.
- `rejects negative or non-finite financial values` — negative, `NaN`, and infinity fail validation rather than becoming zero or unavailable.
- `rejects incomplete source scope or timestamp metadata` — empty sources, invalid Unix milliseconds, incorrect fixed basis/scope declarations, and missing required metadata fail.
- `rejects pool metric ids that do not match their poolsById keys` — keyed map scope cannot drift from embedded pool identity.
- `rejects pool fee windows that are not exactly 24 hours` — require finite integer timestamps with `windowEndUnixMs - windowStartUnixMs === 86_400_000`.

- [ ] **Step 1: Write the failing validator tests**

Create `packages/application/src/dto/validation.test.ts` with factories for valid metrics and the exact test names above. Use literal zero and positive cases, mutate one field at a time for rejection cases, and include both `Number.NaN` and `Number.POSITIVE_INFINITY`.

```ts
const validMetrics: PositionListFinancialMetricsDto = {
  positionValue: {
    valueUsd: 0,
    valuedAtUnixMs: 1_800_000_000_000,
    source: 'authoritative-test-source',
    basis: 'principal-token-amounts',
    scope: 'returned-supported-positions',
    excludes: ['wallet-balances', 'fees', 'rewards', 'collected-history', 'pnl'],
  },
  unclaimedFees: {
    valueUsd: 0,
    valuedAtUnixMs: 1_800_000_000_000,
    source: 'authoritative-test-source',
    basis: 'currently-claimable-trading-fees',
    scope: 'returned-supported-positions',
    excludes: ['rewards', 'collected-fees', 'lifetime-fees'],
  },
  poolsById: {
    'pool-1': {
      tvl: {
        poolId: 'pool-1' as PoolId,
        valueUsd: 0,
        observedAtUnixMs: 1_800_000_000_000,
        source: 'authoritative-test-source',
        scope: 'whole-orca-pool',
      },
      fees24h: {
        poolId: 'pool-1' as PoolId,
        valueUsd: 0,
        source: 'authoritative-test-source',
        windowStartUnixMs: 1_799_913_600_000,
        windowEndUnixMs: 1_800_000_000_000,
        scope: 'whole-orca-pool',
      },
    },
  },
};
```

- [ ] **Step 2: Run the new tests and confirm the contract is absent**

Run: `pnpm --filter @clmm/application test -- src/dto/validation.test.ts`

Expected: FAIL because the metric DTOs and `isPositionListFinancialMetricsDto` are not yet exported.

- [ ] **Step 3: Add metric-specific DTO declarations**

Add exact literal semantics rather than a generic metric bag:

```ts
export type PositionValueMetricDto = {
  valueUsd: number;
  valuedAtUnixMs: number;
  source: string;
  basis: 'principal-token-amounts';
  scope: 'returned-supported-positions';
  excludes: readonly ['wallet-balances', 'fees', 'rewards', 'collected-history', 'pnl'];
};

export type UnclaimedFeesMetricDto = {
  valueUsd: number;
  valuedAtUnixMs: number;
  source: string;
  basis: 'currently-claimable-trading-fees';
  scope: 'returned-supported-positions';
  excludes: readonly ['rewards', 'collected-fees', 'lifetime-fees'];
};

export type PoolTvlMetricDto = {
  poolId: PoolId;
  valueUsd: number;
  observedAtUnixMs: number;
  source: string;
  scope: 'whole-orca-pool';
};

export type PoolFees24hMetricDto = {
  poolId: PoolId;
  valueUsd: number;
  source: string;
  windowStartUnixMs: number;
  windowEndUnixMs: number;
  scope: 'whole-orca-pool';
};

export type PoolFinancialMetricsDto = {
  tvl: PoolTvlMetricDto | null;
  fees24h: PoolFees24hMetricDto | null;
};

export type PositionListFinancialMetricsDto = {
  positionValue: PositionValueMetricDto | null;
  unclaimedFees: UnclaimedFeesMetricDto | null;
  poolsById: Readonly<Record<string, PoolFinancialMetricsDto>>;
};
```

- [ ] **Step 4: Implement strict runtime validation and public exports**

In `validation.ts`, use focused helpers: a USD amount is finite and non-negative; Unix milliseconds are finite, non-negative integers; source is a non-empty trimmed string; fixed literal fields and ordered exclusion tuples must match exactly. Iterate `Object.entries(poolsById)`, require each entry to contain both nullable keys, and require every non-null embedded `poolId` to equal the map key. Export `isPositionListFinancialMetricsDto` from `packages/application/src/public/index.ts` alongside all seven DTO types.

```ts
const DAY_MS = 86_400_000;

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isUnixMs(value: unknown): value is number {
  return isNonNegativeFinite(value) && Number.isInteger(value);
}

function hasSource(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
```

- [ ] **Step 5: Run focused validation and package gates**

Run: `pnpm --filter @clmm/application test -- src/dto/validation.test.ts`

Expected: PASS for all named contract invariants.

Run: `pnpm --filter @clmm/application typecheck`

Expected: PASS with the new public DTO and validator declarations.

- [ ] **Step 6: Commit the contract**

```bash
git add packages/application/src/dto/index.ts packages/application/src/dto/validation.ts packages/application/src/dto/validation.test.ts packages/application/src/public/index.ts
git commit -m "feat(application): define authoritative position metrics contract"
```

## Repository Targets

### Expected Files

- packages/application/src/dto/index.ts
- packages/application/src/dto/validation.ts
- packages/application/src/dto/validation.test.ts
- packages/application/src/public/index.ts

## Validation Commands

```bash
pnpm --filter @clmm/application test -- src/dto/validation.test.ts
pnpm --filter @clmm/application typecheck
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **unavailable metrics are valid**: Null response aggregates and null per-pool measurements represent authoritative unavailability without becoming zero. (Test: `accepts unavailable financial metrics`)
- **zero remains available**: A non-null metric with valueUsd equal to zero passes when all source, scope, and timing metadata is valid. (Test: `accepts exact zero when required metric metadata is present`)
- **populated metadata is complete**: Positive values pass only with matching pool identity and an exact trailing 24-hour fee window. (Test: `accepts populated metrics with matching pool ids and a trailing 24 hour window`)
- **invalid values fail closed**: Negative, NaN, and infinite USD values are rejected and cannot be normalized to zero or unavailable. (Test: `rejects negative or non-finite financial values`)
- **semantic metadata is mandatory**: Claimed metrics require non-empty sources, valid Unix milliseconds, and the exact metric-specific basis, scope, and exclusions. (Test: `rejects incomplete source scope or timestamp metadata`)
- **pool identity cannot drift**: Every non-null embedded poolId must equal the corresponding poolsById map key. (Test: `rejects pool metric ids that do not match their poolsById keys`)
- **pool fee window is exactly one day**: Pool fee windows require integer Unix milliseconds and an end-minus-start duration of exactly 86400000 milliseconds. (Test: `rejects pool fee windows that are not exactly 24 hours`)

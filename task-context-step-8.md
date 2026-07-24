# Task Context: Task 8

Title: Reconcile and retry execution-result delivery after restart

## Workspace & Scope Constraints

## WORKSPACE CONSTRAINTS

Your working directory is a dedicated git worktree with the repository's complete history. Run all commands from it. Do NOT cd to or read paths outside this directory — external-directory access is automatically rejected. git log, git diff, etc. work here directly.

.ai-orchestrator.local.json, if one exists, lives only in the main checkout and is intentionally not copied into your worktree — it is operator-machine-specific and not part of your task. Do not search for it or read it outside this directory. Reason about configuration using only .ai-orchestrator.json in your own working directory; treat it as the effective config for your task.

Working Directory: /home/gary/.openclaw/workspace/clmm-superpowers-v2/.ai-worktrees/issue-62
Repository: opsclawd/clmm-v2
Branch: ai/issue-62
Start Commit: a992517c4f418e93c2a98914c26582bf40b2515b

## Task Requirements

**Files:**

- Create: `packages/application/src/use-cases/plans/SyncPlanExecutionResults.ts`
- Create: `packages/application/src/use-cases/plans/SyncPlanExecutionResults.test.ts`
- Modify: `packages/application/src/index.ts`
- Create: `packages/adapters/src/inbound/jobs/PlanResultSweepHandler.ts`
- Create: `packages/adapters/src/inbound/jobs/PlanResultSweepHandler.test.ts`
- Modify: `packages/adapters/src/inbound/jobs/WorkerLifecycle.ts`
- Modify: `packages/adapters/src/inbound/jobs/WorkerLifecycle.test.ts`
- Modify: `packages/adapters/src/inbound/jobs/WorkerModule.ts`
- Modify: `packages/adapters/src/inbound/jobs/tokens.ts`

**Behavioral invariants:**

- On launch/schedule, accepted plans with terminal local outcomes but undelivered results are discovered and reported without creating another execution.
- Unknown network outcomes schedule bounded exponential backoff with jitter/cap from constants and preserve the idempotency identity.
- Permanent auth/validation/conflict failures are marked `report-failed` and are not scheduled indefinitely.
- Successful duplicate/idempotent upstream responses mark the local result delivered.
- A non-terminal linked attempt remains pending and is revisited after reconciliation; it is never reported as success early.
- One malformed row or one delivery failure does not prevent other due rows from being processed.

**Acceptance criteria:**

- [ ] Add tests named `reports a persisted terminal result after app restart`, `does not execute again while recovering result delivery`, `retries unknown network outcome with the same idempotency identity`, `caps retry count and backoff`, `stops retrying permanent rejection`, `treats canonical duplicate response as delivered`, and `continues processing after one row fails`.
- [ ] Register a dedicated pg-boss queue and recurring schedule after schema readiness, separate from submitted-attempt reconciliation.
- [ ] Emit bounded observability for claimed, delivered, retried, exhausted, and permanently rejected results.

**Verification:**

```bash
pnpm --filter @clmm/application test -- src/use-cases/plans/SyncPlanExecutionResults.test.ts
pnpm --filter @clmm/adapters test -- src/inbound/jobs/PlanResultSweepHandler.test.ts src/inbound/jobs/WorkerLifecycle.test.ts
pnpm exec eslint packages/application/src/use-cases/plans/SyncPlanExecutionResults.ts packages/application/src/use-cases/plans/SyncPlanExecutionResults.test.ts packages/application/src/index.ts packages/adapters/src/inbound/jobs/PlanResultSweepHandler.ts packages/adapters/src/inbound/jobs/PlanResultSweepHandler.test.ts packages/adapters/src/inbound/jobs/WorkerLifecycle.ts packages/adapters/src/inbound/jobs/WorkerLifecycle.test.ts packages/adapters/src/inbound/jobs/WorkerModule.ts packages/adapters/src/inbound/jobs/tokens.ts
git diff --check -- packages/application/src/use-cases/plans/SyncPlanExecutionResults.ts packages/application/src/use-cases/plans/SyncPlanExecutionResults.test.ts packages/application/src/index.ts packages/adapters/src/inbound/jobs/PlanResultSweepHandler.ts packages/adapters/src/inbound/jobs/PlanResultSweepHandler.test.ts packages/adapters/src/inbound/jobs/WorkerLifecycle.ts packages/adapters/src/inbound/jobs/WorkerLifecycle.test.ts packages/adapters/src/inbound/jobs/WorkerModule.ts packages/adapters/src/inbound/jobs/tokens.ts
```

Expected: recovery/retry tests prove durable, bounded, idempotent reporting and no duplicate execution.

## Repository Targets

### Expected Files

- packages/application/src/use-cases/plans/SyncPlanExecutionResults.ts
- packages/application/src/use-cases/plans/SyncPlanExecutionResults.test.ts
- packages/application/src/index.ts
- packages/adapters/src/inbound/jobs/PlanResultSweepHandler.ts
- packages/adapters/src/inbound/jobs/PlanResultSweepHandler.test.ts
- packages/adapters/src/inbound/jobs/WorkerLifecycle.ts
- packages/adapters/src/inbound/jobs/WorkerLifecycle.test.ts
- packages/adapters/src/inbound/jobs/WorkerModule.ts
- packages/adapters/src/inbound/jobs/tokens.ts

## Validation Commands

```bash
pnpm --filter @clmm/application test -- src/use-cases/plans/SyncPlanExecutionResults.test.ts
pnpm --filter @clmm/adapters test -- src/inbound/jobs/PlanResultSweepHandler.test.ts src/inbound/jobs/WorkerLifecycle.test.ts
pnpm exec eslint packages/application/src/use-cases/plans/SyncPlanExecutionResults.ts packages/application/src/use-cases/plans/SyncPlanExecutionResults.test.ts packages/application/src/index.ts packages/adapters/src/inbound/jobs/PlanResultSweepHandler.ts packages/adapters/src/inbound/jobs/PlanResultSweepHandler.test.ts packages/adapters/src/inbound/jobs/WorkerLifecycle.ts packages/adapters/src/inbound/jobs/WorkerLifecycle.test.ts packages/adapters/src/inbound/jobs/WorkerModule.ts packages/adapters/src/inbound/jobs/tokens.ts
git diff --check -- packages/application/src/use-cases/plans/SyncPlanExecutionResults.ts packages/application/src/use-cases/plans/SyncPlanExecutionResults.test.ts packages/application/src/index.ts packages/adapters/src/inbound/jobs/PlanResultSweepHandler.ts packages/adapters/src/inbound/jobs/PlanResultSweepHandler.test.ts packages/adapters/src/inbound/jobs/WorkerLifecycle.ts packages/adapters/src/inbound/jobs/WorkerLifecycle.test.ts packages/adapters/src/inbound/jobs/WorkerModule.ts packages/adapters/src/inbound/jobs/tokens.ts
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **restart recovery reports without execution**: Persisted terminal outcomes resume only result delivery after restart. (Test: `does not execute again while recovering result delivery`)
- **retry is bounded and stable**: Retryable unknown outcomes preserve idempotency identity and stop at the configured cap. (Test: `caps retry count and backoff`)
- **permanent rejection terminates delivery**: Authentication, validation, and conflict rejection are not rescheduled. (Test: `stops retrying permanent rejection`)
- **poison row isolation**: One failed row does not block other due results. (Test: `continues processing after one row fails`)

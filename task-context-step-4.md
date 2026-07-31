# Task Context: Task 4

Title: Prove execution-result correlation against the upstream contract

## Workspace & Scope Constraints

## WORKSPACE CONSTRAINTS

Your working directory is a dedicated git worktree with the repository's complete history. Run all commands from it. Do NOT cd to or read paths outside this directory — external-directory access is automatically rejected. git log, git diff, etc. work here directly.

.ai-orchestrator.local.json, if one exists, lives only in the main checkout and is intentionally not copied into your worktree — it is operator-machine-specific and not part of your task. Do not search for it or read it outside this directory. Reason about configuration using only .ai-orchestrator.json in your own working directory; treat it as the effective config for your task.

Working Directory: /home/gary/.openclaw/workspace/clmm-superpowers-v2/.ai-worktrees/issue-113
Repository: opsclawd/clmm-v2
Branch: ai/issue-113
Start Commit: 5f7441cba33fa9c7f53c4281f12a73ed4e205f0f

## Task Requirements

**Files:**

- Modify: `packages/application/src/ports/index.ts`
- Modify: `packages/application/src/use-cases/plans/SyncPlanExecutionResults.ts`
- Modify: `packages/application/src/use-cases/plans/SyncPlanExecutionResults.test.ts`
- Modify: `packages/application/src/dto/regimePlan.ts`
- Modify: `packages/application/src/dto/regimePlanValidator.ts`
- Modify: `packages/application/src/dto/regimePlanValidator.test.ts`
- Modify: `packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts`
- Modify: `packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts`
- Modify: `packages/testing/src/fakes/FakeRegimePlanPort.ts`
- Modify: `packages/testing/src/scenarios/PositionPlanLifecycle.test.ts`
- Read only: `schemas/regime-engine/execution-result.v1/schema.json`
- Read only: `schemas/regime-engine/execution-result.v1/fixtures/valid/success.json`
- Read only: `schemas/regime-engine/execution-result.v1/fixtures/valid/skipped.json`

- [ ] Add tests first named `reports the persisted remote planId and planHash unchanged`, `validates the built result before transport`, `preserves remote identity across retries`, and `fails the outbox row permanently when the persisted payload cannot form a canonical result`.
- [ ] Build the result from persisted `PlanResultClaim` data only. Require `canonicalHash`, `positionId`, decision kind, and stored action kind; do not substitute empty strings or default a missing decision to `executed`.
- [ ] Validate with `parseRegimeExecutionResult` before calling the port. A malformed persisted payload is a permanent local rejection recorded through `failDelivery`, not a retryable network outcome.
- [ ] Align `schemaVersion`, status, and reason-code mapping to the refreshed vendored contract. Preserve the existing retry loop, cap, idempotency key, and continue-after-one-row behavior.
- [ ] Add an adapter-side preflight guard so a direct invalid `reportExecutionResult` call returns `permanent: schema-invalid` without fetch.
- [ ] Update `FakeRegimePlanPort` and `PositionPlanLifecycle.test.ts` to construct, mock, and assert `RegimeExecutionResult` using the reconciled schema version and payload shape.
- [ ] Commit as `fix(plans): preserve execution result correlation identity`.

**Behavioral invariants and named tests:**

- Valid persisted result + transport OK -> complete delivery once: `reports the persisted remote planId and planHash unchanged`.
- Retryable transport failure + attempt below cap -> reschedule with the same plan identity and idempotency key: `preserves remote identity across retries`.
- Invalid persisted result -> mark permanent failure and continue claiming later rows: `fails the outbox row permanently when the persisted payload cannot form a canonical result`.
- One permanently rejected row does not stop the do/while sweep: retain `processes multiple due results even if one fails permanently`.

**Acceptance and scoped verification:**

```bash
pnpm --filter @clmm/application exec vitest run src/use-cases/plans/SyncPlanExecutionResults.test.ts src/dto/regimePlanValidator.test.ts
pnpm --filter @clmm/adapters exec vitest run src/outbound/regime-engine/RegimePlanAdapter.test.ts
pnpm --filter @clmm/testing exec vitest run src/scenarios/PositionPlanLifecycle.test.ts
pnpm --filter @clmm/application exec eslint src/use-cases/plans/SyncPlanExecutionResults.ts src/use-cases/plans/SyncPlanExecutionResults.test.ts src/dto/regimePlan.ts src/dto/regimePlanValidator.ts src/dto/regimePlanValidator.test.ts --ext .ts
pnpm --filter @clmm/adapters exec eslint src/outbound/regime-engine/RegimePlanAdapter.ts src/outbound/regime-engine/RegimePlanAdapter.test.ts --ext .ts
pnpm --filter @clmm/testing exec eslint src/fakes/FakeRegimePlanPort.ts src/scenarios/PositionPlanLifecycle.test.ts --ext .ts
git diff --check -- packages/application/src/ports/index.ts packages/application/src/use-cases/plans/SyncPlanExecutionResults.ts packages/application/src/use-cases/plans/SyncPlanExecutionResults.test.ts packages/application/src/dto/regimePlan.ts packages/application/src/dto/regimePlanValidator.ts packages/application/src/dto/regimePlanValidator.test.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts packages/testing/src/fakes/FakeRegimePlanPort.ts packages/testing/src/scenarios/PositionPlanLifecycle.test.ts
```

## Repository Targets

### Expected Files

- packages/application/src/ports/index.ts
- packages/application/src/use-cases/plans/SyncPlanExecutionResults.ts
- packages/application/src/use-cases/plans/SyncPlanExecutionResults.test.ts
- packages/application/src/dto/regimePlan.ts
- packages/application/src/dto/regimePlanValidator.ts
- packages/application/src/dto/regimePlanValidator.test.ts
- packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts
- packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts
- packages/testing/src/fakes/FakeRegimePlanPort.ts
- packages/testing/src/scenarios/PositionPlanLifecycle.test.ts

### Reference Files

- schemas/regime-engine/execution-result.v1/schema.json
- schemas/regime-engine/execution-result.v1/fixtures/valid/success.json
- schemas/regime-engine/execution-result.v1/fixtures/valid/skipped.json
- packages/application/src/ports/index.ts
- packages/testing/src/fakes/FakeRegimePlanPort.ts

## Validation Commands

```bash
pnpm --filter @clmm/application exec vitest run src/use-cases/plans/SyncPlanExecutionResults.test.ts src/dto/regimePlanValidator.test.ts
pnpm --filter @clmm/adapters exec vitest run src/outbound/regime-engine/RegimePlanAdapter.test.ts
pnpm --filter @clmm/testing exec vitest run src/scenarios/PositionPlanLifecycle.test.ts
git diff --check -- packages/application/src/ports/index.ts packages/application/src/use-cases/plans/SyncPlanExecutionResults.ts packages/application/src/use-cases/plans/SyncPlanExecutionResults.test.ts packages/application/src/dto/regimePlan.ts packages/application/src/dto/regimePlanValidator.ts packages/application/src/dto/regimePlanValidator.test.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts packages/testing/src/fakes/FakeRegimePlanPort.ts packages/testing/src/scenarios/PositionPlanLifecycle.test.ts
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **result-identity-correlation**: Every reported result contains the persisted remote planId and planHash without fallback or recomputation. (Test: `reports the persisted remote planId and planHash unchanged`)
- **retry-identity-stability**: A retry preserves plan identity and idempotency key while only scheduling the next attempt. (Test: `preserves remote identity across retries`)
- **invalid-result-permanent-failure**: An incomplete persisted payload never reaches fetch and is marked permanently failed while later rows continue. (Test: `fails the outbox row permanently when the persisted payload cannot form a canonical result`)
- **sweep-continues-after-rejection**: A permanently rejected claim does not terminate the claim loop for subsequent due results. (Test: `processes multiple due results even if one fails permanently`)

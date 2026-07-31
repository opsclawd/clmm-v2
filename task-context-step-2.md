# Task Context: Task 2

Title: Correct the plan transport endpoint without changing failure semantics

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

- Modify: `packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts`
- Modify: `packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts`

- [ ] Change the existing transport test first so `posts the exact canonical position-plan request` expects `https://regime.example.com/v1/plan` and still asserts `POST`, JSON content type, and `X-CLMM-Internal-Token`.
- [ ] Change only the plan URL construction from `/v1/position-plan` to `/v1/plan`. Keep timeout, error-envelope parsing, and status classification unchanged.
- [ ] Add a trailing-slash case proving `https://regime.example.com/` resolves to exactly one slash before `v1/plan`.
- [ ] Preserve the execution-result path `/v1/execution-result` and its authentication assertion.
- [ ] Commit as `fix(adapters): target regime v1 plan endpoint`.

**Acceptance and scoped verification:**

```bash
pnpm --filter @clmm/adapters exec vitest run src/outbound/regime-engine/RegimePlanAdapter.test.ts
pnpm --filter @clmm/adapters exec eslint src/outbound/regime-engine/RegimePlanAdapter.ts src/outbound/regime-engine/RegimePlanAdapter.test.ts --ext .ts
git diff --check -- packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts
```

Expected: the focused adapter suite passes with `/v1/plan`; auth, timeout, 4xx, and 5xx classifications are unchanged.

## Repository Targets

### Expected Files

- packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts
- packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts

### Reference Files

- packages/application/src/ports/index.ts
- packages/application/src/dto/regimePlan.ts

## Validation Commands

```bash
pnpm --filter @clmm/adapters exec vitest run src/outbound/regime-engine/RegimePlanAdapter.test.ts
pnpm --filter @clmm/adapters exec eslint src/outbound/regime-engine/RegimePlanAdapter.ts src/outbound/regime-engine/RegimePlanAdapter.test.ts --ext .ts
git diff --check -- packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **canonical-plan-route**: A plan request posts to exactly /v1/plan with the existing shared-secret header, while the execution-result route remains unchanged. (Test: `posts the exact canonical position-plan request`)
- **transport-classification-stability**: Changing the URL does not alter permanent versus retryable response classification. (Test: `preserves auth timeout client-error and server-error classifications after the route change`)

# Task Context: Task 9

Title: Expose plan lifecycle through the BFF and wire backend composition

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

- Create: `packages/adapters/src/inbound/http/PlanController.ts`
- Create: `packages/adapters/src/inbound/http/PlanController.test.ts`
- Modify: `packages/adapters/src/inbound/http/AppModule.ts`
- Modify: `packages/adapters/src/inbound/http/tokens.ts`
- Modify: `packages/adapters/src/composition/AdaptersModule.ts`
- Modify: `packages/adapters/src/inbound/jobs/tokens.ts`

**Behavioral invariants:**

- Plan routes require wallet and position identity and return `404` for ownership mismatch without leaking another wallet's plan.
- Request, acknowledge/decline, preview, and approval endpoints map application discriminants to stable HTTP statuses and bounded bodies.
- Replayed commands return the existing resource/result identity; conflicts return `409` and never execute.
- Advisory degradation remains a successful bounded BFF state and does not alter health or deterministic execution routes.
- Regime credentials stay backend-only.

**Acceptance criteria:**

- [ ] Add `POST /plans/:walletId/:positionId/request`, `GET /plans/:walletId/:positionId/current`, `POST /plans/:walletId/:positionId/:planId/decision`, `POST /plans/:walletId/:positionId/:planId/preview`, and `POST /plans/:walletId/:positionId/:planId/approve` handlers.
- [ ] Register `PlanRepository`, `RegimePlanPort`, and shared execution dependencies in both API and worker composition; do not add `EXPO_PUBLIC_REGIME_ENGINE_*`.
- [ ] Add tests named `returns a position-scoped plan envelope`, `returns advisory degraded without affecting position routes`, `rejects wallet ownership mismatch`, `returns existing identity for replay`, `returns conflict without preview or submission`, and `never exposes Regime credentials or raw validation diagnostics`.

**Verification:**

```bash
pnpm --filter @clmm/adapters test -- src/inbound/http/PlanController.test.ts
pnpm exec eslint packages/adapters/src/inbound/http/PlanController.ts packages/adapters/src/inbound/http/PlanController.test.ts packages/adapters/src/inbound/http/AppModule.ts packages/adapters/src/inbound/http/tokens.ts packages/adapters/src/composition/AdaptersModule.ts packages/adapters/src/inbound/jobs/tokens.ts
git diff --check -- packages/adapters/src/inbound/http/PlanController.ts packages/adapters/src/inbound/http/PlanController.test.ts packages/adapters/src/inbound/http/AppModule.ts packages/adapters/src/inbound/http/tokens.ts packages/adapters/src/composition/AdaptersModule.ts packages/adapters/src/inbound/jobs/tokens.ts
```

Expected: controller and composition tests pass with no client-visible Regime secret.

## Repository Targets

### Expected Files

- packages/adapters/src/inbound/http/PlanController.ts
- packages/adapters/src/inbound/http/PlanController.test.ts
- packages/adapters/src/inbound/http/AppModule.ts
- packages/adapters/src/inbound/http/tokens.ts
- packages/adapters/src/composition/AdaptersModule.ts
- packages/adapters/src/inbound/jobs/tokens.ts

## Validation Commands

```bash
pnpm --filter @clmm/adapters test -- src/inbound/http/PlanController.test.ts
pnpm exec eslint packages/adapters/src/inbound/http/PlanController.ts packages/adapters/src/inbound/http/PlanController.test.ts packages/adapters/src/inbound/http/AppModule.ts packages/adapters/src/inbound/http/tokens.ts packages/adapters/src/composition/AdaptersModule.ts packages/adapters/src/inbound/jobs/tokens.ts
git diff --check -- packages/adapters/src/inbound/http/PlanController.ts packages/adapters/src/inbound/http/PlanController.test.ts packages/adapters/src/inbound/http/AppModule.ts packages/adapters/src/inbound/http/tokens.ts packages/adapters/src/composition/AdaptersModule.ts packages/adapters/src/inbound/jobs/tokens.ts
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **wallet ownership is enforced**: Plan routes do not expose or mutate another wallet's position or plan. (Test: `rejects wallet ownership mismatch`)
- **HTTP replay is idempotent**: Repeated commands return the existing identity while content conflicts return 409 without execution. (Test: `returns existing identity for replay`)
- **credentials remain backend only**: BFF responses and client configuration never expose Regime credentials. (Test: `never exposes Regime credentials or raw validation diagnostics`)

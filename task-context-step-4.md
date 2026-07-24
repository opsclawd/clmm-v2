# Task Context: Task 4

Title: Implement authenticated Regime plan and result transport

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

- Modify: `packages/application/src/ports/index.ts`
- Create: `packages/testing/src/fakes/FakeRegimePlanPort.ts`
- Modify: `packages/testing/src/fakes/index.ts`
- Create: `packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts`
- Create: `packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts`

**Behavioral invariants:**

- A valid plan response is parsed through the canonical validator before it reaches application logic.
- Timeout, network failure, `5xx`, and the contract's retryable statuses return explicit degraded/retryable results and never throw into deterministic monitoring.
- Unknown version/action, invalid JSON, and schema-invalid `2xx` bodies fail closed as malformed.
- Authentication, validation, and conflict failures are permanent and are never retried indefinitely.
- Every execution-result retry sends byte-equivalent canonical payload and the same idempotency identity.
- The adapter never calls `/v1/clmm-execution-result`.

**Acceptance criteria:**

- [ ] Add `RegimePlanPort.requestPositionPlan` and `RegimePlanPort.reportExecutionResult`; update `RegimePlanAdapter` and `FakeRegimePlanPort` in this same task.
- [ ] Use only `REGIME_ENGINE_BASE_URL` plus the exact backend-only authentication semantics from the pinned contract.
- [ ] Apply an abortable request timeout. Do not put retry loops in the adapter; return typed classifications so the persisted outbox owns retries.
- [ ] Log bounded metadata only: plan/result IDs, position ID, status class, duration, and validation reason. Never log wallet secrets, auth tokens, signed payloads, or complete monetary payloads.
- [ ] Add tests named `posts the exact canonical position-plan request`, `authenticates both write endpoints`, `fails closed on unknown action version and malformed body`, `classifies timeout and server failure as degraded`, `classifies auth validation and conflict as permanent`, and `reuses payload and idempotency identity across result attempts`.

**Verification:**

```bash
pnpm --filter @clmm/adapters test -- src/outbound/regime-engine/RegimePlanAdapter.test.ts
pnpm exec eslint packages/application/src/ports/index.ts packages/testing/src/fakes/FakeRegimePlanPort.ts packages/testing/src/fakes/index.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts
git diff --check -- packages/application/src/ports/index.ts packages/testing/src/fakes/FakeRegimePlanPort.ts packages/testing/src/fakes/index.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts
```

Expected: transport tests prove authentication, validation, classification, endpoint separation, and stable result idempotency.

## Repository Targets

### Expected Files

- packages/application/src/ports/index.ts
- packages/testing/src/fakes/FakeRegimePlanPort.ts
- packages/testing/src/fakes/index.ts
- packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts
- packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts

## Validation Commands

```bash
pnpm --filter @clmm/adapters test -- src/outbound/regime-engine/RegimePlanAdapter.test.ts
pnpm exec eslint packages/application/src/ports/index.ts packages/testing/src/fakes/FakeRegimePlanPort.ts packages/testing/src/fakes/index.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts
git diff --check -- packages/application/src/ports/index.ts packages/testing/src/fakes/FakeRegimePlanPort.ts packages/testing/src/fakes/index.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **transport validation is fail closed**: Malformed or unsupported successful responses never reach application logic as plans. (Test: `fails closed on unknown action version and malformed body`)
- **result retry identity is stable**: Every attempt for one result uses the same canonical payload and idempotency identity. (Test: `reuses payload and idempotency identity across result attempts`)
- **permanent failures do not loop**: Authentication, validation, and conflict failures are classified as permanent. (Test: `classifies auth validation and conflict as permanent`)

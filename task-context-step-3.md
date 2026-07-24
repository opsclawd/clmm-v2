# Task Context: Task 3

Title: Persist plan lifecycle and the result outbox atomically

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
- Create: `packages/testing/src/fakes/FakePlanRepository.ts`
- Modify: `packages/testing/src/fakes/index.ts`
- Create: `packages/adapters/src/outbound/storage/schema/position-plans.ts`
- Modify: `packages/adapters/src/outbound/storage/schema/index.ts`
- Create: `packages/adapters/src/outbound/storage/PlanStorageAdapter.ts`
- Create: `packages/adapters/src/outbound/storage/PlanStorageAdapter.test.ts`
- Create: `packages/adapters/drizzle/0002_position_plan_lifecycle.sql`
- Create: `packages/adapters/drizzle/meta/0002_snapshot.json`
- Modify: `packages/adapters/drizzle/meta/_journal.json`

**Behavioral invariants:**

- The first response for a plan ID inserts the plan; an identical plan ID/hash returns `exact-replay`; a different hash returns `conflict` without overwriting original content.
- One plan can link to at most one execution attempt, and one execution attempt can link to at most one plan.
- A terminal local outcome and its canonical result payload/idempotency identity are committed in one transaction.
- Claiming due result rows is concurrency-safe; one row is not delivered by two workers simultaneously.
- Retry scheduling preserves payload and idempotency identity while incrementing attempt count and moving `nextAttemptAt`.
- Marking delivered stores completion metadata and removes the row from future claims.

**Acceptance criteria:**

- [ ] Add `PlanRepository` with explicit methods for request creation, response acceptance, current-plan lookup, decision recording, execution linkage, terminal-result enqueue, due-result claim, retry scheduling, delivery completion, and permanent failure.
- [ ] In the same task, implement every method in `PlanStorageAdapter` and `FakePlanRepository`.
- [ ] Store plan identity/hash/version, position/wallet identity, request/response/as-of/expiry timestamps, action/reasons, snapshot fingerprint, lifecycle/decision, execution attempt ID, canonical result JSON, result idempotency key, delivery attempts, next attempt, last error class, and delivered timestamp.
- [ ] Add database uniqueness/check constraints for replay identity, one-to-one attempt linkage, valid lifecycle values, and result-delivery consistency.
- [ ] Generate a forward-only migration and metadata; never edit an existing migration.
- [ ] Add tests named `accepts an exact plan replay without duplication`, `preserves original plan on conflicting replay`, `links one execution attempt exactly once`, `commits terminal outcome and outbox together`, `claims each due result once under concurrency`, and `reschedules retry without changing idempotency identity`.

**Verification:**

```bash
pnpm --filter @clmm/adapters test -- src/outbound/storage/PlanStorageAdapter.test.ts
pnpm exec eslint packages/application/src/ports/index.ts packages/testing/src/fakes/FakePlanRepository.ts packages/testing/src/fakes/index.ts packages/adapters/src/outbound/storage/schema/position-plans.ts packages/adapters/src/outbound/storage/schema/index.ts packages/adapters/src/outbound/storage/PlanStorageAdapter.ts packages/adapters/src/outbound/storage/PlanStorageAdapter.test.ts
git diff --check -- packages/application/src/ports/index.ts packages/testing/src/fakes/FakePlanRepository.ts packages/testing/src/fakes/index.ts packages/adapters/src/outbound/storage/schema/position-plans.ts packages/adapters/src/outbound/storage/schema/index.ts packages/adapters/src/outbound/storage/PlanStorageAdapter.ts packages/adapters/src/outbound/storage/PlanStorageAdapter.test.ts packages/adapters/drizzle/0002_position_plan_lifecycle.sql packages/adapters/drizzle/meta/0002_snapshot.json packages/adapters/drizzle/meta/_journal.json
```

Expected: focused repository tests pass and the migration creates only the new plan/outbox structures.

## Repository Targets

### Expected Files

- packages/application/src/ports/index.ts
- packages/testing/src/fakes/FakePlanRepository.ts
- packages/testing/src/fakes/index.ts
- packages/adapters/src/outbound/storage/schema/position-plans.ts
- packages/adapters/src/outbound/storage/schema/index.ts
- packages/adapters/src/outbound/storage/PlanStorageAdapter.ts
- packages/adapters/src/outbound/storage/PlanStorageAdapter.test.ts
- packages/adapters/drizzle/0002_position_plan_lifecycle.sql
- packages/adapters/drizzle/meta/0002_snapshot.json
- packages/adapters/drizzle/meta/\_journal.json

## Validation Commands

```bash
pnpm --filter @clmm/adapters test -- src/outbound/storage/PlanStorageAdapter.test.ts
pnpm exec eslint packages/application/src/ports/index.ts packages/testing/src/fakes/FakePlanRepository.ts packages/testing/src/fakes/index.ts packages/adapters/src/outbound/storage/schema/position-plans.ts packages/adapters/src/outbound/storage/schema/index.ts packages/adapters/src/outbound/storage/PlanStorageAdapter.ts packages/adapters/src/outbound/storage/PlanStorageAdapter.test.ts
git diff --check -- packages/application/src/ports/index.ts packages/testing/src/fakes/FakePlanRepository.ts packages/testing/src/fakes/index.ts packages/adapters/src/outbound/storage/schema/position-plans.ts packages/adapters/src/outbound/storage/schema/index.ts packages/adapters/src/outbound/storage/PlanStorageAdapter.ts packages/adapters/src/outbound/storage/PlanStorageAdapter.test.ts packages/adapters/drizzle/0002_position_plan_lifecycle.sql packages/adapters/drizzle/meta/0002_snapshot.json packages/adapters/drizzle/meta/_journal.json
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **plan replay uniqueness**: Exact replay is idempotent and conflicting replay cannot overwrite original content. (Test: `preserves original plan on conflicting replay`)
- **terminal outcome and outbox are atomic**: A terminal local outcome and canonical result delivery record commit together. (Test: `commits terminal outcome and outbox together`)
- **due result claim is exclusive**: Concurrent workers cannot claim the same due result simultaneously. (Test: `claims each due result once under concurrency`)

# Task Context: Task 11

Title: Add lifecycle scenarios and operational documentation

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

- Create: `packages/testing/src/scenarios/PositionPlanLifecycle.test.ts`
- Modify: `README.md`
- Modify: `.env.sample`
- Modify: `docs/architecture/domain-model.md`
- Modify: `docs/architecture/repo-map.md`
- Modify: `docs/architecture/release-checklist.md`

**Behavioral invariants:**

- End-to-end exact replay does not duplicate a plan, preview, attempt, transaction submission, or result.
- Restart after acceptance/terminal execution resumes only result reporting.
- Lower and upper qualified breaches remain actionable over plan outage, hold, and stand-down.
- Position change before approval yields the canonical non-executed result.
- Successful, failed, declined, stale/expired, superseded, and abandoned outcomes close the audit loop exactly once.

**Acceptance criteria:**

- [ ] Add scenario tests named `qualified lower breach outranks unavailable plan`, `qualified upper breach outranks hold plan`, `position change before signing skips plan execution`, `user decline reports once`, `successful exit reports authoritative result once`, `failed transaction reports failure once`, `restart resumes reporting without reexecution`, `result replay preserves idempotency`, and `conflicting result fails permanently`.
- [ ] Document backend-only Regime variables, migration ownership, worker/result-outbox behavior, endpoint separation, execution-origin model, breach precedence, and manual failure drills.
- [ ] Add release-checklist items for applying the migration before worker rollout, verifying private authentication, inducing a retryable result timeout, restarting the worker, and confirming no duplicate execution.

**Verification:**

```bash
pnpm --filter @clmm/testing test -- src/scenarios/PositionPlanLifecycle.test.ts
pnpm exec prettier --check packages/testing/src/scenarios/PositionPlanLifecycle.test.ts README.md docs/architecture/domain-model.md docs/architecture/repo-map.md docs/architecture/release-checklist.md
git diff --check -- packages/testing/src/scenarios/PositionPlanLifecycle.test.ts README.md .env.sample docs/architecture/domain-model.md docs/architecture/repo-map.md docs/architecture/release-checklist.md
```

Expected: all named scenarios pass and the documentation describes the actual persisted/retry behavior and deployment order.

## Tests to add or update

- Canonical fixture parity and validator rejection tests for both vendored schemas.
- Pure lifecycle transition and execution-origin tests.
- PostgreSQL repository tests for replay conflict, atomic outbox writes, concurrency claims, and retry scheduling.
- HTTP adapter tests for auth, timeout, malformed data, permanent failures, and idempotency.
- Application tests for authoritative request construction, breach precedence, acknowledgement, plan exit safety, decline, success/failure, and recovery.
- Worker tests for bounded backoff, restart recovery, poison-row isolation, and no duplicate execution.
- BFF tests for ownership, replay/conflict status mapping, and secret-safe responses.
- UI tests for every supported action and every fail-closed/degraded state.
- Cross-package lifecycle scenarios for the acceptance-criteria matrix.

## Validation commands

The dedicated validation phase, after all implementation tasks, should run:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
```

Expected: all five repository-wide commands pass. These are not a standalone implementation task; each task also has focused verification above.

## Risk areas

- The canonical contracts are not pinned in the current issue; implementation cannot safely start yet.
- The design's phrase “bridge into `CreateExecutionPreview`” hides a semantic mismatch: existing attempts require a real breach direction. The explicit `ExecutionOrigin` migration is required to avoid falsifying history and UI.
- Database migration and worker rollout order can produce restart loops if the worker sees new schema expectations before the API-owned migration runs.
- Unknown network outcomes can duplicate result posts unless payload and idempotency identity are persisted before delivery.
- Race conditions exist between plan request/approval and deterministic trigger qualification; transactional transitions and a final pre-signing breach check are required.
- Position fingerprints must include exactly contract-relevant authoritative fields: too little misses material changes; too much causes harmless changes to invalidate plans.
- Monetary/result data must remain omitted when not authoritative; estimates must not be reported as realized amounts.
- Authentication/private-network behavior must match the pinned contract exactly; weakening it would create a public write surface.

## Stop conditions

- Stop before Task 1 if the issue still lacks exact merged contract pins, checksums, and authentication semantics.
- Stop if the vendored assets do not match the pinned upstream SHA-256 values.
- Stop if `REQUEST_EXIT_CLMM` lacks an authoritative post-exit intent; do not infer direction from token order, range state, PolicyInsight, or current holdings.
- Stop if the live endpoint is unauthenticated and not provably private-only.
- Stop if the schema requires monetary/result fields clmm-v2 cannot populate authoritatively.
- Stop if a proposed implementation would move directional mapping outside `packages/domain/src/exit-policy/DirectionalExitPolicyService.ts`.
- Stop if a task would leave a changed port/interface without all implementations and fakes updated in that same task.
- Stop deployment if the new migration has not completed before API/worker code requiring the new tables starts.
- Stop and repair before continuing if any focused lower/upper breach regression test fails.

## Repository Targets

### Expected Files

- packages/testing/src/scenarios/PositionPlanLifecycle.test.ts
- README.md
- .env.sample
- docs/architecture/domain-model.md
- docs/architecture/repo-map.md
- docs/architecture/release-checklist.md

## Validation Commands

```bash
pnpm --filter @clmm/testing test -- src/scenarios/PositionPlanLifecycle.test.ts
pnpm exec prettier --check packages/testing/src/scenarios/PositionPlanLifecycle.test.ts README.md docs/architecture/domain-model.md docs/architecture/repo-map.md docs/architecture/release-checklist.md
git diff --check -- packages/testing/src/scenarios/PositionPlanLifecycle.test.ts README.md .env.sample docs/architecture/domain-model.md docs/architecture/repo-map.md docs/architecture/release-checklist.md
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **end-to-end replay is idempotent**: Replaying a lifecycle does not duplicate plan, preview, attempt, submission, or result. (Test: `result replay preserves idempotency`)
- **restart resumes reporting only**: Restart after terminal execution resumes audit delivery without another execution. (Test: `restart resumes reporting without reexecution`)
- **actual outcomes close once**: Success, failure, decline, expiry, supersession, and abandonment each close the audit loop exactly once. (Test: `successful exit reports authoritative result once`)

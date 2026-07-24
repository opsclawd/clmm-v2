# Task Context: Task 2

Title: Model the plan lifecycle and explicit execution origin

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

- Create: `packages/domain/src/regime/PositionPlan.ts`
- Create: `packages/domain/src/regime/PlanLifecycleReducer.ts`
- Create: `packages/domain/src/regime/PlanLifecycleReducer.test.ts`
- Modify: `packages/domain/src/regime/index.ts`
- Modify: `packages/domain/src/execution/index.ts`
- Modify: `packages/domain/src/history/index.ts`
- Modify: `packages/domain/src/exit-policy/DirectionalExitPolicyService.ts`
- Modify: `packages/domain/src/exit-policy/DirectionalExitPolicyService.test.ts`

**Behavioral invariants:**

- `requested + valid response -> advisory-ready`; exact replay preserves the existing record; same plan ID with a different canonical hash transitions to `conflict` and cannot execute.
- `advisory-ready(HOLD|STAND_DOWN) + acknowledge -> result-pending` with no execution origin or attempt.
- `advisory-ready(REQUEST_EXIT_CLMM) + preview -> exit-previewed`; approval may then move through `awaiting-signature`, `submitted`, and `result-pending`.
- `advisory-ready|exit-previewed|awaiting-signature + qualified breach -> superseded`; the breach remains independently actionable.
- An expired/stale/position-changed plan can move only to `result-pending` with the canonical non-executed outcome.
- `result-pending + delivery success -> reported`; retry scheduling leaves it `result-pending`; permanent rejection moves to `report-failed` without re-execution.
- Terminal/reported/conflict plans reject transitions that would create another preview or attempt.
- `ExecutionOrigin` is either `qualified-breach` with a real `BreachDirection` or `regime-plan` with plan ID/hash and canonical exit intent; neither variant can be constructed with the other variant's fields.
- Lower and upper breach behavior remains exactly the release-blocker mapping in `DirectionalExitPolicyService`; no plan-intent mapping is added elsewhere.

**Acceptance criteria:**

- [ ] Write named tests `transitions a valid requested plan to advisory-ready`, `keeps exact response replay idempotent`, `fails closed on same plan id with different content`, `acknowledges hold without creating execution`, `supersedes advisory work when a breach qualifies`, `prevents execution after expiry or material position change`, `keeps retryable result delivery pending`, `rejects duplicate execution from a terminal plan`, and `keeps breach and regime-plan execution origins disjoint`.
- [ ] Add an exhaustive pure reducer that returns typed transition results and throws on impossible runtime discriminants.
- [ ] Introduce `ExecutionOrigin` alongside the existing execution/history types without changing their required members yet; Task 7 performs the atomic signature migration with every consumer and storage implementation.
- [ ] Add regression tests named `lower breach still exits to USDC` and `upper breach still exits to SOL`.

**Verification:**

```bash
pnpm --filter @clmm/domain test -- src/regime/PlanLifecycleReducer.test.ts src/exit-policy/DirectionalExitPolicyService.test.ts
pnpm exec eslint packages/domain/src/regime/PositionPlan.ts packages/domain/src/regime/PlanLifecycleReducer.ts packages/domain/src/regime/PlanLifecycleReducer.test.ts packages/domain/src/regime/index.ts packages/domain/src/execution/index.ts packages/domain/src/history/index.ts packages/domain/src/exit-policy/DirectionalExitPolicyService.ts packages/domain/src/exit-policy/DirectionalExitPolicyService.test.ts
git diff --check -- packages/domain/src/regime/PositionPlan.ts packages/domain/src/regime/PlanLifecycleReducer.ts packages/domain/src/regime/PlanLifecycleReducer.test.ts packages/domain/src/regime/index.ts packages/domain/src/execution/index.ts packages/domain/src/history/index.ts packages/domain/src/exit-policy/DirectionalExitPolicyService.ts packages/domain/src/exit-policy/DirectionalExitPolicyService.test.ts
```

Expected: all lifecycle and directional-policy tests pass, including the unchanged lower/upper mapping.

## Repository Targets

### Expected Files

- packages/domain/src/regime/PositionPlan.ts
- packages/domain/src/regime/PlanLifecycleReducer.ts
- packages/domain/src/regime/PlanLifecycleReducer.test.ts
- packages/domain/src/regime/index.ts
- packages/domain/src/execution/index.ts
- packages/domain/src/history/index.ts
- packages/domain/src/exit-policy/DirectionalExitPolicyService.ts
- packages/domain/src/exit-policy/DirectionalExitPolicyService.test.ts

## Validation Commands

```bash
pnpm --filter @clmm/domain test -- src/regime/PlanLifecycleReducer.test.ts src/exit-policy/DirectionalExitPolicyService.test.ts
pnpm exec eslint packages/domain/src/regime/PositionPlan.ts packages/domain/src/regime/PlanLifecycleReducer.ts packages/domain/src/regime/PlanLifecycleReducer.test.ts packages/domain/src/regime/index.ts packages/domain/src/execution/index.ts packages/domain/src/history/index.ts packages/domain/src/exit-policy/DirectionalExitPolicyService.ts packages/domain/src/exit-policy/DirectionalExitPolicyService.test.ts
git diff --check -- packages/domain/src/regime/PositionPlan.ts packages/domain/src/regime/PlanLifecycleReducer.ts packages/domain/src/regime/PlanLifecycleReducer.test.ts packages/domain/src/regime/index.ts packages/domain/src/execution/index.ts packages/domain/src/history/index.ts packages/domain/src/exit-policy/DirectionalExitPolicyService.ts packages/domain/src/exit-policy/DirectionalExitPolicyService.test.ts
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **exact response replay is idempotent**: The same plan ID and canonical hash preserve the existing plan and cannot create another execution. (Test: `keeps exact response replay idempotent`)
- **conflicting replay fails closed**: The same plan ID with different content transitions to conflict and remains unexecuted. (Test: `fails closed on same plan id with different content`)
- **breach supersedes advisory plan**: A qualified breach moves advisory work to superseded while leaving the breach independently actionable. (Test: `supersedes advisory work when a breach qualifies`)
- **execution origins are truthful**: Qualified breaches require a real direction and Regime plans require plan identity and canonical exit intent. (Test: `keeps breach and regime-plan execution origins disjoint`)

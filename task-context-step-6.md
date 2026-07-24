# Task Context: Task 6

Title: Record advisory decisions and enqueue canonical results

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

- Create: `packages/application/src/use-cases/plans/RecordPlanDecision.ts`
- Create: `packages/application/src/use-cases/plans/RecordPlanDecision.test.ts`
- Modify: `packages/application/src/index.ts`
- Modify: `packages/application/src/public/index.ts`

**Behavioral invariants:**

- Acknowledging `HOLD` or `STAND_DOWN` persists the user decision and canonical result before any delivery attempt.
- `HOLD` and `STAND_DOWN` create no preview, attempt, wallet-signature request, or transaction submission.
- A qualified breach supersedes advisory work but is never deleted, suppressed, or delayed.
- Repeating the same acknowledgement returns the existing result identity; a conflicting second decision fails closed.
- Expired plans and unsupported decision/action combinations enqueue the canonical skipped/expired outcome supported by the contract.

**Acceptance criteria:**

- [ ] Add tests named `acknowledges hold without on-chain work`, `acknowledges stand-down without suppressing a qualified breach`, `persists result before delivery`, `replays the same acknowledgement idempotently`, `rejects a conflicting second decision`, and `records canonical expiry without execution`.
- [ ] Build result payloads solely from persisted authoritative fields; omit unavailable monetary values rather than estimate them.
- [ ] Keep remote delivery out of the request transaction; Task 8's worker owns delivery.

**Verification:**

```bash
pnpm --filter @clmm/application test -- src/use-cases/plans/RecordPlanDecision.test.ts
pnpm exec eslint packages/application/src/use-cases/plans/RecordPlanDecision.ts packages/application/src/use-cases/plans/RecordPlanDecision.test.ts packages/application/src/index.ts packages/application/src/public/index.ts
git diff --check -- packages/application/src/use-cases/plans/RecordPlanDecision.ts packages/application/src/use-cases/plans/RecordPlanDecision.test.ts packages/application/src/index.ts packages/application/src/public/index.ts
```

Expected: acknowledgement tests pass and no execution dependency is invoked.

## Repository Targets

### Expected Files

- packages/application/src/use-cases/plans/RecordPlanDecision.ts
- packages/application/src/use-cases/plans/RecordPlanDecision.test.ts
- packages/application/src/index.ts
- packages/application/src/public/index.ts

## Validation Commands

```bash
pnpm --filter @clmm/application test -- src/use-cases/plans/RecordPlanDecision.test.ts
pnpm exec eslint packages/application/src/use-cases/plans/RecordPlanDecision.ts packages/application/src/use-cases/plans/RecordPlanDecision.test.ts packages/application/src/index.ts packages/application/src/public/index.ts
git diff --check -- packages/application/src/use-cases/plans/RecordPlanDecision.ts packages/application/src/use-cases/plans/RecordPlanDecision.test.ts packages/application/src/index.ts packages/application/src/public/index.ts
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **advisory acknowledgement has no on-chain effects**: HOLD and STAND_DOWN create no preview, attempt, signature request, or submission. (Test: `acknowledges hold without on-chain work`)
- **stand-down cannot suppress breach**: Acknowledging stand-down leaves an already-qualified breach actionable. (Test: `acknowledges stand-down without suppressing a qualified breach`)
- **decision replay is idempotent**: Repeating one decision returns its existing result identity; a conflicting decision fails. (Test: `replays the same acknowledgement idempotently`)

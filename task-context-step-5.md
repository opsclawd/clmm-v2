# Task Context: Task 5

Title: Request plans from authoritative position state

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

- Create: `packages/application/src/use-cases/plans/RequestPositionPlan.ts`
- Create: `packages/application/src/use-cases/plans/RequestPositionPlan.test.ts`
- Modify: `packages/application/src/index.ts`
- Modify: `packages/application/src/public/index.ts`

**Behavioral invariants:**

- A missing, unsupported, stale, or ownership-mismatched position never produces an upstream request.
- The request contains only pinned fields derived from the existing `SupportedPositionReadPort`, trigger repository, clock, and locally owned plan/execution state.
- A qualified trigger is included when the contract supports it and always outranks the returned advisory plan.
- Regime timeout/unavailability returns an explicit advisory-degraded result and does not mutate trigger, breach, notification, preview, or execution state.
- An exact response replay returns the existing plan; conflicting content remains unexecuted.
- Unknown/malformed responses are persisted only as bounded diagnostics, never as executable plans.

**Acceptance criteria:**

- [ ] Add tests named `builds a position-scoped request from authoritative local state`, `sends no inline candles or client-authored regime state`, `rejects stale position state before calling Regime`, `keeps qualified lower breach authoritative during plan outage`, `keeps qualified upper breach authoritative over hold`, `returns advisory degraded without touching deterministic repositories`, `returns the existing plan for exact replay`, and `fails closed on conflicting replay`.
- [ ] Compute and persist a stable authoritative-position fingerprint from the exact contract-relevant local fields so later approval can detect material changes.
- [ ] Keep request mapping in this use case; do not duplicate RPC reads inside `RegimePlanAdapter`.
- [ ] Return an application DTO suitable for BFF/UI display, including explicit unavailable/stale/superseded/conflict states.

**Verification:**

```bash
pnpm --filter @clmm/application test -- src/use-cases/plans/RequestPositionPlan.test.ts
pnpm exec eslint packages/application/src/use-cases/plans/RequestPositionPlan.ts packages/application/src/use-cases/plans/RequestPositionPlan.test.ts packages/application/src/index.ts packages/application/src/public/index.ts
git diff --check -- packages/application/src/use-cases/plans/RequestPositionPlan.ts packages/application/src/use-cases/plans/RequestPositionPlan.test.ts packages/application/src/index.ts packages/application/src/public/index.ts
```

Expected: focused tests prove position scoping, freshness, replay behavior, and strict isolation from breach monitoring.

## Repository Targets

### Expected Files

- packages/application/src/use-cases/plans/RequestPositionPlan.ts
- packages/application/src/use-cases/plans/RequestPositionPlan.test.ts
- packages/application/src/index.ts
- packages/application/src/public/index.ts

## Validation Commands

```bash
pnpm --filter @clmm/application test -- src/use-cases/plans/RequestPositionPlan.test.ts
pnpm exec eslint packages/application/src/use-cases/plans/RequestPositionPlan.ts packages/application/src/use-cases/plans/RequestPositionPlan.test.ts packages/application/src/index.ts packages/application/src/public/index.ts
git diff --check -- packages/application/src/use-cases/plans/RequestPositionPlan.ts packages/application/src/use-cases/plans/RequestPositionPlan.test.ts packages/application/src/index.ts packages/application/src/public/index.ts
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **stale local state blocks request**: Missing, stale, unsupported, or ownership-mismatched positions do not call Regime. (Test: `rejects stale position state before calling Regime`)
- **plan outage cannot disable breach safety**: Advisory degradation touches no deterministic monitoring or execution repository. (Test: `returns advisory degraded without touching deterministic repositories`)
- **qualified breach has precedence**: A qualified upper or lower breach remains authoritative over an advisory response. (Test: `keeps qualified upper breach authoritative over hold`)

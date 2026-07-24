# Task Context: Task 10

Title: Add Position Detail plan UX and app orchestration

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

- Create: `apps/app/src/api/plans.ts`
- Create: `apps/app/src/api/plans.test.ts`
- Create: `packages/ui/src/view-models/PositionPlanViewModel.ts`
- Create: `packages/ui/src/view-models/PositionPlanViewModel.test.ts`
- Create: `packages/ui/src/components/PositionPlanCard.tsx`
- Create: `packages/ui/src/components/PositionPlanCard.test.tsx`
- Modify: `packages/ui/src/screens/PositionDetailScreen.tsx`
- Modify: `packages/ui/src/screens/PositionDetailScreen.test.tsx`
- Modify: `packages/ui/src/index.ts`
- Modify: `apps/app/app/position/[id].tsx`

**Behavioral invariants:**

- `HOLD` and `STAND_DOWN` render as advisory states with acknowledgement controls and no execution control.
- `REQUEST_EXIT_CLMM` renders a preview action, never an automatic submit action.
- Qualified breach UI remains primary and actionable even when a plan says hold/stand-down or Regime is unavailable.
- Stale, expired, superseded, conflict, malformed, and unavailable plans render explicit non-executable states.
- Background/request errors do not hide position detail or deterministic preview controls.
- Replayed button presses reuse the same plan/preview/result identity and disable duplicate in-flight mutations.

**Acceptance criteria:**

- [ ] Add API parsing that rejects malformed BFF envelopes and accepts only application-public DTOs.
- [ ] Add tests named `renders hold as acknowledgement only`, `renders stand-down without hiding qualified breach exit`, `renders request-exit as preview then explicit approval`, `disables stale expired superseded and conflicting plans`, `keeps position and breach controls during plan outage`, and `deduplicates repeated decision and preview taps`.
- [ ] Keep all server state in TanStack Query; invalidate the current-plan query after mutations and preserve the current position query.
- [ ] Keep presentation formatting in `PositionPlanViewModel`, not the route or API client.

**Verification:**

```bash
pnpm --filter @clmm/app test -- src/api/plans.test.ts
pnpm --filter @clmm/ui test -- src/view-models/PositionPlanViewModel.test.ts src/components/PositionPlanCard.test.tsx src/screens/PositionDetailScreen.test.tsx
pnpm exec eslint apps/app/src/api/plans.ts apps/app/src/api/plans.test.ts packages/ui/src/view-models/PositionPlanViewModel.ts packages/ui/src/view-models/PositionPlanViewModel.test.ts packages/ui/src/components/PositionPlanCard.tsx packages/ui/src/components/PositionPlanCard.test.tsx packages/ui/src/screens/PositionDetailScreen.tsx packages/ui/src/screens/PositionDetailScreen.test.tsx packages/ui/src/index.ts apps/app/app/position/'[id].tsx'
git diff --check -- apps/app/src/api/plans.ts apps/app/src/api/plans.test.ts packages/ui/src/view-models/PositionPlanViewModel.ts packages/ui/src/view-models/PositionPlanViewModel.test.ts packages/ui/src/components/PositionPlanCard.tsx packages/ui/src/components/PositionPlanCard.test.tsx packages/ui/src/screens/PositionDetailScreen.tsx packages/ui/src/screens/PositionDetailScreen.test.tsx packages/ui/src/index.ts apps/app/app/position/'[id].tsx'
```

Expected: focused app/UI tests pass and deterministic exit controls retain visual/action precedence.

## Repository Targets

### Expected Files

- apps/app/src/api/plans.ts
- apps/app/src/api/plans.test.ts
- packages/ui/src/view-models/PositionPlanViewModel.ts
- packages/ui/src/view-models/PositionPlanViewModel.test.ts
- packages/ui/src/components/PositionPlanCard.tsx
- packages/ui/src/components/PositionPlanCard.test.tsx
- packages/ui/src/screens/PositionDetailScreen.tsx
- packages/ui/src/screens/PositionDetailScreen.test.tsx
- packages/ui/src/index.ts
- apps/app/app/position/[id].tsx

## Validation Commands

```bash
pnpm --filter @clmm/app test -- src/api/plans.test.ts
pnpm --filter @clmm/ui test -- src/view-models/PositionPlanViewModel.test.ts src/components/PositionPlanCard.test.tsx src/screens/PositionDetailScreen.test.tsx
pnpm exec eslint apps/app/src/api/plans.ts apps/app/src/api/plans.test.ts packages/ui/src/view-models/PositionPlanViewModel.ts packages/ui/src/view-models/PositionPlanViewModel.test.ts packages/ui/src/components/PositionPlanCard.tsx packages/ui/src/components/PositionPlanCard.test.tsx packages/ui/src/screens/PositionDetailScreen.tsx packages/ui/src/screens/PositionDetailScreen.test.tsx packages/ui/src/index.ts 'apps/app/app/position/[id].tsx'
git diff --check -- apps/app/src/api/plans.ts apps/app/src/api/plans.test.ts packages/ui/src/view-models/PositionPlanViewModel.ts packages/ui/src/view-models/PositionPlanViewModel.test.ts packages/ui/src/components/PositionPlanCard.tsx packages/ui/src/components/PositionPlanCard.test.tsx packages/ui/src/screens/PositionDetailScreen.tsx packages/ui/src/screens/PositionDetailScreen.test.tsx packages/ui/src/index.ts 'apps/app/app/position/[id].tsx'
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **hold and stand-down are advisory only**: HOLD and STAND_DOWN expose acknowledgement but no execution action. (Test: `renders hold as acknowledgement only`)
- **breach controls retain UI precedence**: Qualified breach controls stay visible and actionable during hold, stand-down, or plan outage. (Test: `renders stand-down without hiding qualified breach exit`)
- **plan exit requires preview and approval**: REQUEST_EXIT_CLMM exposes preview followed by explicit approval, never automatic submit. (Test: `renders request-exit as preview then explicit approval`)
- **non-current plans cannot execute**: Stale, expired, superseded, malformed, unavailable, or conflicting states render no execution action. (Test: `disables stale expired superseded and conflicting plans`)

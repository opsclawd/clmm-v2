# Compound Learnings: Issue 92 — PolicyInsights Canonical Contract Alignment

## What Happened

The worktree was created and planning documents were authored, but **zero lines of production code were written**. The implementation stopped at the first step of Task 1 because the required upstream artifact (`@opsclawd/regime-engine-contracts`) does not exist on npm.

## What Worked

1. **Stop conditions were well-specified.** The plan correctly identified that if `@opsclawd/regime-engine-contracts` is unpublished or lacks the required exports, work must stop. This was the right gate.

2. **Architecture was sound.** The decision to place the shared validator in `packages/application`, consume the schema once at module init, and not allow Ajv mutation options was correct. The directional invariant (LowerBoundBreach → ExitToUSDC, UpperBoundBreach → ExitToSOL) was correctly identified as out of scope and not at risk.

3. **Behavioral invariant naming was precise.** Test names like `accepts the canonical Regime Engine PolicyInsight fixture without mutation` and `returns null rather than throwing for a malformed PolicyInsight value` made the contract semantics unambiguous.

4. **The TDD-first approach was appropriate.** Writing failing tests before implementation would have correctly surfaced the missing upstream artifact as a build failure rather than a runtime surprise.

## What Didn't Work

1. **The blocker was known but not enforced before planning.** The issue explicitly states "Blocked by opsclawd/regime-engine#63" yet planning and task-context documents were authored as if the upstream artifact existed. The first action should have been verifying the upstream package, not authoring a 258-line implementation plan.

2. **No pre-flight check of upstream availability.** The plan's Step 1 instruction — "Run `pnpm view @opsclawd/regime-engine-contracts version exports --json`" — was never executed during planning. If it had been, the worktree would have been created but no planning documents authored, saving a full session of wasted effort.

3. **The issue itself should have been closed or parked.** An issue with an unresolved upstream blocker should not proceed to implementation. The correct action was to mark the issue as blocked pending regime-engine#63 and close the worktree.

## What to Do Differently Next Time

1. **Verify upstream artifact existence before any planning work.** When an issue explicitly declares a blocker, treat it as a hard stop. Run `pnpm view <artifact>` or equivalent in the first 30 seconds of the session. If the artifact is missing, close the issue as blocked and stop.

2. **Create no planning documents when a hard blocker exists.** Planning documents create the illusion of progress and consume context window without moving toward resolution. A one-line "blocked upstream — issue #XX must publish @opsclawd/regime-engine-contracts" is the correct output.

3. **Distinguish "blocked upstream" from "blocked by review feedback."** Review feedback is an internal workflow signal and can be acted on. An external upstream dependency that doesn't exist is a different class of problem that requires external resolution before any agent work.

4. **Consider a "pre-flight" skill or automation.** A skill that, given an issue key, checks all declared blockers before any other work would have caught this. Alternatively, the orchestrator could reject worktree creation for issues marked blocked until the block is resolved.

5. **Preserve stop-condition discipline.** The plan's stop conditions were correct and complete. The failure was in not triggering them before beginning. In future: when a plan says "stop if X is true," treat X as checked before writing the first line of implementation code.

## Result

This session produced no code changes and no commits. The worktree remains on `ai/issue-92` with modified planning documents and no production artifacts. The issue remains blocked by `opsclawd/regime-engine#63`.

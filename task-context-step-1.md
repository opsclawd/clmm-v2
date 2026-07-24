# Task Context: Task 1

Title: Vendor and validate the pinned plan contracts

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

- Create: `schemas/regime-engine/position-plan.v1/schema.json`
- Create: `schemas/regime-engine/position-plan.v1/schema.sha256`
- Create: `schemas/regime-engine/position-plan.v1/fixtures/valid/`
- Create: `schemas/regime-engine/position-plan.v1/fixtures/invalid/`
- Create: `schemas/regime-engine/position-plan.v1/provenance.json`
- Create: `schemas/regime-engine/execution-result.v1/schema.json`
- Create: `schemas/regime-engine/execution-result.v1/schema.sha256`
- Create: `schemas/regime-engine/execution-result.v1/fixtures/valid/`
- Create: `schemas/regime-engine/execution-result.v1/fixtures/invalid/`
- Create: `schemas/regime-engine/execution-result.v1/provenance.json`
- Create: `packages/application/src/dto/regimePlan.ts`
- Create: `packages/application/src/dto/regimePlanValidator.ts`
- Create: `packages/application/src/dto/regimePlanContract.test.ts`
- Create: `packages/application/src/dto/regimePlanValidator.test.ts`
- Modify: `packages/application/src/dto/index.ts`
- Modify: `packages/application/src/public/index.ts`
- Create: `packages/application/src/public/regimePlan.exports.test.ts`

**Acceptance criteria:**

- [ ] Copy the exact pinned artifacts into the two vendored directories, preserving valid/invalid fixtures, and record source repository, commit, source path, and SHA-256 for every asset in each `provenance.json`.
- [ ] Define application-owned `RegimePlanRequest`, `RegimePlanResponse`, `RegimePlanAction`, `RegimePlanExitIntent`, and `RegimeExecutionResult` types whose fields and literals exactly match the pinned schemas.
- [ ] Implement `parseRegimePlanResponse` and `parseRegimeExecutionResult` as fail-closed validators. Unknown versions/actions/statuses, extra forbidden fields, malformed timestamps, invalid expiry ordering, and invalid hashes return a validation failure rather than a partial object.
- [ ] Add fixture parity tests named `accepts every canonical position-plan valid fixture`, `rejects every canonical position-plan invalid fixture`, `accepts every canonical execution-result valid fixture`, and `rejects every canonical execution-result invalid fixture`.
- [ ] Add focused validator tests named `rejects unsupported plan actions and schema versions`, `rejects a request-exit plan without canonical exit intent`, and `does not admit inline candles regime state or portfolio allocations`.
- [ ] Export only validated contract types/parsers through the application public boundary.

**Verification:**

```bash
pnpm --filter @clmm/application test -- src/dto/regimePlanContract.test.ts src/dto/regimePlanValidator.test.ts src/public/regimePlan.exports.test.ts
pnpm exec eslint packages/application/src/dto/regimePlan.ts packages/application/src/dto/regimePlanValidator.ts packages/application/src/dto/regimePlanContract.test.ts packages/application/src/dto/regimePlanValidator.test.ts packages/application/src/dto/index.ts packages/application/src/public/index.ts packages/application/src/public/regimePlan.exports.test.ts
git diff --check -- schemas/regime-engine/position-plan.v1 schemas/regime-engine/execution-result.v1 packages/application/src/dto/regimePlan.ts packages/application/src/dto/regimePlanValidator.ts packages/application/src/dto/regimePlanContract.test.ts packages/application/src/dto/regimePlanValidator.test.ts packages/application/src/dto/index.ts packages/application/src/public/index.ts packages/application/src/public/regimePlan.exports.test.ts
```

Expected: fixture parity and export tests pass; invalid or unsupported contract values never produce executable DTOs.

## Repository Targets

### Expected Files

- schemas/regime-engine/position-plan.v1/schema.json
- schemas/regime-engine/position-plan.v1/schema.sha256
- schemas/regime-engine/position-plan.v1/fixtures/valid/
- schemas/regime-engine/position-plan.v1/fixtures/invalid/
- schemas/regime-engine/position-plan.v1/provenance.json
- schemas/regime-engine/execution-result.v1/schema.json
- schemas/regime-engine/execution-result.v1/schema.sha256
- schemas/regime-engine/execution-result.v1/fixtures/valid/
- schemas/regime-engine/execution-result.v1/fixtures/invalid/
- schemas/regime-engine/execution-result.v1/provenance.json
- packages/application/src/dto/regimePlan.ts
- packages/application/src/dto/regimePlanValidator.ts
- packages/application/src/dto/regimePlanContract.test.ts
- packages/application/src/dto/regimePlanValidator.test.ts
- packages/application/src/dto/index.ts
- packages/application/src/public/index.ts
- packages/application/src/public/regimePlan.exports.test.ts

## Validation Commands

```bash
pnpm --filter @clmm/application test -- src/dto/regimePlanContract.test.ts src/dto/regimePlanValidator.test.ts src/public/regimePlan.exports.test.ts
pnpm exec eslint packages/application/src/dto/regimePlan.ts packages/application/src/dto/regimePlanValidator.ts packages/application/src/dto/regimePlanContract.test.ts packages/application/src/dto/regimePlanValidator.test.ts packages/application/src/dto/index.ts packages/application/src/public/index.ts packages/application/src/public/regimePlan.exports.test.ts
git diff --check -- schemas/regime-engine/position-plan.v1 schemas/regime-engine/execution-result.v1 packages/application/src/dto/regimePlan.ts packages/application/src/dto/regimePlanValidator.ts packages/application/src/dto/regimePlanContract.test.ts packages/application/src/dto/regimePlanValidator.test.ts packages/application/src/dto/index.ts packages/application/src/public/index.ts packages/application/src/public/regimePlan.exports.test.ts
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **unsupported contract values fail closed**: Unknown versions, actions, statuses, or malformed plan-exit intent never produce executable DTOs. (Test: `rejects unsupported plan actions and schema versions`)
- **obsolete payload fields remain forbidden**: Inline candles, client-authored regime state, and portfolio allocations are rejected. (Test: `does not admit inline candles regime state or portfolio allocations`)

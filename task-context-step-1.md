# Task Context: Task 1

Title: Pin the canonical request, response, and result contracts

## Workspace & Scope Constraints

## WORKSPACE CONSTRAINTS

Your working directory is a dedicated git worktree with the repository's complete history. Run all commands from it. Do NOT cd to or read paths outside this directory — external-directory access is automatically rejected. git log, git diff, etc. work here directly.

.ai-orchestrator.local.json, if one exists, lives only in the main checkout and is intentionally not copied into your worktree — it is operator-machine-specific and not part of your task. Do not search for it or read it outside this directory. Reason about configuration using only .ai-orchestrator.json in your own working directory; treat it as the effective config for your task.

Working Directory: /home/gary/.openclaw/workspace/clmm-superpowers-v2/.ai-worktrees/issue-113
Repository: opsclawd/clmm-v2
Branch: ai/issue-113
Start Commit: 5f7441cba33fa9c7f53c4281f12a73ed4e205f0f

## Task Requirements

**Files:**

- Create: `schemas/regime-engine/plan-request.v1/schema.json`
- Create: `schemas/regime-engine/plan-request.v1/schema.sha256`
- Create: `schemas/regime-engine/plan-request.v1/provenance.json`
- Create: `schemas/regime-engine/plan-request.v1/fixtures/valid/in-range.json`
- Create: `schemas/regime-engine/plan-request.v1/fixtures/valid/breach-qualified.json`
- Create: `schemas/regime-engine/plan-request.v1/fixtures/invalid/missing-portfolio.json`
- Create: `schemas/regime-engine/plan-request.v1/fixtures/invalid/missing-autopilot-state.json`
- Create: `schemas/regime-engine/plan-request.v1/fixtures/invalid/missing-config.json`
- Refresh from the same pinned commit: `schemas/regime-engine/position-plan.v1/**`
- Refresh from the same pinned commit: `schemas/regime-engine/execution-result.v1/**`
- Modify: `packages/application/src/dto/regimePlanContract.test.ts`

- [ ] Add failing contract tests named `accepts every canonical plan-request valid fixture`, `rejects every canonical plan-request invalid fixture`, and `pins all regime plan contracts to one upstream commit`.
- [ ] In the companion upstream PR, first publish `contracts/plan-request/v1/` with the schema and fixtures and protect `/v1/plan`. Pin the merged commit, then vendor request, response, and result artifacts using the established provenance layout. Record the repository, exact commit, source path, local path, and sha256 for every asset.
- [ ] Make the contract test compile all three schemas with strict AJV 2020 and deep-clone every fixture before validation. Assert schema-version constants directly from the schemas so the `"1.0"` versus `execution-result.v1` conflict is resolved by evidence.
- [ ] Confirm request fixtures require `portfolio`, `autopilotState`, and `config`, and that market values admit `source: "geckoterminal"`, `network: "solana"`, and the selected one-hour timeframe. Do not edit a vendored schema to fit local code.
- [ ] If upstream fixture names differ, preserve upstream bytes but map them to the explicit local filenames above in `provenance.json`; the provenance hashes must cover the renamed local copies.
- [ ] Commit as `chore(contracts): vendor regime plan request contract`.

**Acceptance and scoped verification:**

```bash
pnpm --filter @clmm/application exec vitest run src/dto/regimePlanContract.test.ts
pnpm --filter @clmm/application exec eslint src/dto/regimePlanContract.test.ts --ext .ts
git diff --check -- schemas/regime-engine/plan-request.v1 schemas/regime-engine/position-plan.v1 schemas/regime-engine/execution-result.v1 packages/application/src/dto/regimePlanContract.test.ts
```

Expected: canonical valid fixtures pass, canonical invalid fixtures fail, all three provenance files identify one upstream commit, and no npm contracts dependency is introduced.

## Repository Targets

### Expected Files

- schemas/regime-engine/plan-request.v1/schema.json
- schemas/regime-engine/plan-request.v1/schema.sha256
- schemas/regime-engine/plan-request.v1/provenance.json
- schemas/regime-engine/plan-request.v1/fixtures/valid/in-range.json
- schemas/regime-engine/plan-request.v1/fixtures/valid/breach-qualified.json
- schemas/regime-engine/plan-request.v1/fixtures/invalid/missing-portfolio.json
- schemas/regime-engine/plan-request.v1/fixtures/invalid/missing-autopilot-state.json
- schemas/regime-engine/plan-request.v1/fixtures/invalid/missing-config.json
- schemas/regime-engine/position-plan.v1/schema.json
- schemas/regime-engine/position-plan.v1/schema.sha256
- schemas/regime-engine/position-plan.v1/provenance.json
- schemas/regime-engine/position-plan.v1/fixtures/valid/hold.json
- schemas/regime-engine/position-plan.v1/fixtures/valid/request-exit.json
- schemas/regime-engine/position-plan.v1/fixtures/invalid/unsupported-action.json
- schemas/regime-engine/position-plan.v1/fixtures/invalid/missing-exit-intent.json
- schemas/regime-engine/position-plan.v1/fixtures/invalid/inline-candles-and-portfolio.json
- schemas/regime-engine/execution-result.v1/schema.json
- schemas/regime-engine/execution-result.v1/schema.sha256
- schemas/regime-engine/execution-result.v1/provenance.json
- schemas/regime-engine/execution-result.v1/fixtures/valid/success.json
- schemas/regime-engine/execution-result.v1/fixtures/valid/skipped.json
- schemas/regime-engine/execution-result.v1/fixtures/invalid/unsupported-status.json
- schemas/regime-engine/execution-result.v1/fixtures/invalid/extra-forbidden-fields.json
- packages/application/src/dto/regimePlanContract.test.ts

## Validation Commands

```bash
pnpm --filter @clmm/application exec vitest run src/dto/regimePlanContract.test.ts
pnpm --filter @clmm/application exec eslint src/dto/regimePlanContract.test.ts --ext .ts
git diff --check -- schemas/regime-engine/plan-request.v1 schemas/regime-engine/position-plan.v1 schemas/regime-engine/execution-result.v1 packages/application/src/dto/regimePlanContract.test.ts
```

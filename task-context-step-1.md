# Task Context: Task 1

Title: Re-vendor canonical position-plan contract, narrow application DTO, and update mapper

## Workspace & Scope Constraints

## WORKSPACE CONSTRAINTS

Your working directory is a dedicated git worktree with the repository's complete history. Run all commands from it. Do NOT cd to or read paths outside this directory — external-directory access is automatically rejected. git log, git diff, etc. work here directly.

.ai-orchestrator.local.json, if one exists, lives only in the main checkout and is intentionally not copied into your worktree — it is operator-machine-specific and not part of your task. Do not search for it or read it outside this directory. Reason about configuration using only .ai-orchestrator.json in your own working directory; treat it as the effective config for your task.

Working Directory: /home/gary/.openclaw/workspace/clmm-superpowers-v2/.ai-worktrees/issue-121
Repository: opsclawd/clmm-v2
Branch: ai/issue-121
Start Commit: a0f9c5914ec400d07e160ce5532cb92ed2fe1441

## Task Requirements

**Files:**

- Modify: `schemas/regime-engine/position-plan.v1/schema.json` (`$defs.PlanAction` and removal of `$defs.PlanExitIntent`)
- Modify: `schemas/regime-engine/position-plan.v1/schema.sha256`
- Modify: `schemas/regime-engine/position-plan.v1/provenance.json` (commit and hashes for the corrected bundle)
- Modify: `schemas/regime-engine/position-plan.v1/fixtures/valid/request-exit.json` (`actions[0]` only)
- Delete: `schemas/regime-engine/position-plan.v1/fixtures/invalid/missing-exit-intent.json`
- Modify: `packages/application/src/dto/regimePlan.ts` (remove `RegimePlanExitPosture`, `RegimePlanExitIntent`, narrow `RegimePlanAction`)
- Modify: `packages/application/src/dto/index.ts` (remove deleted type re-exports)
- Modify: `packages/application/src/public/index.ts` (remove deleted type re-exports)
- Modify: `packages/application/src/use-cases/plans/RequestPositionPlan.ts` (remove `mapRegimeExitPostureToDomain` and map `REQUEST_EXIT_CLMM` directly)
- Modify: `packages/adapters/src/inbound/http/PlanController.test.ts` (remove fabricated `exitIntent` from mock response)
- Modify: `packages/application/src/dto/regimePlanContract.test.ts` (position-plan imports and position-plan fixture assertions only)
- Modify: `packages/application/src/dto/regimePlanValidator.test.ts` (replace the request-exit intent case only)
- Modify: `packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts` (`requestPositionPlan` describe block only)
- Read: `schemas/regime-engine/plan-request.v1/schema.json`
- Read: `schemas/regime-engine/plan-request.v1/provenance.json`
- Read: `schemas/regime-engine/execution-result.v1/schema.json`
- Read: `schemas/regime-engine/execution-result.v1/provenance.json`
- Read: `packages/application/src/dto/regimePlanValidator.ts`
- Read: `packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts`
- Read: `packages/adapters/src/inbound/http/PlanController.ts`
- Read: `packages/testing/src/fakes/FakeRegimePlanPort.ts`

**Exported signature changes:**

- Remove exported `RegimePlanExitPosture`.
- Remove exported `RegimePlanExitIntent`.
- Breakingly narrow exported `RegimePlanAction` to `{ type: RegimePlanActionType; reasonCode: string }`.
- Consequently narrow `RegimePlanResponse.actions` through its `RegimePlanAction[]` member.

**Invariants to test first:**

- `accepts a request-exit plan without remote exit intent`
- `rejects fabricated remote exit intent on request-exit actions`
- `returns ok for a canonical request-exit response without exitIntent`
- `verifies that all vendored asset sha256 checksums match provenance.json`

- [ ] **Step 1: Verify the upstream source before changing local artifacts.**

  Inspect the corrected, merged upstream commit, not an unmerged branch or the live response alone. At that one commit, compare:
  - `src/contract/v1/types.ts` `PlanAction`, `PlanRequest`, and `ExecutionResult` declarations;
  - `contracts/position-plan/v1/`, `contracts/plan-request/v1/`, and `contracts/execution-result/v1/` schemas and fixtures.

  Continue only when `contracts/position-plan/v1/` itself has no `exitIntent` or `PlanExitIntent` and its `REQUEST_EXIT_CLMM` fixture omits the field. Record that exact commit in all three provenance files only if all three contract directories were sourced from it; otherwise update only position-plan provenance and remove the cross-contract same-commit assertion in favor of explicit per-contract pins. If the contract directory still disagrees with `src/contract/v1/types.ts`, stop and fix/publish the upstream contract first—do not hand-edit a file while claiming it was copied unchanged.

  Audit result expected from the design and current local evidence: plan-request and execution-result contain no fabricated directional member and require no local edits.

- [ ] **Step 2: Re-vendor the corrected position-plan bundle.**

  Copy the corrected upstream assets from the verified commit into the existing local layout. The resulting `PlanAction` definition must be:

  ```json
  "PlanAction": {
    "type": "object",
    "required": ["type", "reasonCode"],
    "additionalProperties": false,
    "properties": {
      "type": {
        "type": "string",
        "enum": ["HOLD", "STAND_DOWN", "REQUEST_EXIT_CLMM"]
      },
      "reasonCode": {
        "type": "string",
        "minLength": 1
      }
    }
  }
  ```

  There must be no `allOf`/`if`/`then` condition under `PlanAction` and no `PlanExitIntent` definition. Delete `fixtures/invalid/missing-exit-intent.json`.

  Regenerate `schema.sha256` from the exact bytes of `schema.json`. Update `provenance.json` with the verified upstream commit, copy time, retained upstream source paths, and freshly computed hashes for every position-plan asset. Remove the deleted fixture's provenance entry. Do not alter the hashes of unchanged assets unless their bytes were actually re-vendored from the corrected commit.

- [ ] **Step 3: Narrow application DTO and update re-exports.**

  In `packages/application/src/dto/regimePlan.ts`, delete `RegimePlanExitPosture` and `RegimePlanExitIntent`, and define:

  ```ts
  export type RegimePlanAction = {
    type: RegimePlanActionType;
    reasonCode: string;
  };
  ```

  Remove `RegimePlanExitPosture` and `RegimePlanExitIntent` from the re-export blocks in `packages/application/src/dto/index.ts` and `packages/application/src/public/index.ts`.

- [ ] **Step 4: Update application mapper and test mocks.**

  In `packages/application/src/use-cases/plans/RequestPositionPlan.ts`, remove the `RegimePlanExitPosture` import and delete `mapRegimeExitPostureToDomain`. Update `extractAdvisoryAction`:

  ```ts
  if (requestedAction.type === 'REQUEST_EXIT_CLMM') {
    return { kind: 'REQUEST_EXIT_CLMM' };
  }
  ```

  In `packages/adapters/src/inbound/http/PlanController.test.ts`, update `createAdvisoryReadyPlanResponse()` to remove `exitIntent: { posture: 'ExitToUSDC' }` so mock payload creation matches the narrowed `RegimePlanAction` DTO.

- [ ] **Step 5: Write schema validator and adapter parser tests.**

  Change `request-exit.json` fixture so its action is:

  ```json
  {
    "type": "REQUEST_EXIT_CLMM",
    "reasonCode": "OUT_OF_RANGE_DOWNTREND"
  }
  ```

  In `regimePlanValidator.test.ts`, replace `rejects a request-exit plan without canonical exit intent` with:

  ```ts
  it('accepts a request-exit plan without remote exit intent', () => {
    const parsed = parseRegimePlanResponse(requestExitFixture);
    expect(parsed).not.toBeNull();
    expect(parsed?.actions[0]).toEqual({
      type: 'REQUEST_EXIT_CLMM',
      reasonCode: 'OUT_OF_RANGE_DOWNTREND',
    });
  });

  it('rejects fabricated remote exit intent on request-exit actions', () => {
    const withExitIntent = deepClone(requestExitFixture) as MutableFixture;
    const actions = withExitIntent['actions'] as Array<Record<string, unknown>>;
    actions[0]!['exitIntent'] = { posture: 'ExitToUSDC' };
    expect(parseRegimePlanResponse(withExitIntent)).toBeNull();
  });
  ```

  In `regimePlanContract.test.ts`, remove `missing-exit-intent.json` from `rejects every canonical position-plan invalid fixture`.

  In `RegimePlanAdapter.test.ts`, add inside `describe('requestPositionPlan')`:

  ```ts
  it('returns ok for a canonical request-exit response without exitIntent', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(requestExitFixture), { status: 200 }),
    );

    const adapter = new RegimePlanAdapter('https://regime.example.com', 'test-token', obs.port);
    const result = await adapter.requestPositionPlan(VALID_PLAN_REQUEST);

    expect(result).toEqual({ kind: 'ok', response: requestExitFixture });
  });
  ```

- [ ] **Step 6: Run Task 1 verification checks.**

  Run:

  ```bash
  pnpm --filter @clmm/application exec vitest run src/dto/regimePlanContract.test.ts src/dto/regimePlanValidator.test.ts
  pnpm --filter @clmm/adapters exec vitest run src/outbound/regime-engine/RegimePlanAdapter.test.ts src/inbound/http/PlanController.test.ts
  pnpm --filter @clmm/application exec eslint src/dto/regimePlan.ts src/dto/index.ts src/public/index.ts src/use-cases/plans/RequestPositionPlan.ts src/dto/regimePlanContract.test.ts src/dto/regimePlanValidator.test.ts --ext .ts
  pnpm --filter @clmm/adapters exec eslint src/outbound/regime-engine/RegimePlanAdapter.test.ts src/inbound/http/PlanController.test.ts --ext .ts
  pnpm -r typecheck
  git diff --check -- schemas/regime-engine/position-plan.v1 packages/application/src/dto packages/application/src/public packages/application/src/use-cases/plans/RequestPositionPlan.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts packages/adapters/src/inbound/http/PlanController.test.ts
  ```

  Expected: schema validation, adapter success path, controller mock response, application typechecks, and workspace typechecks pass completely cleanly.

- [ ] **Step 7: Commit Task 1.**

  ```bash
  git add schemas/regime-engine/position-plan.v1 packages/application/src/dto packages/application/src/public/index.ts packages/application/src/use-cases/plans/RequestPositionPlan.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts packages/adapters/src/inbound/http/PlanController.test.ts
  git commit -m "fix(contracts): accept canonical request exit plans and narrow application DTO"
  ```

  Confirm `design.md` and `issue.md` are not staged.

## Repository Targets

### Expected Files

- schemas/regime-engine/position-plan.v1/schema.json
- schemas/regime-engine/position-plan.v1/schema.sha256
- schemas/regime-engine/position-plan.v1/provenance.json
- schemas/regime-engine/position-plan.v1/fixtures/valid/request-exit.json
- schemas/regime-engine/position-plan.v1/fixtures/invalid/missing-exit-intent.json
- packages/application/src/dto/regimePlan.ts
- packages/application/src/dto/index.ts
- packages/application/src/public/index.ts
- packages/application/src/use-cases/plans/RequestPositionPlan.ts
- packages/adapters/src/inbound/http/PlanController.test.ts
- packages/application/src/dto/regimePlanContract.test.ts
- packages/application/src/dto/regimePlanValidator.test.ts
- packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts

### Reference Files

- design.md
- issue.md
- schemas/regime-engine/plan-request.v1/schema.json
- schemas/regime-engine/plan-request.v1/provenance.json
- schemas/regime-engine/execution-result.v1/schema.json
- schemas/regime-engine/execution-result.v1/provenance.json
- packages/application/src/dto/regimePlanValidator.ts
- packages/application/src/ports/index.ts
- packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts
- packages/adapters/src/inbound/http/PlanController.ts
- packages/testing/src/fakes/FakeRegimePlanPort.ts

## Validation Commands

```bash
pnpm --filter @clmm/application exec vitest run src/dto/regimePlanContract.test.ts src/dto/regimePlanValidator.test.ts
pnpm --filter @clmm/adapters exec vitest run src/outbound/regime-engine/RegimePlanAdapter.test.ts src/inbound/http/PlanController.test.ts
pnpm --filter @clmm/application exec eslint src/dto/regimePlan.ts src/dto/index.ts src/public/index.ts src/use-cases/plans/RequestPositionPlan.ts src/dto/regimePlanContract.test.ts src/dto/regimePlanValidator.test.ts --ext .ts
pnpm --filter @clmm/adapters exec eslint src/outbound/regime-engine/RegimePlanAdapter.test.ts src/inbound/http/PlanController.test.ts --ext .ts
pnpm -r typecheck
git diff --check -- schemas/regime-engine/position-plan.v1 packages/application/src/dto packages/application/src/public/index.ts packages/application/src/use-cases/plans/RequestPositionPlan.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts packages/adapters/src/inbound/http/PlanController.test.ts
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **canonical-request-exit-acceptance**: A contract-valid REQUEST_EXIT_CLMM action containing only type and reasonCode validates successfully. (Test: `accepts a request-exit plan without remote exit intent`)
- **removed-intent-remains-forbidden**: A REQUEST_EXIT_CLMM action carrying the removed exitIntent property is rejected by additionalProperties false. (Test: `rejects fabricated remote exit intent on request-exit actions`)
- **adapter-real-shape-success**: The HTTP adapter returns kind ok for the canonical request-exit fixture without exitIntent instead of permanent schema-invalid. (Test: `returns ok for a canonical request-exit response without exitIntent`)
- **vendored-bundle-integrity**: Every retained vendored asset matches its provenance SHA-256 and the deleted obsolete fixture has no provenance entry. (Test: `verifies that all vendored asset sha256 checksums match provenance.json`)

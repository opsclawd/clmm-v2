# Task Context: Task 2

Title: Verify directionless advisory persistence and domain exit policy invariants in use-case tests

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

- Modify: `packages/application/src/use-cases/plans/RequestPositionPlan.test.ts`
- Read: `packages/domain/src/exit-policy/DirectionalExitPolicyService.ts`
- Read: `packages/domain/src/regime/PositionPlan.ts`

**Invariants to test first:**

- `persists request-exit advisory without remote directional intent`
- `maps hold and stand-down actions without changing their kinds`
- `does not derive exit posture outside DirectionalExitPolicyService`

- [ ] **Step 1: Update FakePlanRepository.acceptResponse to preserve supplied advisoryAction.**

  In `packages/application/src/use-cases/plans/RequestPositionPlan.test.ts`, update `FakePlanRepository.acceptResponse` parameter signature to accept `advisoryAction: PlanAction`, and set `advisoryAction: params.advisoryAction` instead of hardcoding `{ kind: 'HOLD' }`:

  ```ts
  async acceptResponse(params: {
    planId: PlanId;
    regimeResponse: { kind: string; regime: string; suitability: string };
    advisoryAction: PlanAction;
    respondedAt: ClockTimestamp;
    asOfAt: ClockTimestamp;
    expiresAt: ClockTimestamp;
  }): Promise<{ kind: 'accepted' } | { kind: 'conflict-detected' }> {
    const plan = Array.from(this._plans.values()).find((p) => p.planId === params.planId);
    if (!plan) return { kind: 'conflict-detected' };
    plan.respondedAt = params.respondedAt;
    plan.asOfAt = params.asOfAt;
    plan.expiresAt = params.expiresAt;
    plan.lifecycleStateJson = {
      kind: 'advisory-ready',
      advisoryAction: params.advisoryAction,
      regimeResponse: {
        kind: 'regime-response',
        regime: params.regimeResponse.regime as 'UP' | 'DOWN' | 'CHOP',
        suitability: params.regimeResponse.suitability as
          | 'ALLOWED'
          | 'CAUTION'
          | 'BLOCKED'
          | 'UNKNOWN',
      },
    };
    return { kind: 'accepted' };
  }
  ```

- [ ] **Step 2: Implement test case for directionless request-exit advisory persistence.**

  Add this test inside `describe('RequestPositionPlan')`:

  ```ts
  it('persists request-exit advisory without remote directional intent', async () => {
    const position = makeInRangePosition(FIXTURE_POSITION_ID, FIXTURE_WALLET_ID);
    positionRead.setPosition(position);
    positionRead.setDetail(makeFixtureDetail(position));
    regimePort.setResponse({
      kind: 'ok',
      response: {
        ...VALID_UPSTREAM_RESPONSE,
        actions: [
          {
            type: 'REQUEST_EXIT_CLMM',
            reasonCode: 'POSITION_RANGE_BREACH_QUALIFIED',
          },
        ],
      },
    });

    await requestPositionPlan({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      positionReadPort: positionRead,
      triggerRepository: triggerRepo,
      planRepository: planRepo,
      regimePlanPort: regimePort,
      executionHistoryRepository: historyRepo,
      config: CONFIGURED_CONFIG,
      clock,
      observability,
    });

    expect(
      planRepo.getStoredPlan(VALID_UPSTREAM_RESPONSE.planId as PlanId)?.lifecycleStateJson,
    ).toMatchObject({
      kind: 'advisory-ready',
      advisoryAction: { kind: 'REQUEST_EXIT_CLMM' },
    });
  });
  ```

- [ ] **Step 3: Implement test case for unchanged HOLD and STAND_DOWN mapping.**

  Add this test inside `describe('RequestPositionPlan')`:

  ```ts
  it('maps hold and stand-down actions without changing their kinds', async () => {
    const position = makeInRangePosition(FIXTURE_POSITION_ID, FIXTURE_WALLET_ID);
    positionRead.setPosition(position);
    positionRead.setDetail(makeFixtureDetail(position));

    // Test HOLD action
    regimePort.setResponse({
      kind: 'ok',
      response: {
        ...VALID_UPSTREAM_RESPONSE,
        actions: [{ type: 'HOLD', reasonCode: 'HOLD_POLICY' }],
      },
    });
    await requestPositionPlan({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      positionReadPort: positionRead,
      triggerRepository: triggerRepo,
      planRepository: planRepo,
      regimePlanPort: regimePort,
      executionHistoryRepository: historyRepo,
      config: CONFIGURED_CONFIG,
      clock,
      observability,
    });
    expect(
      planRepo.getStoredPlan(VALID_UPSTREAM_RESPONSE.planId as PlanId)?.lifecycleStateJson,
    ).toMatchObject({
      kind: 'advisory-ready',
      advisoryAction: { kind: 'HOLD' },
    });

    // Test STAND_DOWN action with fresh plan ID
    const standDownPlanId = 'plan_stand_down_1234' as PlanId;
    regimePort.setResponse({
      kind: 'ok',
      response: {
        ...VALID_UPSTREAM_RESPONSE,
        planId: standDownPlanId,
        actions: [{ type: 'STAND_DOWN', reasonCode: 'STAND_DOWN_POLICY' }],
      },
    });
    await requestPositionPlan({
      walletId: FIXTURE_WALLET_ID,
      positionId: makePositionId('test-position-2'),
      positionReadPort: positionRead,
      triggerRepository: triggerRepo,
      planRepository: planRepo,
      regimePlanPort: regimePort,
      executionHistoryRepository: historyRepo,
      config: CONFIGURED_CONFIG,
      clock,
      observability,
    });
    expect(planRepo.getStoredPlan(standDownPlanId)?.lifecycleStateJson).toMatchObject({
      kind: 'advisory-ready',
      advisoryAction: { kind: 'STAND_DOWN' },
    });
  });
  ```

- [ ] **Step 4: Implement test case proving directional exit posture is not derived outside DirectionalExitPolicyService.**

  Add this test inside `describe('RequestPositionPlan')`:

  ```ts
  it('does not derive exit posture outside DirectionalExitPolicyService', async () => {
    const position = makeInRangePosition(FIXTURE_POSITION_ID, FIXTURE_WALLET_ID);
    positionRead.setPosition(position);
    positionRead.setDetail(makeFixtureDetail(position));

    regimePort.setResponse({
      kind: 'ok',
      response: {
        ...VALID_UPSTREAM_RESPONSE,
        regime: 'DOWN',
        targets: { solBps: 0, usdcBps: 10000, allowClmm: true },
        actions: [
          {
            type: 'REQUEST_EXIT_CLMM',
            reasonCode: 'OUT_OF_RANGE_DOWNTREND',
          },
        ],
      },
    });

    await requestPositionPlan({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      positionReadPort: positionRead,
      triggerRepository: triggerRepo,
      planRepository: planRepo,
      regimePlanPort: regimePort,
      executionHistoryRepository: historyRepo,
      config: CONFIGURED_CONFIG,
      clock,
      observability,
    });

    const storedState = planRepo.getStoredPlan(
      VALID_UPSTREAM_RESPONSE.planId as PlanId,
    )?.lifecycleStateJson;
    expect(storedState).toBeDefined();
    if (storedState?.kind === 'advisory-ready') {
      expect(storedState.advisoryAction).toEqual({ kind: 'REQUEST_EXIT_CLMM' });
      expect(storedState.advisoryAction).not.toHaveProperty('exitIntent');
    }
  });
  ```

- [ ] **Step 5: Run Task 2 verification checks.**

  Run:

  ```bash
  pnpm --filter @clmm/application exec vitest run src/use-cases/plans/RequestPositionPlan.test.ts
  pnpm --filter @clmm/application exec eslint src/use-cases/plans/RequestPositionPlan.test.ts --ext .ts
  pnpm -r typecheck
  git diff --check -- packages/application/src/use-cases/plans/RequestPositionPlan.test.ts
  ```

  Expected: all use-case tests pass; lint is clean; workspace typecheck succeeds.

- [ ] **Step 6: Commit Task 2.**

  ```bash
  git add packages/application/src/use-cases/plans/RequestPositionPlan.test.ts
  git commit -m "test(plans): verify directionless advisory persistence and domain mapping invariants"
  ```

  Confirm `design.md` and `issue.md` are not staged.

## Tests to add or update

- Update `packages/application/src/dto/regimePlanValidator.test.ts` to accept missing remote `exitIntent` and reject the removed field when present.
- Update `packages/application/src/dto/regimePlanContract.test.ts` to stop treating `missing-exit-intent.json` as canonical invalid input and to retain bundle-hash verification.
- Update `packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts` with the live-response-shaped `REQUEST_EXIT_CLMM` success case.
- Update `packages/adapters/src/inbound/http/PlanController.test.ts` mock response to omit fabricated `exitIntent`.
- Update `packages/application/src/use-cases/plans/RequestPositionPlan.test.ts` so `FakePlanRepository.acceptResponse` preserves `advisoryAction`, and add tests for directionless advisory persistence, HOLD/STAND_DOWN preservation, and absence of exit posture derivation.
- Retain existing tests for legacy `expiresAtUnixMs`, unsupported actions, extra fields, `HOLD`, `STAND_DOWN`, qualified-trigger precedence, and lease completion.

## Validation commands

These are acceptance commands attached to the implementation tasks above; the orchestrator's validate phase may additionally run the repository-wide suite after all tasks complete.

```bash
pnpm --filter @clmm/application exec vitest run src/dto/regimePlanContract.test.ts src/dto/regimePlanValidator.test.ts src/use-cases/plans/RequestPositionPlan.test.ts
pnpm --filter @clmm/adapters exec vitest run src/outbound/regime-engine/RegimePlanAdapter.test.ts src/inbound/http/PlanController.test.ts
pnpm --filter @clmm/application exec eslint src/dto/regimePlan.ts src/dto/index.ts src/public/index.ts src/dto/regimePlanContract.test.ts src/dto/regimePlanValidator.test.ts src/use-cases/plans/RequestPositionPlan.ts src/use-cases/plans/RequestPositionPlan.test.ts --ext .ts
pnpm --filter @clmm/adapters exec eslint src/outbound/regime-engine/RegimePlanAdapter.test.ts src/inbound/http/PlanController.test.ts --ext .ts
pnpm -r typecheck
git diff --check -- schemas/regime-engine/position-plan.v1 packages/application/src/dto packages/application/src/public/index.ts packages/application/src/use-cases/plans/RequestPositionPlan.ts packages/application/src/use-cases/plans/RequestPositionPlan.test.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts packages/adapters/src/inbound/http/PlanController.test.ts
```

Expected: all focused tests, lint checks, workspace typechecks, provenance checksum assertions, and diff checks pass. After deployment, repeat the existing private breach-qualified diagnostic and require `RegimePlanAdapter` to report `{ "kind": "ok" }` for a response action containing only `type` and `reasonCode`; operational credentials and service mutation are outside this repository implementation plan.

## Risk areas

- **False provenance:** Editing `schema.json` or fixtures without a corrected upstream contract commit would make `provenance.json` untruthful. This is the highest process risk and is an explicit stop condition.
- **Breaking exported API:** Removing two exported types and narrowing `RegimePlanAction` can break downstream consumers. Both barrels, the only interpreter, and mock payload fixtures (`PlanController.test.ts`) must change in Task 1, followed by workspace-wide typecheck.
- **Stateful lifecycle mapping:** `RequestPositionPlan` writes the mapped action into requested/advisory-ready lifecycle state. A hard-coded test fake could conceal a regression, so `FakePlanRepository.acceptResponse` must preserve the actual `advisoryAction`.
- **Directional invariant leakage:** It would be tempting to infer posture from `targets`, `regime`, reason text, or token ordering. Any such inference outside `DirectionalExitPolicyService` is release-blocking.
- **Over-relaxing validation:** Removing the requirement must not make arbitrary `exitIntent` objects legal. Keeping `PlanAction.additionalProperties: false` makes the canonical contract strict.
- **Stale sibling contracts:** The read-only audit may reveal drift in plan-request or execution-result. Bundling an unplanned fix into this issue would obscure provenance and test scope.
- **Production verification limits:** Unit and adapter tests reproduce the payload shape but do not prove a deployed private service was updated; the live check must occur only in the authorized operational environment.

## Stop conditions

- Stop if no corrected, merged upstream `contracts/position-plan/v1/` commit exists. Fix and publish the owning `regime-engine` contract first; do not create locally derived artifacts under copied-contract provenance.
- Stop if the corrected contract still defines `exitIntent`, `PlanExitIntent`, or a conditional requirement that disagrees with `src/contract/v1/types.ts`.
- Stop if the plan-request or execution-result audit finds a substantive mismatch. Record the evidence and create a separately scoped contract task instead of silently expanding this plan.
- Stop if removing the remote intent reveals a consumer that cannot proceed without deriving direction outside `DirectionalExitPolicyService`; that is an architectural issue requiring explicit direction from the user.
- Stop if any proposed implementation changes the release-blocker mapping: lower breach must remain SOL→USDC/ExitToUSDC and upper breach must remain USDC→SOL/ExitToSOL.
- Stop if `pnpm -r typecheck` exposes additional consumers that require source changes not listed in Task 1 or Task 2; update the plan/manifest before editing them.
- Stop if the existing user changes to `design.md` or `issue.md` overlap staging or would be committed.

## Self-review

- **Spec coverage:** Both fabricated schema members, the request-exit fixture, obsolete invalid fixture/test, DTO exports, mapper, adapter success path, controller test mock payload, provenance integrity, sibling-contract audit, use-case invariant tests, and operational live-check limitation are covered.
- **Placeholder scan:** The plan contains no deferred implementation markers; the upstream commit is intentionally resolved and verified at implementation time because the design does not provide a corrected commit SHA, and absence of one is a stop condition.
- **Type consistency:** `RegimePlanAction` has exactly `type` and `reasonCode`; the internal domain action remains `{ kind: 'REQUEST_EXIT_CLMM'; exitIntent?: ExitIntentPosture }`; the application mapper produces the valid directionless subset.

## Repository Targets

### Expected Files

- packages/application/src/use-cases/plans/RequestPositionPlan.test.ts

### Reference Files

- packages/domain/src/regime/PositionPlan.ts
- packages/domain/src/exit-policy/DirectionalExitPolicyService.ts

## Validation Commands

```bash
pnpm --filter @clmm/application exec vitest run src/use-cases/plans/RequestPositionPlan.test.ts
pnpm --filter @clmm/application exec eslint src/use-cases/plans/RequestPositionPlan.test.ts --ext .ts
pnpm -r typecheck
git diff --check -- packages/application/src/use-cases/plans/RequestPositionPlan.test.ts
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **directionless-application-mapping**: A validated remote REQUEST_EXIT_CLMM response enters advisory-ready state as a directionless domain REQUEST_EXIT_CLMM action. (Test: `persists request-exit advisory without remote directional intent`)
- **unchanged-non-exit-action-mapping**: HOLD and STAND_DOWN responses continue to map to the same domain action kinds. (Test: `maps hold and stand-down actions without changing their kinds`)
- **domain-only-directional-ownership**: No adapter or application mapper derives ExitToUSDC or ExitToSOL; breach direction remains owned by DirectionalExitPolicyService. (Test: `does not derive exit posture outside DirectionalExitPolicyService`)

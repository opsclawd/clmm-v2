<!-- plan-review-required -->

# Vendored Position Plan Schema Drift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept canonical `REQUEST_EXIT_CLMM` responses that omit `exitIntent`, while removing the fabricated remote-direction field from the application DTO and preserving domain-only ownership of directional exit policy.

**Architecture:** Re-vendor the corrected `regime-engine` position-plan contract as one provenance-consistent bundle, align the application DTO and its only interpreting consumer (`RequestPositionPlan`) atomically with that external shape, and verify directionless advisory behavior. The transport adapter remains a pass-through validator; `RequestPositionPlan` persists a directionless `REQUEST_EXIT_CLMM` advisory, and breach direction continues to be interpreted only by `packages/domain/src/exit-policy/DirectionalExitPolicyService.ts`.

**Tech Stack:** TypeScript, JSON Schema draft 2020-12, Ajv 8, Vitest, pnpm workspaces, ESLint.

---

## Goal

Repair the vendored position-plan contract so a real response containing `actions: [{ "type": "REQUEST_EXIT_CLMM", "reasonCode": "..." }]` validates and reaches `RegimePlanAdapter` as `{ kind: "ok" }`, without accepting or deriving remote directional intent.

## Non-goals

- Do not change the lower-bound/upper-bound directional mapping or move it out of `packages/domain/src/exit-policy/DirectionalExitPolicyService.ts`.
- Do not modify Orca, Jupiter, wallet-signing, execution, UI, or Expo code.
- Do not add a compatibility shim for upstream `exitIntent`; after this change it is an unknown action property and remains invalid under `additionalProperties: false`.
- Do not add `expiresAtUnixMs`; the current request-exit fixture already omits it, and `legacy-expires-at.json` must remain invalid.
- Do not change `schemas/regime-engine/plan-request.v1/` or `schemas/regime-engine/execution-result.v1/` unless the upstream audit finds concrete drift. Such a finding is a stop condition requiring a separately scoped contract update.
- Do not modify `PlanAction` in `packages/domain/src/regime/PositionPlan.ts`; its optional internal `exitIntent` is a domain lifecycle concern, not part of the remote DTO.
- Do not claim a production deployment or live-container check from unit tests. The adapter regression reproduces the live payload shape locally; the post-deployment diagnostic remains an operational release check requiring the existing private environment and credentials.

## Assumptions

- The upstream `regime-engine` repository will expose a corrected, merged `contracts/position-plan/v1/` directory whose `PlanAction` agrees with `src/contract/v1/types.ts` and has no `exitIntent`.
- `issue-comments.md` is empty and adds no requirements.
- The audit of the pinned plan-request and execution-result contracts is read-only because their current top-level shapes and fixtures contain no `exitIntent`, `PlanExitIntent`, or equivalent conditional direction requirement.
- The current dirty changes to `design.md` and `issue.md` belong to the user and must not be staged or altered.

## Affected files

Files to modify or delete:

- `schemas/regime-engine/position-plan.v1/schema.json`
- `schemas/regime-engine/position-plan.v1/schema.sha256`
- `schemas/regime-engine/position-plan.v1/provenance.json`
- `schemas/regime-engine/position-plan.v1/fixtures/valid/request-exit.json`
- `schemas/regime-engine/position-plan.v1/fixtures/invalid/missing-exit-intent.json` (delete)
- `packages/application/src/dto/regimePlan.ts`
- `packages/application/src/dto/index.ts`
- `packages/application/src/public/index.ts`
- `packages/application/src/use-cases/plans/RequestPositionPlan.ts`
- `packages/adapters/src/inbound/http/PlanController.test.ts`
- `packages/application/src/dto/regimePlanContract.test.ts`
- `packages/application/src/dto/regimePlanValidator.test.ts`
- `packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts`
- `packages/application/src/use-cases/plans/RequestPositionPlan.test.ts`

Read-only references:

- `design.md`
- `issue.md`
- `schemas/regime-engine/plan-request.v1/schema.json`
- `schemas/regime-engine/plan-request.v1/provenance.json`
- `schemas/regime-engine/execution-result.v1/schema.json`
- `schemas/regime-engine/execution-result.v1/provenance.json`
- `packages/application/src/dto/regimePlanValidator.ts`
- `packages/application/src/ports/index.ts`
- `packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts`
- `packages/adapters/src/inbound/http/PlanController.ts`
- `packages/testing/src/fakes/FakeRegimePlanPort.ts`
- `packages/domain/src/regime/PositionPlan.ts`
- `packages/domain/src/exit-policy/DirectionalExitPolicyService.ts`

## Behavioral invariants

1. **Canonical request-exit acceptance:** Given an otherwise valid position-plan response whose action is `REQUEST_EXIT_CLMM` and has only `type` and `reasonCode`, validation succeeds and `RegimePlanAdapter.requestPositionPlan` returns `{ kind: "ok" }`.
2. **No remote direction field:** Given an otherwise valid position-plan response whose action includes `exitIntent`, validation fails because `PlanAction.additionalProperties` remains `false`; no compatibility path silently consumes it.
3. **Directionless application mapping:** Given a validated remote `REQUEST_EXIT_CLMM`, `RequestPositionPlan` creates and accepts a domain advisory action equal to `{ kind: "REQUEST_EXIT_CLMM" }`, with no posture inferred from regime, targets, token order, or reason code.
4. **Unaffected action mapping:** Given `HOLD` or `STAND_DOWN`, `RequestPositionPlan` continues to persist the matching domain action kind.
5. **Directional ownership:** Lower- and upper-bound mapping remains unchanged and exclusively implemented by `DirectionalExitPolicyService`; no adapter or application code introduced by this work maps a response to `ExitToUSDC` or `ExitToSOL`.
6. **Vendored bundle integrity:** Every retained asset listed in position-plan `provenance.json` hashes to the recorded SHA-256; the deleted invalid fixture is removed from both disk and provenance; `schema.sha256` equals the SHA-256 of `schema.json`.
7. **Sibling-contract stability:** The plan-request and execution-result schemas continue to match the same audited upstream contract commit and are not edited when their declarations show no equivalent fabricated direction field.

## Task 1: Re-vendor canonical position-plan contract, narrow application DTO, and update mapper

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

## Task 2: Verify directionless advisory persistence and domain exit policy invariants in use-case tests

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

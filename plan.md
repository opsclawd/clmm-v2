<!-- plan-review-required -->

# Post-Observation Regime Request Timestamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every breach-qualified regime plan request samples `asOfUnixMs` after the authoritative position-detail observation, while preserving the earlier timestamp for staleness, cadence, and lease claiming.

**Architecture:** Keep both clocks inside `requestPositionPlan`: the existing `now` remains the orchestration-cycle/claim timestamp, and a narrowly scoped `requestAsOfNow` is sampled after all awaited request inputs have been read and immediately before `buildRegimePlanRequest`. Exercise the real use-case boundary with a clock-aware position-read fake so the regression test fails against the current ordering and proves both timestamp ordering and claim-time isolation.

**Tech Stack:** TypeScript, Vitest, pnpm workspaces, ESLint.

---

## Goal

Fix the permanent upstream validation failure caused by sending a breach-qualified request whose `position.observedAtUnixMs` is later than its top-level `asOfUnixMs`. The emitted request must satisfy `position.observedAtUnixMs <= asOfUnixMs` when the detail RPC advances time, without changing the earlier stateful claim calculations.

## Non-goals

- Do not change `SupportedPositionReadPort`, `ClockPort`, `RegimePlanPort`, or any exported API signature.
- Do not modify Orca/Solana adapters or constrain adapter observation timestamps.
- Do not alter the vendored regime-engine schemas, request builder validation, or upstream service validation.
- Do not replace all uses of the existing `now`; it remains authoritative for position staleness, `closedCandleAt`, `claimPlanRequest`, and the existing local `requestedAt` lifecycle value.
- Do not change retry throttling, lease duration, lease completion, response timestamps, plan identity, or conflict behavior.
- Do not derive or modify lower/upper breach direction. The release-blocker mapping remains exclusively in `packages/domain/src/exit-policy/DirectionalExitPolicyService.ts`.
- Do not deploy or manually trigger a plan request as part of implementation. The issue's natural-cron production observation is a post-deployment release check.
- Do not create a broad test refactor. Although `RequestPositionPlan.test.ts` is large, this task is source-behavior work and confines its test changes to the existing request-construction describe block and its local fake.

## Assumptions

- `clock.now()` and the adapter observation clock are sufficiently synchronized and non-decreasing in production, so sampling after detail resolution yields `asOfUnixMs >= observedAtUnixMs`.
- The non-zero RPC delay is represented deterministically in tests by advancing the injected fake clock immediately before `getPositionDetail` returns a detail stamped with the advanced time.
- `issue-comments.md` is present but empty and adds no requirements.
- The existing dirty changes to `design.md` and `issue.md` belong to the user and must not be modified or staged.
- The worktree currently lacks root `node_modules`; before executing the task, run `pnpm install --frozen-lockfile`. If package build outputs are still unresolved, run `pnpm build` as the documented worktree bootstrap prerequisite. Neither command is an implementation task and neither should change tracked files.

## Affected files

Files to modify:

- `packages/application/src/use-cases/plans/RequestPositionPlan.ts`
- `packages/application/src/use-cases/plans/RequestPositionPlan.test.ts`

Read-only references:

- `design.md`
- `issue.md`
- `issue-comments.md`
- `packages/application/src/use-cases/plans/buildRegimePlanRequest.ts`
- `packages/application/src/dto/regimePlan.ts`
- `packages/application/src/ports/index.ts`
- `packages/domain/src/exit-policy/DirectionalExitPolicyService.ts`
- `schemas/regime-engine/plan-request.v1/schema.json`

## Behavioral invariants

1. **Post-observation request ordering:** When the request cycle begins at `1_000_000`, `getPositionDetail` advances the clock by 131 ms, and the returned detail is observed at `1_000_131`, the request sent to `RegimePlanPort` has `asOfUnixMs === 1_000_131` and therefore `asOfUnixMs >= position.observedAtUnixMs`. Named test: `uses a post-detail timestamp for the request while preserving the claim-time timestamp`.
2. **Claim-time isolation:** Under that same delayed detail read, `claimPlanRequest` still receives `now === 1_000_000`; the later request timestamp must not leak backward into staleness, closed-candle, cadence, or lease-claim calculations. Named test: `uses a post-detail timestamp for the request while preserving the claim-time timestamp`.
3. **Lease lifecycle stability:** A claimed request still finishes through the existing `finally` path and the fresh request timestamp does not introduce a new lease transition, retry path, or completion outcome. Existing named tests `finishes a claimed lease exactly once after persisting a valid response` and `transport failure clears the lease without allowing immediate retry spam` remain green.
4. **Directional-policy isolation:** A qualified lower breach is used only to make the request breach-qualified; this fix neither maps the breach to an exit posture nor changes the domain-owned directional invariant. Existing named test `does not derive exit posture outside DirectionalExitPolicyService` remains green.

## Tests to add or update

- Extend `FakeSupportedPositionReadPort` in `RequestPositionPlan.test.ts` with a synchronous, nullable `beforeGetPositionDetail` hook. Invoke it immediately before returning `_detail` so a test can model time passing during the RPC without production sleeps or fake timers.
- Add one regression test to `describe('builds a position-scoped request from authoritative local state')`. Use a qualified lower-breach position, advance `FakeClockPort` by 131 ms from the detail-read hook, return detail stamped at the advanced time, and assert both request ordering and the unchanged claim timestamp.
- Run the entire `RequestPositionPlan.test.ts` file after the focused red/green loop to cover request construction, stale-state rejection, cadence, lease finalization, advisory mapping, and directional-policy isolation.

## Task 1: Sample the regime request timestamp after the detail observation

**Files:**

- Modify: `packages/application/src/use-cases/plans/RequestPositionPlan.test.ts` (`FakeSupportedPositionReadPort`, lines 160-198, and the request-construction describe block beginning at line 627)
- Modify: `packages/application/src/use-cases/plans/RequestPositionPlan.ts` (request assembly around lines 191-210 only)
- Read: `packages/application/src/use-cases/plans/buildRegimePlanRequest.ts`
- Read: `packages/application/src/ports/index.ts`
- Read: `packages/domain/src/exit-policy/DirectionalExitPolicyService.ts`

**Exported signature changes:** None. The new setter is private test-fixture behavior inside a non-exported fake; production ports and use-case signatures stay unchanged.

**Invariants to test first:**

- `uses a post-detail timestamp for the request while preserving the claim-time timestamp`

- [ ] **Step 1: Add the delayed-detail test seam and failing regression test.**

  In `FakeSupportedPositionReadPort`, add a hook field and setter next to the existing fake state and setters:

  ```ts
  private _beforeGetPositionDetail: (() => void) | null = null;

  setBeforeGetPositionDetail(hook: (() => void) | null): void {
    this._beforeGetPositionDetail = hook;
  }
  ```

  Invoke the hook only in the detail-read method, immediately before returning the configured detail:

  ```ts
  async getPositionDetail(
    _walletId: WalletId,
    _positionId: PositionId,
  ): Promise<PositionDetail | null> {
    this._beforeGetPositionDetail?.();
    return this._detail;
  }
  ```

  Add the following test as the final case inside `describe('builds a position-scoped request from authoritative local state')`:

  ```ts
  it('uses a post-detail timestamp for the request while preserving the claim-time timestamp', async () => {
    const position = makeBelowRangePosition(FIXTURE_POSITION_ID, FIXTURE_WALLET_ID);
    const detailPosition = {
      ...position,
      lastObservedAt: makeClockTimestamp(1_000_131),
    };
    positionRead.setPosition(position);
    positionRead.setDetail(makeFixtureDetail(detailPosition));
    positionRead.setBeforeGetPositionDetail(() => clock.advance(131));
    triggerRepo.setTriggers([makeLowerTrigger(FIXTURE_POSITION_ID)]);

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

    const request = regimePort.getRequests()[0]!;
    expect(request.position.breachQualified).toBe(true);
    expect(request.position.observedAtUnixMs).toBe(1_000_131);
    expect(request.asOfUnixMs).toBe(1_000_131);
    expect(request.asOfUnixMs).toBeGreaterThanOrEqual(request.position.observedAtUnixMs);
    expect(planRepo.claimedCalls[0]?.now).toBe(1_000_000);
  });
  ```

- [ ] **Step 2: Run the focused test and confirm the regression is red.**

  Run:

  ```bash
  pnpm --filter @clmm/application exec vitest run src/use-cases/plans/RequestPositionPlan.test.ts -t "uses a post-detail timestamp for the request while preserving the claim-time timestamp"
  ```

  Expected: FAIL against the current implementation because the captured request has `asOfUnixMs` equal to `1_000_000`, while `position.observedAtUnixMs` equals `1_000_131`. The breach-qualified and claim-time assertions should already pass. If the request is not emitted at all, inspect the fixture against `buildRegimePlanRequest` rather than weakening the ordering assertion.

- [ ] **Step 3: Capture and use the request-specific timestamp.**

  In `RequestPositionPlan.ts`, leave the initial `now`, its staleness calculation, `closedCandleAt`, `claimPlanRequest`, and `requestedAt` unchanged. After `supportedPositions`, `walletHistory`, and `existingPlan` resolve, sample the request time and pass it only to the request builder:

  ```ts
  const supportedPositions = await positionReadPort.listSupportedPositions(walletId);
  const walletHistory = await executionHistoryRepository.getWalletHistory(walletId);
  const existingPlan = await planRepository.getCurrentPlan(positionId);
  const requestAsOfNow = clock.now();

  const request = buildRegimePlanRequest({
    positionDetail,
    config: config.config,
    asOfUnixMs: requestAsOfNow,
    supportedPositionsCount: supportedPositions.length,
    qualifiedTrigger: qualifiedTrigger ?? null,
    walletHistory,
  });
  ```

  Do not clamp with `Math.max`, mutate `positionDetail`, or pass the fresh timestamp to `claimPlanRequest`; those approaches hide clock disagreement or change lease semantics. The automatic implement-loop gate `pnpm -r typecheck` must pass after this production edit.

- [ ] **Step 4: Run task-scoped verification.**

  Run these exact commands from the repository root:

  ```bash
  pnpm --filter @clmm/application exec vitest run src/use-cases/plans/RequestPositionPlan.test.ts -t "uses a post-detail timestamp for the request while preserving the claim-time timestamp"
  pnpm --filter @clmm/application exec vitest run src/use-cases/plans/RequestPositionPlan.test.ts
  pnpm exec eslint packages/application/src/use-cases/plans/RequestPositionPlan.ts packages/application/src/use-cases/plans/RequestPositionPlan.test.ts --ext .ts
  pnpm --filter @clmm/application typecheck
  git diff --check -- packages/application/src/use-cases/plans/RequestPositionPlan.ts packages/application/src/use-cases/plans/RequestPositionPlan.test.ts
  ```

  Expected: the focused regression and the complete use-case test file pass; ESLint reports no errors for either changed file; the application TypeScript project typechecks; and `git diff --check` reports no whitespace errors. The orchestrated implement loop additionally runs its mandatory workspace-wide `pnpm -r typecheck` gate automatically.

- [ ] **Step 5: Commit the self-contained fix.**

  ```bash
  git add packages/application/src/use-cases/plans/RequestPositionPlan.ts packages/application/src/use-cases/plans/RequestPositionPlan.test.ts
  git diff --cached --check
  git commit -m "fix(plans): timestamp requests after position observation"
  ```

  Confirm `design.md`, `issue.md`, `plan.md`, and `task-manifest.json` are not included in the implementation commit unless the outer workflow explicitly owns planning-artifact commits.

## Validation commands

Task-local correctness is established by Task 1's focused Vitest, full use-case test file, file-scoped ESLint, application-project typecheck, and two-file diff check. The implementation workflow's automatic `pnpm -r typecheck` gate provides workspace signature coverage even though this plan introduces no signature changes.

After the merged fix is deployed and a real breach-qualified position is available, perform the issue's read-only natural-cron release check without manually invoking the job:

```bash
railway logs -s clmm-worker --since 30m --json | rg 'RequestPositionPlan|RegimePlan validation error|REQUEST_EXIT_CLMM|"kind":"ok"|"status":"superseded"'
```

Acceptance requires a natural worker cycle to show the outbound regime request succeeding with a `REQUEST_EXIT_CLMM` action and no `observedAtUnixMs ... must not exceed asOfUnixMs` permanent validation error for that cycle. If no breach-qualified cycle occurs in the window, record the production criterion as pending; do not substitute a manually triggered request because the issue explicitly requires natural-cron evidence.

## Risk areas

- **Clock-source disagreement:** Capturing later fixes ordinary RPC latency, but it cannot guarantee ordering if the injected application clock lags the adapter's wall clock. Such a finding needs a separate clock-boundary design, not a clamp in this patch.
- **Wrong timestamp reuse:** Replacing the original `now` globally could change stale-state rejection, candle boundaries, minimum-interval suppression, lease expiry, or persisted `requestedAt` values. The source change must remain one new variable and one changed builder argument.
- **Additional awaited reads:** Sampling immediately before request construction intentionally covers time spent reading supported positions, wallet history, and the existing plan after the detail RPC. Moving the sample above `getPositionDetail` recreates the bug.
- **Test realism:** The regression must return a detail genuinely stamped with the advanced fake-clock time. Merely advancing the clock while reusing a detail stamped at `1_000_000` would pass without reproducing the production failure.
- **Stateful lease flow:** `requestPositionPlan` owns a claimed/finished lease lifecycle with failure cleanup in `finally`. The fix must not add a new transition or bypass existing completion behavior.
- **Directional safety:** The regression may use a lower breach to reach the live failure path, but no test or implementation may infer `SOL->USDC`, `USDC->SOL`, `ExitToUSDC`, or `ExitToSOL` outside the domain policy service.

## Stop conditions

- Stop if the regression requires changing a production port/interface, adapter, vendored schema, or `buildRegimePlanRequest`; that exceeds the localized issue design and needs re-scoping.
- Stop if a post-detail `clock.now()` is still lower than the returned `lastObservedAt` under a faithful test or production trace. Do not add `Math.max`, rewrite adapter timestamps, or silently accept clock skew without a new design decision.
- Stop if implementation requires changing any lower/upper breach directional mapping or deriving direction outside `DirectionalExitPolicyService`.
- Stop if `pnpm install --frozen-lockfile` changes `pnpm-lock.yaml` or bootstrap exposes unrelated tracked-file mutations; preserve the user's work and resolve the environment before implementing.
- Stop if the focused test fails for a reason other than the expected old `asOfUnixMs` value, or if the complete use-case test file reveals a lease, cadence, stale-state, or advisory regression after the one-line production substitution.
- Stop the production verification and report it as pending if Railway credentials/environment linkage are unavailable, no natural breach-qualified cron cycle occurs, or the deployed revision cannot be confirmed. Do not claim live verification from local tests.
- Stop and capture the request/log evidence if the natural cron cycle still returns the same permanent ordering validation error after deployment; do not broaden the patch during release verification.

## Self-review

- **Spec coverage:** The single task covers fresh post-detail sampling, preserves claim-time behavior, adds a deterministic non-zero-delay regression, and defines the separate natural-cron release check. Adapter/schema changes and directional derivation are explicitly excluded.
- **Task boundaries:** The production change and its regression fake/test are one independently committable unit. There is no port/interface split and no standalone validation task.
- **Large-test-file rule:** `RequestPositionPlan.test.ts` exceeds 500 lines and ten test cases, but the task's primary purpose is the production timestamp fix, not a broad existing-test update. Only one describe block and its local fake change; splitting the test from the implementation would break TDD and leave an unverified commit.
- **Signature consistency:** No exported declaration changes. `requestPositionPlan`, `ClockPort.now`, `SupportedPositionReadPort.getPositionDetail`, and `buildRegimePlanRequest` retain their current signatures.
- **Placeholder scan:** The plan contains no deferred implementation placeholders; code changes, test data, expected failure, validation commands, and stop conditions are explicit.

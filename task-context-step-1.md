# Task Context: Task 1

Title: Sample the regime request timestamp after the detail observation

## Workspace & Scope Constraints

## WORKSPACE CONSTRAINTS

Your working directory is a dedicated git worktree with the repository's complete history. Run all commands from it. Do NOT cd to or read paths outside this directory — external-directory access is automatically rejected. git log, git diff, etc. work here directly.

.ai-orchestrator.local.json, if one exists, lives only in the main checkout and is intentionally not copied into your worktree — it is operator-machine-specific and not part of your task. Do not search for it or read it outside this directory. Reason about configuration using only .ai-orchestrator.json in your own working directory; treat it as the effective config for your task.

Working Directory: /home/gary/.openclaw/workspace/clmm-superpowers-v2/.ai-worktrees/issue-123
Repository: opsclawd/clmm-v2
Branch: ai/issue-123
Start Commit: 387d95b224581ae2f38a5c1751d7ed1a31ba53d7

## Task Requirements

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

## Repository Targets

### Expected Files

- packages/application/src/use-cases/plans/RequestPositionPlan.ts
- packages/application/src/use-cases/plans/RequestPositionPlan.test.ts

### Reference Files

- design.md
- issue.md
- issue-comments.md
- packages/application/src/use-cases/plans/buildRegimePlanRequest.ts
- packages/application/src/dto/regimePlan.ts
- packages/application/src/ports/index.ts
- packages/domain/src/exit-policy/DirectionalExitPolicyService.ts
- schemas/regime-engine/plan-request.v1/schema.json

## Validation Commands

```bash
pnpm --filter @clmm/application exec vitest run src/use-cases/plans/RequestPositionPlan.test.ts -t "uses a post-detail timestamp for the request while preserving the claim-time timestamp"
["pnpm","--filter","@clmm/application","exec","vitest","run","src/use-cases/plans/RequestPositionPlan.test.ts"]
["pnpm","exec","eslint","packages/application/src/use-cases/plans/RequestPositionPlan.ts","packages/application/src/use-cases/plans/RequestPositionPlan.test.ts","--ext",".ts"]
["pnpm","--filter","@clmm/application","typecheck"]
git diff --check -- packages/application/src/use-cases/plans/RequestPositionPlan.ts packages/application/src/use-cases/plans/RequestPositionPlan.test.ts
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **post-observation request ordering with claim-time isolation**: When getPositionDetail advances the clock from 1000000 to 1000131 and returns a detail observed at 1000131, the emitted request uses asOfUnixMs 1000131 while claimPlanRequest retains now 1000000. (Test: `uses a post-detail timestamp for the request while preserving the claim-time timestamp`)
- **successful lease completion remains exactly once**: A successfully persisted response still finishes the previously claimed lease exactly once through the existing finally path. (Test: `finishes a claimed lease exactly once after persisting a valid response`)
- **failed transport lease cleanup remains throttled**: A transport failure still clears the lease as failed and preserves minimum-interval suppression of an immediate retry. (Test: `transport failure clears the lease without allowing immediate retry spam`)
- **directional policy remains domain-owned**: Using a qualified breach to exercise request construction does not derive an exit posture outside DirectionalExitPolicyService. (Test: `does not derive exit posture outside DirectionalExitPolicyService`)

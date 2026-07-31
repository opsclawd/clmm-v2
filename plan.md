<!-- plan-review-required -->

# Reconcile `/v1/plan` Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CLMM V2 submit authenticated, contract-valid position plans to `regime-engine` on a durable background cadence, preserve the upstream `planId`/`planHash` unchanged, and report terminal execution results against that same remote identity.

**Architecture:** Keep contract and orchestration types in `packages/application`, HTTP translation and pg-boss wiring in `packages/adapters`, and durable request-throttle state in PostgreSQL behind `PlanRepository`. The breach scan publishes lightweight plan-request jobs only after a successful wallet snapshot; a dedicated handler calls the application use case, whose atomic lease enforces one active request per position and whose trigger rules permit interval, range-transition, qualified-breach, and newly closed-candle refreshes. The existing directional exit policy is not touched.

**Tech Stack:** TypeScript, Vitest, NestJS, pg-boss, Drizzle ORM/PostgreSQL, AJV 2020, pnpm/Turborepo, Railway.

---

## Goal

Reconcile the existing integration rather than replace it. The completed flow must post a canonical request to `POST /v1/plan`, reject stale or incomplete local state before any network call, preserve the response identity in `position_plans`, and automatically initiate plan requests from the backend worker without delaying breach qualification or execution safety.

## Non-goals

- Do not modify `packages/domain/src/exit-policy/DirectionalExitPolicyService` or re-derive breach direction/posture anywhere else.
- Do not add UI screens or make screen-open behavior the automated cadence.
- Do not add a general trading scheduler, multi-protocol planner, redeployment flow, or autonomous execution.
- Do not add backend signing authority, custody, on-chain receipts, attestations, proofs, or claim verification.
- Do not hard-code a guessed upstream `PlanRequest.config` shape or fabricate unavailable portfolio/autopilot values.
- Do not publish a nonexistent npm contracts package. Upstream contracts are vendored from a pinned `opsclawd/regime-engine` commit.
- Do not modify `regime-engine` source from this worktree. Its authentication patch and request-contract publication are companion work and deployment prerequisites.
- Do not treat a local unit test as proof of the production acceptance criterion; the final release gate includes authenticated live traffic and correlated logs in both services.

## Assumptions and external prerequisites

1. The companion `regime-engine` change publishes a JSON Schema plus valid/invalid fixtures at `contracts/plan-request/v1/`, protects `POST /v1/plan` with the `X-CLMM-Internal-Token` shared secret, and deploys before CLMM V2 enables automated requests. The upstream secret is named `CLMM_INTERNAL_TOKEN`; its value equals CLMM V2's existing `REGIME_ENGINE_INTERNAL_TOKEN` deployment secret.
2. The current checked-in response and execution-result schemas remain authoritative until refreshed from the same upstream commit. The issue's claim that the execution-result endpoint expects schema version `"1.0"` conflicts with the vendored `execution-result.v1` schema; Task 1 resolves that from upstream artifacts instead of guessing.
3. `PositionDetail.principalTokenAmounts` and `PoolData.tokenPair` are the source for `solUnits` and `usdcUnits`; `currentPrice` values SOL in USDC, so `navUsd = solUnits * currentPrice + usdcUnits`. A missing principal quote, missing decimals, non-finite value, or non-SOL/USDC pair is a fail-closed `portfolio-unavailable` outcome.
4. `activeClmm` is the count of currently supported positions for the wallet. `stopouts24h` counts qualified-breach terminal exits in the wallet's off-chain history during `[now - 24h, now]`. `redeploys24h` is always zero because redeployment is outside this product. `strikeCount`, cooldown, and stand-down values come from durable planner state; absence means the schema-defined neutral values only if upstream documents those values as neutral.
5. A newly closed one-hour candle is represented by `floor(now / 3_600_000) * 3_600_000 - 3_600_000`. This is a refresh signal, not a claim that CLMM owns candle ingestion.
6. The minimum refresh interval is 15 minutes and the in-flight lease is 2 minutes. Both are named constants in application code and may only become configuration after evidence shows an operational need.

## Affected files

**Vendored contracts**

- `schemas/regime-engine/plan-request.v1/schema.json`
- `schemas/regime-engine/plan-request.v1/schema.sha256`
- `schemas/regime-engine/plan-request.v1/provenance.json`
- `schemas/regime-engine/plan-request.v1/fixtures/valid/in-range.json`
- `schemas/regime-engine/plan-request.v1/fixtures/valid/breach-qualified.json`
- `schemas/regime-engine/plan-request.v1/fixtures/invalid/missing-portfolio.json`
- `schemas/regime-engine/plan-request.v1/fixtures/invalid/missing-autopilot-state.json`
- `schemas/regime-engine/plan-request.v1/fixtures/invalid/missing-config.json`
- `schemas/regime-engine/position-plan.v1/schema.json`
- `schemas/regime-engine/position-plan.v1/schema.sha256`
- `schemas/regime-engine/position-plan.v1/provenance.json`
- `schemas/regime-engine/position-plan.v1/fixtures/valid/hold.json`
- `schemas/regime-engine/position-plan.v1/fixtures/valid/request-exit.json`
- `schemas/regime-engine/position-plan.v1/fixtures/invalid/unsupported-action.json`
- `schemas/regime-engine/position-plan.v1/fixtures/invalid/missing-exit-intent.json`
- `schemas/regime-engine/position-plan.v1/fixtures/invalid/inline-candles-and-portfolio.json`
- `schemas/regime-engine/execution-result.v1/schema.json`
- `schemas/regime-engine/execution-result.v1/schema.sha256`
- `schemas/regime-engine/execution-result.v1/provenance.json`
- `schemas/regime-engine/execution-result.v1/fixtures/valid/success.json`
- `schemas/regime-engine/execution-result.v1/fixtures/valid/skipped.json`
- `schemas/regime-engine/execution-result.v1/fixtures/invalid/unsupported-status.json`
- `schemas/regime-engine/execution-result.v1/fixtures/invalid/extra-forbidden-fields.json`

**Application contracts and orchestration**

- `packages/application/src/dto/regimePlan.ts`
- `packages/application/src/dto/regimePlanValidator.ts`
- `packages/application/src/dto/regimePlanValidator.test.ts`
- `packages/application/src/dto/regimePlanContract.test.ts`
- `packages/application/src/ports/index.ts`
- `packages/application/src/use-cases/plans/buildRegimePlanRequest.ts`
- `packages/application/src/use-cases/plans/buildRegimePlanRequest.test.ts`
- `packages/application/src/use-cases/plans/RequestPositionPlan.ts`
- `packages/application/src/use-cases/plans/RequestPositionPlan.test.ts`
- `packages/application/src/use-cases/plans/RecordPlanDecision.test.ts`
- `packages/application/src/use-cases/plans/SyncPlanExecutionResults.ts`
- `packages/application/src/use-cases/plans/SyncPlanExecutionResults.test.ts`
- `packages/application/src/use-cases/triggers/ScanPositionsForBreaches.ts`
- `packages/application/src/use-cases/triggers/ScanPositionsForBreaches.test.ts`

**Adapters, persistence, and worker wiring**

- `packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts`
- `packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts`
- `packages/adapters/src/outbound/storage/schema/position-plan-request-state.ts`
- `packages/adapters/src/outbound/storage/schema/index.ts`
- `packages/adapters/src/outbound/storage/PlanStorageAdapter.ts`
- `packages/adapters/src/outbound/storage/PlanStorageAdapter.test.ts`
- `packages/adapters/src/outbound/storage/schema/__tests__/schema-snapshot.test.ts`
- `packages/adapters/drizzle/0005_position_plan_request_state.sql`
- `packages/adapters/drizzle/meta/_journal.json`
- `packages/adapters/drizzle/meta/0005_snapshot.json`
- `packages/adapters/src/composition/RegimePlanRequestConfig.ts`
- `packages/adapters/src/composition/RegimePlanRequestConfig.test.ts`
- `packages/adapters/src/composition/AdaptersModule.ts`
- `packages/adapters/src/inbound/http/tokens.ts`
- `packages/adapters/src/inbound/http/AppModule.ts`
- `packages/adapters/src/inbound/http/PlanController.ts`
- `packages/adapters/src/inbound/http/PlanController.test.ts`
- `packages/adapters/src/inbound/jobs/tokens.ts`
- `packages/adapters/src/inbound/jobs/BreachScanJobHandler.ts`
- `packages/adapters/src/inbound/jobs/BreachScanJobHandler.test.ts`
- `packages/adapters/src/inbound/jobs/PositionPlanRequestJobHandler.ts`
- `packages/adapters/src/inbound/jobs/PositionPlanRequestJobHandler.test.ts`
- `packages/adapters/src/inbound/jobs/WorkerModule.ts`
- `packages/adapters/src/inbound/jobs/WorkerModule.test.ts`
- `packages/adapters/src/inbound/jobs/WorkerLifecycle.ts`
- `packages/adapters/src/inbound/jobs/WorkerLifecycle.test.ts`

**Testing support and end-to-end scenarios**

- `packages/testing/src/fakes/FakePlanRepository.ts`
- `packages/testing/src/fakes/FakeRegimePlanPort.ts`
- `packages/testing/src/scenarios/PositionPlanLifecycle.test.ts`

## Behavioral invariants

1. **Contract authority:** Only a request accepted by the vendored `plan-request.v1` schema may cross the adapter boundary. Missing `portfolio`, `autopilotState`, or `config` fails locally without a fetch.
2. **Endpoint and authentication:** Every plan request targets `/v1/plan` and every plan/result write carries `X-CLMM-Internal-Token`; 401/403 is permanent, while network/timeout/5xx remains retryable-degraded.
3. **Fresh financial state:** If position age is greater than five minutes, principal inventory is unavailable, token identity is ambiguous, or numeric conversion is non-finite, no plan request is sent.
4. **Remote identity:** For an accepted response, local `PositionPlan.planId` equals `response.planId` and local `canonicalHash` equals `response.planHash`. A local ID generator never supplies either value.
5. **Result correlation:** Every execution-result payload uses the persisted remote `planId` and `planHash` unchanged, including all retries after restart.
6. **One active request:** When position `P` has an unexpired lease, all concurrent claims for `P` are suppressed; claims for other positions remain independent.
7. **Refresh transitions:** A claim is granted when there is no prior state, the minimum interval elapsed, range state changed, a breach became qualified, the qualified breach identity changed, a new one-hour candle closed, or an abandoned lease expired. Otherwise it is suppressed.
8. **Failure throttling:** A transport failure clears the active lease but preserves `lastAttemptAt` and the consumed signal markers, so ordinary observations cannot immediately spam the endpoint; later interval or genuinely newer signals can retry.
9. **Stale suppression precedes lease acquisition:** Stale snapshots never consume a cadence signal or lease.
10. **Background isolation:** A successful wallet scan enqueues one plan-request job per open supported position. Enqueue or execution failure is logged per position and does not block trigger qualification, abandonment handling, execution, or scanning of other positions.
11. **Directional precedence:** A qualified lower or upper breach continues to supersede advisory output exactly as today; no task maps breach direction to target assets outside `DirectionalExitPolicyService`.

## Task 1: Pin the canonical request, response, and result contracts

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

## Task 2: Correct the plan transport endpoint without changing failure semantics

**Files:**

- Modify: `packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts`
- Modify: `packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts`

- [ ] Change the existing transport test first so `posts the exact canonical position-plan request` expects `https://regime.example.com/v1/plan` and still asserts `POST`, JSON content type, and `X-CLMM-Internal-Token`.
- [ ] Change only the plan URL construction from `/v1/position-plan` to `/v1/plan`. Keep timeout, error-envelope parsing, and status classification unchanged.
- [ ] Add a trailing-slash case proving `https://regime.example.com/` resolves to exactly one slash before `v1/plan`.
- [ ] Preserve the execution-result path `/v1/execution-result` and its authentication assertion.
- [ ] Commit as `fix(adapters): target regime v1 plan endpoint`.

**Acceptance and scoped verification:**

```bash
pnpm --filter @clmm/adapters exec vitest run src/outbound/regime-engine/RegimePlanAdapter.test.ts
pnpm --filter @clmm/adapters exec eslint src/outbound/regime-engine/RegimePlanAdapter.ts src/outbound/regime-engine/RegimePlanAdapter.test.ts --ext .ts
git diff --check -- packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts
```

Expected: the focused adapter suite passes with `/v1/plan`; auth, timeout, 4xx, and 5xx classifications are unchanged.

## Task 3: Build a contract-valid request and persist upstream identity

**Files:**

- Modify: `packages/application/src/dto/regimePlan.ts`
- Modify: `packages/application/src/dto/regimePlanValidator.ts`
- Modify: `packages/application/src/dto/regimePlanValidator.test.ts`
- Modify: `packages/application/src/dto/regimePlanContract.test.ts`
- Modify: `packages/application/src/ports/index.ts`
- Create: `packages/application/src/use-cases/plans/buildRegimePlanRequest.ts`
- Create: `packages/application/src/use-cases/plans/buildRegimePlanRequest.test.ts`
- Modify: `packages/application/src/use-cases/plans/RequestPositionPlan.ts`
- Modify: `packages/application/src/use-cases/plans/RequestPositionPlan.test.ts`
- Modify: `packages/adapters/src/outbound/storage/PlanStorageAdapter.ts`
- Modify: `packages/adapters/src/outbound/storage/PlanStorageAdapter.test.ts`
- Create: `packages/adapters/src/composition/RegimePlanRequestConfig.ts`
- Create: `packages/adapters/src/composition/RegimePlanRequestConfig.test.ts`
- Modify: `packages/adapters/src/composition/AdaptersModule.ts`
- Modify: `packages/adapters/src/inbound/http/tokens.ts`
- Modify: `packages/adapters/src/inbound/http/AppModule.ts`
- Modify: `packages/adapters/src/inbound/http/PlanController.ts`
- Modify: `packages/adapters/src/inbound/http/PlanController.test.ts`
- Modify: `packages/adapters/src/inbound/jobs/tokens.ts`
- Modify: `packages/adapters/src/inbound/jobs/WorkerModule.ts`
- Modify: `packages/adapters/src/inbound/jobs/WorkerModule.test.ts`
- Modify: `packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts`
- Modify: `packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts`
- Modify: `packages/testing/src/fakes/FakeRegimePlanPort.ts`
- Modify: `packages/testing/src/fakes/FakePlanRepository.ts`
- Modify: `packages/testing/src/scenarios/PositionPlanLifecycle.test.ts`

- [ ] Mirror the exact required request structure from `schemas/regime-engine/plan-request.v1/schema.json` in `RegimePlanRequest`. Add request validation alongside response/result validation and export a fail-closed `parseRegimePlanRequest(value): RegimePlanRequest | null`.
- [ ] Write the new builder tests first with these exact names: `maps SOL and USDC principal units regardless of pool token order`, `computes navUsd from principal units and current SOL price`, `uses geckoterminal solana one-hour market identity`, `derives autopilot counters only from authoritative local history`, `uses zero redeploys because redeployment is unsupported`, `rejects missing principal inventory`, `rejects unknown token pairs`, and `rejects configuration that fails the vendored schema`.
- [ ] Implement `buildRegimePlanRequest` as a pure application helper. Convert bigint principal amounts using token decimals, identify SOL/USDC by symbols and known mints rather than token order, reject unsafe numeric values, count only last-24-hour qualified-breach terminal history, calculate the latest closed one-hour candle, and validate the finished object before returning it.
- [ ] Add `resolveRegimePlanRequestConfig` at composition time. Parse the exact schema-owned config fields from `REGIME_PLAN_CONFIG_JSON`; return a discriminated `configured | missing | invalid` result without defaults. Register the resolved value under one shared `REGIME_PLAN_REQUEST_CONFIG` token in both HTTP and worker composition.
- [ ] Update `requestPositionPlan` to receive `ExecutionHistoryRepository` and the resolved config, load `PositionDetail`, supported-position count, actionable triggers, and wallet history, and return `unavailable` with `portfolio-unavailable` or `config-unavailable` before transport when authoritative inputs are missing.
- [ ] Keep stale-state rejection before expensive reads and before transport. Keep qualified breach precedence unchanged.
- [ ] Replace `idGenerator.generateId()` and the local fingerprint cast: call `planRepository.createRequest` with `response.planId` as `PlanId` and `response.planHash` as `CanonicalHash`; continue storing the local snapshot fingerprint only as diagnostic request metadata.
- [ ] On exact remote replay, return the just-validated upstream response rather than casting `PositionPlan` to `RegimePlanResponse`. On local conflict, report the upstream plan ID and do not accept the response into a different row.
- [ ] Order `PlanStorageAdapter.getCurrentPlan(positionId)` by `requestedAt` descending (with `planId` as a deterministic tie-breaker) before `limit(1)`, and make the shared fake select the same latest plan. This prevents automated refreshes from returning an arbitrary historical row.
- [ ] Update every existing caller in the same task: `PlanController`, the application tests, and the testing scenario. Update `FakeRegimePlanPort` fixtures and the production `RegimePlanAdapter` declaration/diagnostics to consume the reconciled request type in this task; keep transport behavior from Task 2 unchanged.
- [ ] Name identity tests `persists response planId and planHash unchanged`, `does not generate a local plan identity`, and `returns the validated remote response for an exact replay`.
- [ ] Commit as `feat(plans): reconcile request contract and remote identity`.

**Acceptance and scoped verification:**

```bash
pnpm --filter @clmm/application exec vitest run src/dto/regimePlanValidator.test.ts src/dto/regimePlanContract.test.ts src/use-cases/plans/buildRegimePlanRequest.test.ts src/use-cases/plans/RequestPositionPlan.test.ts
pnpm --filter @clmm/adapters exec vitest run src/composition/RegimePlanRequestConfig.test.ts src/outbound/regime-engine/RegimePlanAdapter.test.ts src/inbound/http/PlanController.test.ts src/inbound/jobs/WorkerModule.test.ts
pnpm --filter @clmm/adapters exec vitest run src/outbound/storage/PlanStorageAdapter.test.ts
pnpm --filter @clmm/testing exec vitest run src/scenarios/PositionPlanLifecycle.test.ts
pnpm --filter @clmm/application exec eslint src/dto/regimePlan.ts src/dto/regimePlanValidator.ts src/dto/regimePlanValidator.test.ts src/dto/regimePlanContract.test.ts src/ports/index.ts src/use-cases/plans/buildRegimePlanRequest.ts src/use-cases/plans/buildRegimePlanRequest.test.ts src/use-cases/plans/RequestPositionPlan.ts src/use-cases/plans/RequestPositionPlan.test.ts --ext .ts
pnpm --filter @clmm/adapters exec eslint src/composition/RegimePlanRequestConfig.ts src/composition/RegimePlanRequestConfig.test.ts src/composition/AdaptersModule.ts src/inbound/http/tokens.ts src/inbound/http/AppModule.ts src/inbound/http/PlanController.ts src/inbound/http/PlanController.test.ts src/inbound/jobs/tokens.ts src/inbound/jobs/WorkerModule.ts src/inbound/jobs/WorkerModule.test.ts src/outbound/regime-engine/RegimePlanAdapter.ts src/outbound/regime-engine/RegimePlanAdapter.test.ts src/outbound/storage/PlanStorageAdapter.ts src/outbound/storage/PlanStorageAdapter.test.ts --ext .ts
git diff --check -- packages/application/src/dto/regimePlan.ts packages/application/src/dto/regimePlanValidator.ts packages/application/src/dto/regimePlanValidator.test.ts packages/application/src/dto/regimePlanContract.test.ts packages/application/src/ports/index.ts packages/application/src/use-cases/plans/buildRegimePlanRequest.ts packages/application/src/use-cases/plans/buildRegimePlanRequest.test.ts packages/application/src/use-cases/plans/RequestPositionPlan.ts packages/application/src/use-cases/plans/RequestPositionPlan.test.ts packages/adapters/src/composition/RegimePlanRequestConfig.ts packages/adapters/src/composition/RegimePlanRequestConfig.test.ts packages/adapters/src/composition/AdaptersModule.ts packages/adapters/src/inbound/http/tokens.ts packages/adapters/src/inbound/http/AppModule.ts packages/adapters/src/inbound/http/PlanController.ts packages/adapters/src/inbound/http/PlanController.test.ts packages/adapters/src/inbound/jobs/tokens.ts packages/adapters/src/inbound/jobs/WorkerModule.ts packages/adapters/src/inbound/jobs/WorkerModule.test.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts packages/adapters/src/outbound/storage/PlanStorageAdapter.ts packages/adapters/src/outbound/storage/PlanStorageAdapter.test.ts packages/testing/src/fakes/FakeRegimePlanPort.ts packages/testing/src/fakes/FakePlanRepository.ts packages/testing/src/scenarios/PositionPlanLifecycle.test.ts
```

Expected: the request validates against the vendored schema, unsafe portfolio/config inputs cause no fetch, and stored/request-returned identity exactly matches upstream.

## Task 4: Prove execution-result correlation against the upstream contract

**Files:**

- Modify: `packages/application/src/ports/index.ts`
- Modify: `packages/application/src/use-cases/plans/SyncPlanExecutionResults.ts`
- Modify: `packages/application/src/use-cases/plans/SyncPlanExecutionResults.test.ts`
- Modify: `packages/application/src/dto/regimePlan.ts`
- Modify: `packages/application/src/dto/regimePlanValidator.ts`
- Modify: `packages/application/src/dto/regimePlanValidator.test.ts`
- Modify: `packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts`
- Modify: `packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts`
- Modify: `packages/testing/src/fakes/FakeRegimePlanPort.ts`
- Modify: `packages/testing/src/scenarios/PositionPlanLifecycle.test.ts`
- Read only: `schemas/regime-engine/execution-result.v1/schema.json`
- Read only: `schemas/regime-engine/execution-result.v1/fixtures/valid/success.json`
- Read only: `schemas/regime-engine/execution-result.v1/fixtures/valid/skipped.json`

- [ ] Add tests first named `reports the persisted remote planId and planHash unchanged`, `validates the built result before transport`, `preserves remote identity across retries`, and `fails the outbox row permanently when the persisted payload cannot form a canonical result`.
- [ ] Build the result from persisted `PlanResultClaim` data only. Require `canonicalHash`, `positionId`, decision kind, and stored action kind; do not substitute empty strings or default a missing decision to `executed`.
- [ ] Validate with `parseRegimeExecutionResult` before calling the port. A malformed persisted payload is a permanent local rejection recorded through `failDelivery`, not a retryable network outcome.
- [ ] Align `schemaVersion`, status, and reason-code mapping to the refreshed vendored contract. Preserve the existing retry loop, cap, idempotency key, and continue-after-one-row behavior.
- [ ] Add an adapter-side preflight guard so a direct invalid `reportExecutionResult` call returns `permanent: schema-invalid` without fetch.
- [ ] Update `FakeRegimePlanPort` and `PositionPlanLifecycle.test.ts` to construct, mock, and assert `RegimeExecutionResult` using the reconciled schema version and payload shape.
- [ ] Commit as `fix(plans): preserve execution result correlation identity`.

**Behavioral invariants and named tests:**

- Valid persisted result + transport OK -> complete delivery once: `reports the persisted remote planId and planHash unchanged`.
- Retryable transport failure + attempt below cap -> reschedule with the same plan identity and idempotency key: `preserves remote identity across retries`.
- Invalid persisted result -> mark permanent failure and continue claiming later rows: `fails the outbox row permanently when the persisted payload cannot form a canonical result`.
- One permanently rejected row does not stop the do/while sweep: retain `processes multiple due results even if one fails permanently`.

**Acceptance and scoped verification:**

```bash
pnpm --filter @clmm/application exec vitest run src/use-cases/plans/SyncPlanExecutionResults.test.ts src/dto/regimePlanValidator.test.ts
pnpm --filter @clmm/adapters exec vitest run src/outbound/regime-engine/RegimePlanAdapter.test.ts
pnpm --filter @clmm/testing exec vitest run src/scenarios/PositionPlanLifecycle.test.ts
pnpm --filter @clmm/application exec eslint src/use-cases/plans/SyncPlanExecutionResults.ts src/use-cases/plans/SyncPlanExecutionResults.test.ts src/dto/regimePlan.ts src/dto/regimePlanValidator.ts src/dto/regimePlanValidator.test.ts --ext .ts
pnpm --filter @clmm/adapters exec eslint src/outbound/regime-engine/RegimePlanAdapter.ts src/outbound/regime-engine/RegimePlanAdapter.test.ts --ext .ts
pnpm --filter @clmm/testing exec eslint src/fakes/FakeRegimePlanPort.ts src/scenarios/PositionPlanLifecycle.test.ts --ext .ts
git diff --check -- packages/application/src/ports/index.ts packages/application/src/use-cases/plans/SyncPlanExecutionResults.ts packages/application/src/use-cases/plans/SyncPlanExecutionResults.test.ts packages/application/src/dto/regimePlan.ts packages/application/src/dto/regimePlanValidator.ts packages/application/src/dto/regimePlanValidator.test.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts packages/testing/src/fakes/FakeRegimePlanPort.ts packages/testing/src/scenarios/PositionPlanLifecycle.test.ts
```

## Task 5: Add an atomic per-position request lease and refresh state

**Files:**

- Modify: `packages/application/src/ports/index.ts`
- Create: `packages/adapters/src/outbound/storage/schema/position-plan-request-state.ts`
- Modify: `packages/adapters/src/outbound/storage/schema/index.ts`
- Modify: `packages/adapters/src/outbound/storage/PlanStorageAdapter.ts`
- Modify: `packages/adapters/src/outbound/storage/PlanStorageAdapter.test.ts`
- Modify: `packages/testing/src/fakes/FakePlanRepository.ts`
- Modify: `packages/application/src/use-cases/plans/RequestPositionPlan.test.ts`
- Modify: `packages/application/src/use-cases/plans/RecordPlanDecision.test.ts`
- Create: `packages/adapters/drizzle/0005_position_plan_request_state.sql`
- Modify: `packages/adapters/drizzle/meta/_journal.json`
- Create: `packages/adapters/drizzle/meta/0005_snapshot.json`
- Modify: `packages/adapters/src/outbound/storage/schema/__tests__/schema-snapshot.test.ts`

- [ ] Add `position_plan_request_state` keyed by `position_id` with `lease_token`, `lease_until`, `last_attempt_at`, `last_range_state`, `last_breach_qualified_at`, `last_closed_candle_at`, and `updated_at`. Add checks for valid range-state values and non-negative timestamps.
- [ ] Extend `PlanRepository` with `claimPlanRequest(params)` and `finishPlanRequest(params)`. `claimPlanRequest` returns `claimed` with an opaque lease token or `suppressed` with one of `active-request | minimum-interval`; `finishPlanRequest` requires the matching token and records `succeeded | failed` while clearing the lease.
- [ ] Implement both new methods in `PlanStorageAdapter`, the shared `FakePlanRepository`, and the concrete `PlanRepository` fakes in `RequestPositionPlan.test.ts` and `RecordPlanDecision.test.ts` in this same task. Use one PostgreSQL transaction with row locking/upsert so two worker processes cannot both claim the same position.
- [ ] Write tests first named `claims the first request for a position`, `suppresses a concurrent request while the lease is active`, `claims independent positions concurrently`, `reclaims an expired lease`, `bypasses interval on range-state change`, `bypasses interval when a breach becomes qualified`, `bypasses interval for a different qualified breach`, `bypasses interval for a newly closed candle`, `suppresses an unchanged observation inside the interval`, `retains lastAttemptAt after failed completion`, and `rejects completion with a stale lease token`.
- [ ] Generate and inspect the Drizzle snapshot so the existing schema-snapshot guard sees the new table. The SQL migration must create only this table, its checks, and the lease/due indexes; it must not rewrite earlier migrations.
- [ ] Commit as `feat(storage): add plan request cadence lease`.

**Behavioral invariants and named tests:**

- No row -> `claimed`; unexpired lease -> `suppressed: active-request`; expired lease -> `claimed` with a new token.
- Same state inside 15 minutes -> `suppressed: minimum-interval`.
- Different range state, newly qualified/different breach timestamp, or newer closed candle -> `claimed` even inside the interval, unless another lease is active.
- `finishPlanRequest` with the current token -> lease cleared and outcome recorded; stale token -> no mutation.

**Acceptance and scoped verification:**

```bash
pnpm --filter @clmm/adapters exec vitest run src/outbound/storage/PlanStorageAdapter.test.ts src/outbound/storage/schema/__tests__/schema-snapshot.test.ts
pnpm --filter @clmm/application exec vitest run src/use-cases/plans/RequestPositionPlan.test.ts src/use-cases/plans/RecordPlanDecision.test.ts
pnpm --filter @clmm/adapters exec eslint src/outbound/storage/schema/position-plan-request-state.ts src/outbound/storage/schema/index.ts src/outbound/storage/PlanStorageAdapter.ts src/outbound/storage/PlanStorageAdapter.test.ts src/outbound/storage/schema/__tests__/schema-snapshot.test.ts --ext .ts
pnpm --filter @clmm/testing exec eslint src/fakes/FakePlanRepository.ts --ext .ts
git diff --check -- packages/application/src/ports/index.ts packages/application/src/use-cases/plans/RequestPositionPlan.test.ts packages/application/src/use-cases/plans/RecordPlanDecision.test.ts packages/adapters/src/outbound/storage/schema/position-plan-request-state.ts packages/adapters/src/outbound/storage/schema/index.ts packages/adapters/src/outbound/storage/PlanStorageAdapter.ts packages/adapters/src/outbound/storage/PlanStorageAdapter.test.ts packages/adapters/src/outbound/storage/schema/__tests__/schema-snapshot.test.ts packages/adapters/drizzle/0005_position_plan_request_state.sql packages/adapters/drizzle/meta/_journal.json packages/adapters/drizzle/meta/0005_snapshot.json packages/testing/src/fakes/FakePlanRepository.ts
```

Expected: the storage and fake implementations satisfy the same lease transitions, and the latest Drizzle snapshot contains `position_plan_request_state`.

## Task 6: Enforce cadence in the plan-request application use case

**Files:**

- Modify: `packages/application/src/use-cases/plans/RequestPositionPlan.ts`
- Modify: `packages/application/src/use-cases/plans/RequestPositionPlan.test.ts`
- Modify: `packages/adapters/src/inbound/http/PlanController.ts`
- Modify: `packages/adapters/src/inbound/http/PlanController.test.ts`
- Modify: `packages/testing/src/scenarios/PositionPlanLifecycle.test.ts`

- [ ] Extend `PositionPlanRequestResult` with `status: "throttled"` and reason `active-request | minimum-interval`.
- [ ] After ownership and staleness checks but before portfolio/history/config building or transport, calculate the current range state, qualified-breach timestamp, and last closed candle; call `claimPlanRequest` with the 15-minute interval and two-minute lease.
- [ ] If suppressed, return the typed throttled result without transport. If claimed, wrap all remaining work in `try/finally` and call `finishPlanRequest` exactly once with `succeeded` only after a validated response is persisted; all unavailable, conflict, permanent, retryable, thrown, and superseded-after-transport paths finish as `failed` unless the response was accepted.
- [ ] Do not acquire a lease for stale or missing positions. Do not let lease cleanup replace the original result or error; cleanup failures are logged with position and lease token and rethrown only when no earlier failure exists.
- [ ] Update `PlanController` response typing and status behavior so a manual request receives the typed throttled envelope instead of a 409. Update every direct use-case caller in the testing scenario in this same task.
- [ ] Write the exact named tests from Behavioral Invariants 6–9 before implementation, plus `qualified breach still supersedes an accepted advisory without bypassing lease completion`.
- [ ] Commit as `feat(plans): throttle position plan requests`.

**Acceptance and scoped verification:**

```bash
pnpm --filter @clmm/application exec vitest run src/use-cases/plans/RequestPositionPlan.test.ts
pnpm --filter @clmm/adapters exec vitest run src/inbound/http/PlanController.test.ts
pnpm --filter @clmm/testing exec vitest run src/scenarios/PositionPlanLifecycle.test.ts
pnpm --filter @clmm/application exec eslint src/use-cases/plans/RequestPositionPlan.ts src/use-cases/plans/RequestPositionPlan.test.ts --ext .ts
pnpm --filter @clmm/adapters exec eslint src/inbound/http/PlanController.ts src/inbound/http/PlanController.test.ts --ext .ts
git diff --check -- packages/application/src/use-cases/plans/RequestPositionPlan.ts packages/application/src/use-cases/plans/RequestPositionPlan.test.ts packages/adapters/src/inbound/http/PlanController.ts packages/adapters/src/inbound/http/PlanController.test.ts packages/testing/src/scenarios/PositionPlanLifecycle.test.ts
```

## Task 7: Enqueue and process plan requests after successful position scans

**Files:**

- Modify: `packages/application/src/use-cases/triggers/ScanPositionsForBreaches.ts`
- Modify: `packages/application/src/use-cases/triggers/ScanPositionsForBreaches.test.ts`
- Modify: `packages/adapters/src/inbound/jobs/BreachScanJobHandler.ts`
- Modify: `packages/adapters/src/inbound/jobs/BreachScanJobHandler.test.ts`
- Create: `packages/adapters/src/inbound/jobs/PositionPlanRequestJobHandler.ts`
- Create: `packages/adapters/src/inbound/jobs/PositionPlanRequestJobHandler.test.ts`
- Modify: `packages/adapters/src/inbound/jobs/WorkerModule.ts`
- Modify: `packages/adapters/src/inbound/jobs/WorkerModule.test.ts`
- Modify: `packages/adapters/src/inbound/jobs/WorkerLifecycle.ts`
- Modify: `packages/adapters/src/inbound/jobs/WorkerLifecycle.test.ts`

- [ ] Extend `ScanResult` with `observedPositions`, containing the position IDs from the one successful `listSupportedPositions` snapshot. Test that both in-range and out-of-range open supported positions appear, while a failed wallet scan returns no jobs.
- [ ] After all qualification and abandonment work for a wallet is enqueued/processed, enqueue `request-position-plan` for each observed position with only `walletId` and `positionId`. Catch and log plan-job enqueue failures per position; do not fail or delay already completed breach work or `markScanned`.
- [ ] Create `PositionPlanRequestJobHandler` that injects the existing position, trigger, plan, regime, history, clock, observability, and request-config dependencies and calls `requestPositionPlan`. Log the typed terminal status without throwing for expected `throttled`, `stale`, `unavailable`, `degraded`, `conflict`, or `superseded` results; rethrow unexpected exceptions so pg-boss retry plus the durable lease recovery path applies.
- [ ] Register/create/work the new queue in `WorkerModule` and `WorkerLifecycle`. It is event-enqueued by the existing five-minute breach scan and must not receive a second cron schedule.
- [ ] Add tests named `enqueues one plan request for every successfully observed open position`, `enqueues in-range positions even when no trigger job exists`, `plan enqueue failure does not suppress trigger qualification`, `handler passes wallet and position to RequestPositionPlan`, `handler treats typed degradation as a completed job`, `handler rethrows unexpected errors for pg-boss retry`, and `worker registers request-position-plan without scheduling a second cron`.
- [ ] Commit as `feat(worker): request plans after position observations`.

**Behavioral invariants and named tests:**

- Successful snapshot with N open supported positions -> N plan jobs, independent of breach count.
- Snapshot failure -> zero plan jobs for that wallet, log, continue other wallets.
- Trigger/abandonment path completes before plan enqueue; plan enqueue failure never retracts those effects.
- Expected application outcome -> job completes; unexpected throw -> job fails for pg-boss retry.

**Acceptance and scoped verification:**

```bash
pnpm --filter @clmm/application exec vitest run src/use-cases/triggers/ScanPositionsForBreaches.test.ts
pnpm --filter @clmm/adapters exec vitest run src/inbound/jobs/BreachScanJobHandler.test.ts src/inbound/jobs/PositionPlanRequestJobHandler.test.ts src/inbound/jobs/WorkerModule.test.ts src/inbound/jobs/WorkerLifecycle.test.ts
pnpm --filter @clmm/application exec eslint src/use-cases/triggers/ScanPositionsForBreaches.ts src/use-cases/triggers/ScanPositionsForBreaches.test.ts --ext .ts
pnpm --filter @clmm/adapters exec eslint src/inbound/jobs/BreachScanJobHandler.ts src/inbound/jobs/BreachScanJobHandler.test.ts src/inbound/jobs/PositionPlanRequestJobHandler.ts src/inbound/jobs/PositionPlanRequestJobHandler.test.ts src/inbound/jobs/WorkerModule.ts src/inbound/jobs/WorkerModule.test.ts src/inbound/jobs/WorkerLifecycle.ts src/inbound/jobs/WorkerLifecycle.test.ts --ext .ts
git diff --check -- packages/application/src/use-cases/triggers/ScanPositionsForBreaches.ts packages/application/src/use-cases/triggers/ScanPositionsForBreaches.test.ts packages/adapters/src/inbound/jobs/BreachScanJobHandler.ts packages/adapters/src/inbound/jobs/BreachScanJobHandler.test.ts packages/adapters/src/inbound/jobs/PositionPlanRequestJobHandler.ts packages/adapters/src/inbound/jobs/PositionPlanRequestJobHandler.test.ts packages/adapters/src/inbound/jobs/WorkerModule.ts packages/adapters/src/inbound/jobs/WorkerModule.test.ts packages/adapters/src/inbound/jobs/WorkerLifecycle.ts packages/adapters/src/inbound/jobs/WorkerLifecycle.test.ts
```

## Tests to add or update

- Contract fixtures: canonical plan request valid/invalid coverage and shared provenance commit.
- Request builder: token-order-independent portfolio math, authoritative autopilot derivation, config validation, and fail-closed incomplete state.
- Request use case: stale suppression, full request shape, upstream identity preservation, exact replay, conflicts, qualified-breach precedence, lease acquisition/suppression/recovery, and failure throttling.
- Transport adapter: corrected `/v1/plan` URL, shared-secret header, strict response/result validation, and existing failure classifications.
- Storage: atomic first/concurrent/expired lease behavior, signal bypasses, stale-token completion, migration/schema snapshot.
- Execution result sweep: unchanged remote identity and idempotency across restart/retry, invalid persisted payload rejection, and continue-after-failure.
- Background jobs: every open observed position enqueued, non-blocking relationship to breach work, typed outcomes, retry on unexpected exceptions, and queue registration without another cron.
- Existing test files over 500 lines are changed only inside implementation-bearing tasks whose primary purpose is production behavior. No standalone oversized test-update task is planned.

## Validation commands

Run each task's focused commands as its acceptance criteria. After all implementation tasks complete, the dedicated validation phase runs the repository-required broad gates:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
```

Before production rollout, verify the cross-repo/deployment prerequisites and live correlation:

```bash
railway logs --service clmm-worker --environment production --json
railway logs --service regime-engine --environment production --json
```

The operator must observe, for one known open position, a worker plan-job completion and a corresponding authenticated `/v1/plan` 200 entry with the same position ID, then complete a safe signed test flow and confirm `/v1/execution-result` carries the exact returned `planId` and `planHash`. A request without `X-CLMM-Internal-Token` must receive 401 or 403. Logs must be inspected without printing the token or portfolio values into the plan/PR.

## Risk areas

- **Financial-state fabrication:** Principal inventory, token orientation, or autopilot counters can be wrong while still type-correct. The builder must reject ambiguity and use canonical token identity plus finite-number checks.
- **Upstream contract drift:** The local response schema is already vendored, but the request schema is absent. Contract publication and a single pinned commit are release blockers.
- **Cross-repo partial rollout:** Deploying CLMM requests before upstream auth/contract support yields 400/401/404 traffic; deploying upstream auth with mismatched secrets yields permanent failures. Deploy upstream first, verify auth, then enable CLMM worker config.
- **Lease deadlock or request spam:** A permanent lease can halt planning; clearing all state on failure can spam it. Lease expiry plus retained `lastAttemptAt` provides bounded recovery.
- **Signal consumption races:** Range change, breach qualification, and candle closure may occur while another request is active. The state row must compare incoming markers atomically and the next observation must still see any marker newer than the last completed/attempted claim.
- **Current-plan lookup:** `getCurrentPlan` currently does not explicitly order multiple rows. Identity work must ensure tests cover the newest plan selection before automated refresh can create multiple plans for one position; if this requires a repository query correction, include it in Task 3's `PlanStorageAdapter` scope before proceeding.
- **Result audit-trail corruption:** Empty-string fallbacks currently permit malformed correlation. Task 4 makes missing identity a permanent local failure rather than emitting a misleading result.
- **Breach latency:** Network calls must stay in the separate plan job. Never await `regime-engine` from `BreachScanJobHandler` or `ScanPositionsForBreaches`.
- **Large existing tests:** `RequestPositionPlan.test.ts`, `RegimePlanAdapter.test.ts`, `PlanStorageAdapter.test.ts`, and `PositionPlanLifecycle.test.ts` are large. Keep additions within the named behavior groups and avoid unrelated rewrites.

## Stop conditions

Abort the affected task instead of guessing or broadening scope when any of these occurs:

- `regime-engine` does not publish a canonical `contracts/plan-request/v1/` schema and fixtures, or the published contract cannot represent the issue's required portfolio/autopilot/config data.
- The refreshed upstream execution-result schema disagrees with the deployed `/v1/execution-result` handler. Resolve that in `regime-engine` before changing CLMM's payload to one side arbitrarily.
- Upstream cannot enforce `X-CLMM-Internal-Token` before automated CLMM traffic is enabled.
- `portfolio`, `autopilotState`, or config semantics require data CLMM V2 does not own (for example wallet-wide balances or redeploy history). Add an explicit upstream/local source-of-truth decision; do not substitute zeros except for schema-documented neutral values and the explicitly unsupported redeploy count.
- Persisting upstream `planId` or 64-hex `planHash` requires destructive conversion of existing rows. Stop and design a reviewed migration/backfill rather than rewriting identities in place.
- Atomic one-active-request behavior cannot be implemented with the existing PostgreSQL transaction boundary or would require an in-memory mutex. The guarantee must survive multiple workers and restarts.
- The proposed plan job adds latency to breach qualification, signature, submission, or reconciliation paths. Restore queue isolation before continuing.
- Any implementation starts mapping lower/upper breach direction to swap assets outside `packages/domain/src/exit-policy/DirectionalExitPolicyService`.
- Production validation access, a known safe open position, or correlated logs are unavailable. Local checks may pass, but the acceptance criterion remains unverified and the rollout must not be called complete.

## Plan risk classification

This plan contains an explicit lease/recovery state machine, retry paths, PostgreSQL writes, outbound authenticated API calls, and a production rollout dependency. The first-line `<!-- plan-review-required -->` marker is therefore required.

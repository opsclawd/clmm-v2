# Task Context: Task 3

Title: Build a contract-valid request and persist upstream identity

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

## Repository Targets

### Expected Files

- packages/application/src/dto/regimePlan.ts
- packages/application/src/dto/regimePlanValidator.ts
- packages/application/src/dto/regimePlanValidator.test.ts
- packages/application/src/dto/regimePlanContract.test.ts
- packages/application/src/ports/index.ts
- packages/application/src/use-cases/plans/buildRegimePlanRequest.ts
- packages/application/src/use-cases/plans/buildRegimePlanRequest.test.ts
- packages/application/src/use-cases/plans/RequestPositionPlan.ts
- packages/application/src/use-cases/plans/RequestPositionPlan.test.ts
- packages/adapters/src/composition/RegimePlanRequestConfig.ts
- packages/adapters/src/composition/RegimePlanRequestConfig.test.ts
- packages/adapters/src/composition/AdaptersModule.ts
- packages/adapters/src/inbound/http/tokens.ts
- packages/adapters/src/inbound/http/AppModule.ts
- packages/adapters/src/inbound/http/PlanController.ts
- packages/adapters/src/inbound/http/PlanController.test.ts
- packages/adapters/src/inbound/jobs/tokens.ts
- packages/adapters/src/inbound/jobs/WorkerModule.ts
- packages/adapters/src/inbound/jobs/WorkerModule.test.ts
- packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts
- packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts
- packages/adapters/src/outbound/storage/PlanStorageAdapter.ts
- packages/adapters/src/outbound/storage/PlanStorageAdapter.test.ts
- packages/testing/src/fakes/FakeRegimePlanPort.ts
- packages/testing/src/fakes/FakePlanRepository.ts
- packages/testing/src/scenarios/PositionPlanLifecycle.test.ts

### Reference Files

- schemas/regime-engine/plan-request.v1/schema.json
- schemas/regime-engine/plan-request.v1/fixtures/valid/in-range.json
- schemas/regime-engine/plan-request.v1/fixtures/valid/breach-qualified.json
- packages/domain/src/positions/index.ts
- packages/domain/src/history/index.ts
- packages/domain/src/exit-policy/DirectionalExitPolicyService.ts
- packages/application/src/dto/index.ts
- packages/application/src/public/index.ts

## Validation Commands

```bash
pnpm --filter @clmm/application exec vitest run src/dto/regimePlanValidator.test.ts src/dto/regimePlanContract.test.ts src/use-cases/plans/buildRegimePlanRequest.test.ts src/use-cases/plans/RequestPositionPlan.test.ts
pnpm --filter @clmm/adapters exec vitest run src/composition/RegimePlanRequestConfig.test.ts src/outbound/regime-engine/RegimePlanAdapter.test.ts src/inbound/http/PlanController.test.ts src/inbound/jobs/WorkerModule.test.ts src/outbound/storage/PlanStorageAdapter.test.ts
pnpm --filter @clmm/testing exec vitest run src/scenarios/PositionPlanLifecycle.test.ts
git diff --check -- packages/application/src/dto/regimePlan.ts packages/application/src/dto/regimePlanValidator.ts packages/application/src/dto/regimePlanValidator.test.ts packages/application/src/dto/regimePlanContract.test.ts packages/application/src/ports/index.ts packages/application/src/use-cases/plans/buildRegimePlanRequest.ts packages/application/src/use-cases/plans/buildRegimePlanRequest.test.ts packages/application/src/use-cases/plans/RequestPositionPlan.ts packages/application/src/use-cases/plans/RequestPositionPlan.test.ts packages/adapters/src/composition/RegimePlanRequestConfig.ts packages/adapters/src/composition/RegimePlanRequestConfig.test.ts packages/adapters/src/composition/AdaptersModule.ts packages/adapters/src/inbound/http/tokens.ts packages/adapters/src/inbound/http/AppModule.ts packages/adapters/src/inbound/http/PlanController.ts packages/adapters/src/inbound/http/PlanController.test.ts packages/adapters/src/inbound/jobs/tokens.ts packages/adapters/src/inbound/jobs/WorkerModule.ts packages/adapters/src/inbound/jobs/WorkerModule.test.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts packages/adapters/src/outbound/storage/PlanStorageAdapter.ts packages/adapters/src/outbound/storage/PlanStorageAdapter.test.ts packages/testing/src/fakes/FakeRegimePlanPort.ts packages/testing/src/fakes/FakePlanRepository.ts packages/testing/src/scenarios/PositionPlanLifecycle.test.ts
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **portfolio-token-order-independence**: SOL and USDC units are derived by canonical token identity, not token A/B order. (Test: `maps SOL and USDC principal units regardless of pool token order`)
- **portfolio-fail-closed**: Missing principal inventory, ambiguous token identity, decimals, or non-finite arithmetic prevents transport. (Test: `rejects missing principal inventory`)
- **remote-plan-identity**: The accepted local plan uses response.planId and response.planHash unchanged and never an ID generator value. (Test: `persists response planId and planHash unchanged`)
- **qualified-breach-precedence**: A qualified breach supersedes advisory output without introducing a second direction-to-posture mapping. (Test: `qualified upper breach remains authoritative over an accepted hold plan`)
- **latest-plan-selection**: When multiple plans exist for a position, getCurrentPlan returns the greatest requestedAt with planId as tie-breaker. (Test: `returns the newest plan for a position deterministically`)

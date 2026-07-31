# Reconcile /v1/plan integration: wrong endpoint, wrong contract, no auto-invocation, discarded plan identity

## Correction

The original version of this issue was wrong to frame this as "investigate whether an integration exists." It already substantially exists — I missed it in the first pass by only grepping for "regime-engine"/"policyinsight"/"railway.app", not "plan". Confirmed on `origin/main`:

- `packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts` implements `RegimePlanPort`
- `packages/application/src/use-cases/plans/RequestPositionPlan.ts`
- `packages/application/src/use-cases/plans/SyncPlanExecutionResults.ts`
- `packages/adapters/src/inbound/http/PlanController.ts` — a BFF route `POST /plans/:walletId/:positionId/request`
- `packages/adapters/src/inbound/jobs/PlanResultSweepHandler.ts`
- `schemas/regime-engine/position-plan.v1/` — a full local contract with fixtures

**But nothing calls the BFF route.** It only exists to be invoked (by the app, on a schedule, or otherwise) and currently isn't. That's why `regime-engine` has zero recorded `/v1/plan` (or in this case `/v1/position-plan`) requests ever, per a 30-day production log search.

The real task is reconciliation and automated invocation, not building from scratch.

## Verified, real defects (not hypothetical)

**1. Endpoint mismatch — first real call would 404.**
`RegimePlanAdapter.ts`: `new URL(\`${baseUrl}/v1/position-plan\`)`. `regime-engine`'s `routes.ts`registers`app.post("/v1/plan", ...)`. Different paths.

**2. Contract mismatch — even at the right URL, this would fail schema validation.**
`clmm-v2`'s `RegimePlanRequest` (`packages/application/src/dto/regimePlan.ts`): `schemaVersion: 'position-plan.v1'`, body is just `market` + `position`.
`regime-engine`'s actual `PlanRequest` (`src/contract/v1/types.ts`): requires `schemaVersion`, `market`, `position`, **`portfolio` (navUsd/solUnits/usdcUnits)**, **`autopilotState` (activeClmm/stopouts24h/redeploys24h/cooldownUntilUnixMs/standDownUntilUnixMs/strikeCount)**, optional `regimeState`, and **`config`**. None of the portfolio/autopilotState/config fields exist in `clmm-v2`'s request today.

Response shapes differ too — `clmm-v2`'s local `RegimePlanRequest`/response types need to be reconciled against `regime-engine`'s actual `PlanResponse`, not assumed compatible.

**3. `/v1/plan` has no authentication on the `regime-engine` side**, despite `RegimePlanAdapter` already sending `X-CLMM-Internal-Token`. Confirmed: `evidenceIngest.ts` calls `requireSharedSecret(request.headers, "X-Evidence-Ingest-Token", "EVIDENCE_INGEST_TOKEN")`; `plan.ts` has no equivalent call anywhere. This is a live, unauthenticated, position/portfolio-data-accepting production endpoint. File/fix on the `regime-engine` side as part of this reconciliation.

**4. Plan identity appears to be discarded rather than preserved** — needs verification during implementation, but the pattern to check for: does `clmm-v2` persist `regime-engine`'s returned `PlanResponse.planId`/`planHash` as the authoritative remote identity, or does it generate a new local plan ID / locally-computed hash instead? If the latter, execution-result reporting and plan-ledger lookups on the `regime-engine` side will never correlate correctly. Preserve `planId`/`planHash` unchanged; a separate local lifecycle ID can coexist but must not replace them.

**5. Execution-result contract likely has the same class of mismatch** as the plan contract — check `SyncPlanExecutionResults.ts` / the execution-result client against `regime-engine`'s actual `POST /v1/execution-result` (schema `"1.0"`) before assuming compatibility. If it's also mismatched, file as a companion issue rather than silently shipping plan submission with a broken result-reporting leg — that produces a half-working audit trail that's worse than not having one, because it looks complete.

**6. Market feed selector needs to match what `regime-engine` actually ingests**, not the name of whichever service produced the position snapshot — verify the `source`/`network` values sent match what `geckoCollector.ts` stores candles under (`geckoterminal`/`solana` per `regime-engine` #79), not e.g. `clmm`.

## Scope

1. Reconcile the request/response contract against `regime-engine`'s real `/v1/plan` (source of truth — position-scoped synthesis in `regime-engine` #79 already consumes those exact `PlanRequest`/`PlanResponse` types). Define where `portfolio`, `autopilotState`, and `config` values come from in `clmm-v2`.
2. Fix the endpoint path.
3. Wire `RequestPositionPlan` into a real background cadence — not only-on-screen-open. Suggested: after a successful position observation, one active request per position, a minimum refresh interval, immediate refresh on range-state change or a qualified breach, refresh on a new closed market candle, no delay introduced to breach qualification or execution safety, suppressed when the position snapshot is stale. Note: the request fingerprint includes `observedAtUnixMs`, so every observation currently produces a "different" plan request even with nothing material changed — throttle explicitly rather than let this drive request volume.
4. Preserve `regime-engine`'s `planId`/`planHash` as the authoritative remote identity end-to-end.
5. Verify (and if needed, fix as a companion issue) the execution-result reporting leg's contract compatibility.
6. Add auth (`requireSharedSecret`-equivalent) to `regime-engine`'s `/v1/plan` handler, matching the token `RegimePlanAdapter` already sends.

## Acceptance criteria

- `clmm-v2` calls the correctly-pathed, correctly-shaped `/v1/plan` for open positions on a real background cadence, verified live against production `regime-engine` logs (not just unit tests).
- The endpoint requires and validates the internal token.
- `regime-engine`'s returned `planId`/`planHash` are persisted unchanged and used, unmodified, in subsequent execution-result reporting.
- Execution-result reporting is confirmed contract-compatible (or fixed as part of this work).

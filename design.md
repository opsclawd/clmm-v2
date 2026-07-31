# Design Document: Reconcile /v1/plan Integration

## The Problem and Why It Matters

The CLMM V2 exit assistant requires an automated integration with the `regime-engine` to request position plans and report execution results. Currently, the integration is fundamentally broken due to several mismatches:

- The endpoint path is incorrect (`/v1/position-plan` instead of `/v1/plan`).
- The request contract is mismatched (missing `portfolio`, `autopilotState`, and `config` fields).
- The `regime-engine`'s `/v1/plan` endpoint lacks authentication.
- The authoritative `planId` and `planHash` from `regime-engine` are discarded in favor of locally generated IDs.
- The `RequestPositionPlan` use case is not invoked on an automated background cadence.

Without fixing these defects, the application cannot successfully request automated exit plans or report their results, rendering the core non-custodial LP exit assistant non-functional and resulting in 404s, schema validation errors, or a corrupted audit trail.

## Key Design Decisions and Trade-offs

1. **Contract Reconciliation for Missing Fields:**
   - _Trade-off:_ We need to provide `portfolio`, `autopilotState`, and `config` to `regime-engine`. Deriving these locally requires extending the local domain models and read ports. Hardcoding or mocking them is dangerous for a financial application.
   - _Decision:_ We will extend the `RegimePlanRequest` DTO and the `RequestPositionPlan` use case to populate these fields correctly using the existing `PositionDetail` and trigger repository state.

2. **Preserving Plan Identity:**
   - _Trade-off:_ `RequestPositionPlan` currently generates a local `planId`. Using the remote `planId` requires ensuring it conforms to local storage constraints and doesn't break optimistic UI assumptions.
   - _Decision:_ We will use `response.planId` and `response.planHash` returned by `regime-engine` as the authoritative identifiers end-to-end, removing the local `idGenerator.generateId()` call for plans.

3. **Background Invocation Cadence:**
   - _Trade-off:_ Polling on a strict timer (cron) can lead to unnecessary API calls, while purely event-driven invocation can spam the endpoint if observations are frequent.
   - _Decision:_ We will trigger `RequestPositionPlan` reactively after a successful position observation, but implement explicit throttling (e.g., minimum refresh interval), bypassing the throttle only on range-state changes or qualified breaches.

## Proposed Approach and Rationale

1. **Contract Updates:**
   - Update `packages/application/src/dto/regimePlan.ts` to include the missing fields (`portfolio`, `autopilotState`, `config`) required by `regime-engine`'s actual `PlanRequest`.
   - Update the `market.source` from `'clmm'` to `'geckoterminal'` or `'solana'` to match `regime-engine`'s ingestion format.
2. **Endpoint and Auth Fixes:**
   - Fix the endpoint path in `RegimePlanAdapter.ts` to `/v1/plan`.
   - The adapter already sends `X-CLMM-Internal-Token`. We will file a companion PR/issue in `regime-engine` to enforce `requireSharedSecret` for this token on the backend.
3. **Identity Preservation:**
   - Modify `RequestPositionPlan.ts` to extract and store `response.planId` and `response.planHash` instead of generating local ones.
   - Ensure `SyncPlanExecutionResults.ts` accurately maps these values back to `regime-engine`'s `execution-result.v1` schema.
4. **Invocation Cadence:**
   - Introduce a throttled background task or event listener that observes position updates and conditionally calls `RequestPositionPlan`.

## Assumptions

- We assume that `portfolio`, `autopilotState`, and `config` data can be accurately derived from the existing `positionReadPort` and `triggerRepository` without requiring new external APIs.
- We assume that the `planId` string format returned by `regime-engine` is compatible with the local database schema for `PlanId`.
- We assume that adding authentication to the `regime-engine` is handled in the `opsclawd/regime-engine` repository, but tracked as part of this epic's completion criteria.

## Scope

- **In Scope:** Modifying `clmm-v2` application DTOs, `RegimePlanAdapter`, `RequestPositionPlan` use case, and `SyncPlanExecutionResults` use case. Setting up the throttled background cadence for plan requests. Fixing the `market.source` value.
- **Out of Scope:** Making direct changes to `regime-engine` backend code within this repository (companion issue required). Modifying the core directional mapping logic (`DirectionalExitPolicyService`). Building UI screens.

## Risks and Concerns Identified

- **Execution Result Schema Match:** While fixing `position-plan.v1`, we must verify `execution-result.v1` in `SyncPlanExecutionResults.ts` maps `decisionKind` correctly to `status` and `reasonCode` expected by `regime-engine`. Any mismatch here will silently corrupt the audit trail.
- **Throttling Edge Cases:** The request fingerprint currently includes `observedAtUnixMs`, meaning it changes on every observation. We must ensure the new throttling logic doesn't rely solely on fingerprint changes, otherwise it will still spam the endpoint.

# Regime Position Plan Integration Design

## The problem being solved and why it matters

Currently, `clmm-v2` reads general pool/pair-level market context from Regime Engine and asynchronously posts execution results for deterministic breaches. However, Regime Engine provides advisory, position-aware plan recommendations. We need to integrate a position-scoped plan request (`POST /v1/plan`) and an execution result reporting loop (`POST /v1/execution-result`) into `clmm-v2` without compromising clmm-v2's execution authority, deterministic safety, and wallet signing loops. It matters because it enables smarter position-level advice (like `HOLD`, `STAND_DOWN`, or `REQUEST_EXIT_CLMM`) based on market regimes without turning over full custody or execution authority to an automated system.

## Key design decisions and trade-offs considered

- **Execution Authority**: Regime Engine will never have the authority to bypass user signature or deterministic safety checks. The trade-off is reduced automation for higher safety and strict adherence to the non-custodial model.
- **Fail Closed vs Degraded Advisory**: If Regime Engine fails or returns malformed data, `clmm-v2` will gracefully degrade the advisory feature but will _not_ disable local deterministic breach monitoring. This ensures stop-loss features remain robust against upstream availability issues.
- **State Persistence for Audit and Recovery**: We will persist plan state locally. This requires additional storage mechanisms (e.g., `PlanRepository`) but is necessary for accurate execution result reporting, idempotency, and crash recovery.
- **Action Scope Limitations**: We will explicitly drop support for `REQUEST_ENTER_CLMM` and `REQUEST_REBALANCE` for now, because `clmm-v2` lacks the execution infrastructure for opening or restructuring positions. The trade-off is reduced capability out-of-the-gate, but it prevents the UI from generating commands the execution layer cannot honestly fulfill.

## Proposed approach with rationale

1. **Contract Pinning & Vendoring**: Before implementation, vendored schemas for `plan.v1` and `execution-result.v1` will be synced into `schemas/regime-engine/`.
2. **Domain Layer Expansion**: Add `PlanAction` (`HOLD`, `STAND_DOWN`, `REQUEST_EXIT_CLMM`) and `PlanLifecycleState` to `packages/domain/src/regime/`. Introduce a `PlanRepository` interface for persisting requested plans.
3. **Application Layer Use Cases**:
   - `RequestPositionPlan`: Fetches the current position state from local data and requests a plan from Regime Engine. Parses response and persists plan ID/hash to `PlanRepository`.
   - `AcknowledgePlan`: For `HOLD` and `STAND_DOWN`, records the user acknowledgement and posts the canonical execution result to `/v1/execution-result`.
   - `RequestExitExecution`: Bridges a `REQUEST_EXIT_CLMM` plan into the existing `CreateExecutionPreview` use case. Upon completion or failure of the execution pipeline, the result is reported to `/v1/execution-result`.
4. **Adapter Layer**: Implement `RegimePlanAdapter` for `POST /v1/plan` and `POST /v1/execution-result`.
5. **Safety Constraints**: `clmm-v2` deterministic breach (lower/upper bound exits) has strict priority. An active or qualified breach will override any `HOLD` or `STAND_DOWN` advisory.

## Assumptions made

- The `POST /v1/plan` and `POST /v1/execution-result` contracts are (or will be) formalized and available to vendor into `schemas/regime-engine`.
- Authentication semantics for the `POST` endpoints are identical to those of the existing `GET` regime endpoints.
- Storing plans locally (e.g., via SQLite or IndexedDB, depending on the client platform) has enough capacity and is architecturally aligned with existing execution attempt storage.
- The user interface will be updated in a separate, focused effort to display plan advisories on the Position Detail screen.

## What is in scope and what is explicitly out of scope

**In Scope**:

- Vendored pinned contract clients/types/validation for the `v1` plan API.
- Position-scoped plan request adapter and application use case.
- Plan persistence, idempotency, and conflict handling.
- UX integration logic for `HOLD`, `STAND_DOWN`, and `REQUEST_EXIT_CLMM`.
- Linking `REQUEST_EXIT_CLMM` into the existing preview/sign/submit/reconcile flow.
- Execution-result reporting and crash/retry reconciliation.

**Out of Scope**:

- Inline candle delivery or portfolio allocation targets.
- Handling `REQUEST_ENTER_CLMM` or `REQUEST_REBALANCE`.
- Autonomous signing or submission (zero-click execution).
- Changing Regime Engine synthesis rules or PolicyInsight display.
- Modifying the separate breach-event telemetry endpoint (`/v1/clmm-execution-result` for deterministic breaches).

## Risks or concerns identified from code analysis

- **Divergent Paths**: The existing `RegimeEngineExecutionEventAdapter` handles deterministic breach events. Care must be taken not to entangle the new `POST /v1/execution-result` (which is plan-driven) with the existing deterministic breach reporting, as they serve different lifecycle audits.
- **Race Conditions**: A plan may be requested, and before it is executed or acknowledged, a deterministic breach may qualify. The system must gracefully cancel or supersede the plan in favor of the safety exit.
- **Schema Unavailability**: The vendored schema for `plan.v1` is not present in the workspace yet. The implementation is blocked until the canonical schema is merged in the `regime-engine` repo and vendored here.

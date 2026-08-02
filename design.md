# Design Document: Fix Vendored Position Plan Schema Drift

## 1. The Problem and Why It Matters

The `regime-engine` API validates positions and returns action plans (e.g., `STAND_DOWN`, `REQUEST_EXIT_CLMM`). The client-side application uses a vendored JSON schema (`schemas/regime-engine/position-plan.v1/schema.json`) to validate the API response payload.

Currently, the vendored schema incorrectly dictates that any `REQUEST_EXIT_CLMM` action must include an `exitIntent` field. However, the authoritative `regime-engine` contract does not produce an `exitIntent` field—instead, the directional intent (ExitToUSDC vs ExitToSOL) is meant to be derived client-side within the `DirectionalExitPolicyService` domain layer based on the breached boundary.

Because of this schema drift, valid `REQUEST_EXIT_CLMM` responses are rejected by the client-side `regimePlanValidator`, resulting in legitimate out-of-range positions failing to be processed. This completely blocks the primary product feature of CLMM V2 (assisting users in unwinding breached positions).

## 2. Key Design Decisions and Trade-Offs

- **Source of Truth for Directionality**: A core invariant of this application is that directional intent mapping (lower bound = exit to USDC, upper bound = exit to SOL) lives _only_ in `DirectionalExitPolicyService`. We must completely strip any pretense that the remote API provides this data.
- **DTO Synchronization**: Removing `exitIntent` from the JSON schema necessitates removing it from the `RegimePlanAction` DTO in the application layer. This cleanly separates the external HTTP contract (DTO) from the internal domain model (`PositionPlan.ts`), which defines `exitIntent` as an optional field on `PlanAction` to be populated later by the domain.
- **Test Alignment**: The validation test asserting that `exitIntent` must be present is actively harmful because it enforces fabricated behavior. We will remove this test and the corresponding invalid fixture entirely rather than adding compatibility shims.

## 3. Proposed Approach and Rationale

1. **Schema Update**: Remove the `exitIntent` property, the `PlanExitIntent` `$defs` block, and the `allOf`/`if`/`then` conditional requirement block from `schemas/regime-engine/position-plan.v1/schema.json`.
2. **DTO Update**: Remove `RegimePlanExitIntent` and the `exitIntent` field from the `RegimePlanAction` type in `packages/application/src/dto/regimePlan.ts`. Update any mappers that blindly copy this field from the DTO to the domain entity.
3. **Fixture Correction**:
   - Update `schemas/regime-engine/position-plan.v1/fixtures/valid/request-exit.json` to remove the `exitIntent` block. (Note: The issue mentioned dropping a stale `expiresAtUnixMs` here, but analysis shows it is already absent from this file).
   - Delete `schemas/regime-engine/position-plan.v1/fixtures/invalid/missing-exit-intent.json` since a missing `exitIntent` is the correct behavior.
4. **Test Correction**: Remove the `rejects a request-exit plan without canonical exit intent` block from `packages/application/src/dto/regimePlanValidator.test.ts`.
5. **Drift Audit**: Review `execution-result.v1` and `plan-request.v1` schemas to ensure they do not have similar fabricated fields. (Spot-checking shows they are clean and do not include `exitIntent` or similar unbacked requirements).

## 4. Assumptions Made

- The `regime-engine` API will never send `exitIntent`, and any downstream code in the client that requires it must derive it using `DirectionalExitPolicyService`.
- The instruction to drop `expiresAtUnixMs` from `request-exit.json` is a no-op because the field is already absent from the fixture on the current branch.
- Modifying the DTO (`packages/application/src/dto/regimePlan.ts`) is the correct interpretation of fixing the schema, as the DTO must accurately reflect the validated schema shape.
- `execution-result.v1` and `plan-request.v1` schemas are assumed to be drift-free as they do not mention `exitIntent` and align with their expected contract types.

## 5. Scope

**In Scope:**

- Modifications to `schemas/regime-engine/position-plan.v1/schema.json` and its associated valid/invalid fixtures.
- Updates to `packages/application/src/dto/regimePlanValidator.test.ts` to reflect the relaxed constraint.
- Updates to `packages/application/src/dto/regimePlan.ts` to remove the fabricated field from the type signature.
- Auditing sibling schemas for similar drift.

**Out of Scope:**

- Modifying `DirectionalExitPolicyService` or any code that performs the actual exit operation (which is assumed to be working properly).
- Introducing any new fields to `regime-engine` schemas.
- Adding backwards compatibility shims for `exitIntent`.

## 6. Risks and Concerns

- **Type Mapping Breakages**: Removing `exitIntent` from the DTO may cause TypeScript compiler errors in files that map the DTO to the domain `PlanAction` type (e.g., `parseRegimePlanResponse` consumers) if they assume it's always present. These will need to be fixed to ensure the domain's `exitIntent` is left undefined during the initial mapping.
- **UI/Adapter Reliance**: There is a risk that UI components or presentation logic might be checking for `exitIntent` too early in the lifecycle (before `DirectionalExitPolicyService` derives it). If this happens, fixing the schema might expose runtime errors in the UI, requiring further adjustments to how the UI sources the directional intent.

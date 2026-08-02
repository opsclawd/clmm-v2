# Plan Review Findings

## verdict

pass

## findings

- [P1] `task-manifest.json:Task 1` | "Task 1 creates a green-boundary violation by unsafely deferring the TypeScript DTO update to Task 2. By removing `exitIntent` from the runtime JSON schema in Task 1 but leaving the TS DTO unchanged, the runtime validation will succeed on canonical responses without `exitIntent` and pass them to `RequestPositionPlan.ts`. This consumer will crash with a `TypeError` when it attempts to access the now-missing `requestedAction.exitIntent.posture`. The DTO update and consumer fixes must be atomic with the schema change to preserve type-safety and runtime stability." | grounded | addressed
- [P1] `task-manifest.json:Task 2` | "The task manifest declares the behavioral invariants `unchanged-non-exit-action-mapping` and `domain-only-directional-ownership` (mapped to test cases `maps hold and stand-down actions without changing their kinds` and `does not derive exit posture outside DirectionalExitPolicyService`). However, the implementation in Step 2 only writes and executes the test for the `persists request-exit advisory...` invariant, failing to implement or run the required tests for the other two invariants." | grounded | addressed
- [P1] `task-manifest.json:Task 2` | "Step 4 assumes `packages/testing/src/fakes/FakeRegimePlanPort.ts` will compile without edits after narrowing the `RegimePlanResponse` DTO. However, as a test fake, it constructs mock responses and is highly likely to contain the fabricated `exitIntent` field for `REQUEST_EXIT_CLMM` actions to satisfy the previous strict DTO. Once the DTO is narrowed to disallow `exitIntent`, the fake port will fail workspace typechecking (`pnpm -r typecheck`) unless explicitly updated." | grounded | rebutted

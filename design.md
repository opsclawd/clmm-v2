# Design Document: PolicyInsights Canonical Contract Alignment

## 1. Problem Being Solved and Why It Matters

Currently, `clmm-v2` duplicates PolicyInsight response validation across its backend adapter (`CurrentPolicyInsightsAdapter.ts`) and its frontend client (`apps/app/src/api/policyInsights.ts`). Both implementations use hand-rolled type checking and manual parsing logic. This approach is problematic because:

- **Drift:** Hand-rolled parsers easily fall out of sync with the upstream Regime Engine output.
- **Silent Failures:** The current manual readers expect a legacy payload shape, meaning valid policy insight responses emitted by the Regime Engine may be rejected before they ever reach the user.
- **Redundancy & Maintenance Overhead:** Keeping two parsing implementations (and their tests) aligned across the BFF/App boundary wastes engineering effort and violates single-source-of-truth principles.

Aligning with the canonical contract ensures that the exact shape emitted by Regime Engine is reliably parsed, preserving critical safety signals (such as freshness and status) without silent conversions.

## 2. Key Design Decisions and Trade-offs

- **Single Source of Truth via Schema:** Use an authoritative JSON schema and fixture vendored from Regime Engine's checked-in `contracts/policy-insight/v1/` directory, copied into this repo at `schemas/regime-engine/policy-insight.v1/` with a `provenance.json` recording the source commit and per-asset sha256 — the same pattern `sol-usdc-clmm-intelligence` already uses for its EvidenceBundle v1 contract (`schemas/regime-engine/evidence-bundle.v1/`). Cross-repo contracts in this project are checked-in files consumed via a vendored copy, never a private npm package — no such package exists or is planned for `policy-insight.v1`.
  - _Trade-off:_ We add a schema validation library (`ajv`) and a manual (scripted) sync step against the upstream repo, but we gain absolute certainty that our application strictly honors the upstream contract, with drift detectable via the provenance hash.
- **Centralized Validator:** The validation logic will live exclusively in `@clmm/application`, exposing a single parser (`parsePolicyInsightBlock`).
  - _Trade-off:_ Both the Node backend and the Expo frontend must bundle and execute the same validation logic. We trade a small bundle size increase for deterministic fail-closed behavior on both ends.
- **Strict Validation Strategy:** `ajv` will run in strict mode (no type coercion, no defaults, no stripping of unknown keys).
  - _Trade-off:_ Any minor upstream schema change that breaks the contract will loudly fail (fail closed) rather than silently being ignored. This prioritizes safety over resilience.

## 3. Proposed Approach with Rationale

1. **Vendor the Contract:** Copy Regime Engine's `contracts/policy-insight/v1/` (schema, valid/invalid fixtures, `schema.sha256`) into this repo at `schemas/regime-engine/policy-insight.v1/` via a pinned-commit sparse clone, with a `provenance.json` recording the source commit and per-asset sha256. Add `ajv` to the workspace.
2. **Centralized Validator Module:**
   - Create `packages/application/src/dto/policyInsightValidator.ts`.
   - Initialize an `ajv` instance in strict mode using the exported JSON schema.
   - Expose `parsePolicyInsightBlock` which takes `unknown`, validates it against the schema, and returns the strictly typed `PolicyInsightBlock` or `null`.
3. **DTO Alignment:**
   - Update `packages/application/src/dto/policyInsights.ts` to perfectly match the canonical schema's fields, removing any legacy aliases or manual mapping logic.
4. **Adapter Refactoring:**
   - Update `CurrentPolicyInsightsAdapter.ts` to call the shared `parsePolicyInsightBlock` and remove all the `VALID_*` sets and manual type-checking functions.
5. **App Client Refactoring:**
   - Update `apps/app/src/api/policyInsights.ts` to use the exact same shared parser, removing its own duplicated validation logic.
6. **BFF Passthrough:**
   - Ensure the `PolicyInsightsController` remains a transparent envelope mapper, passing the validated block through without modification.
7. **UI View Model:**
   - Update `PolicyInsightsViewModel.ts` to rely strictly on the canonical presentation fields (e.g., `status` and `freshness`), removing any manual fallback logic (like falling back to `asOf` if `capturedAtUnixMs` is missing).

## 4. Assumptions Made

- **Contract Availability:** Regime Engine's `contracts/policy-insight/v1/` directory (schema + valid/invalid fixtures + `schema.sha256`) is present and checked in on `main` (verified at commit `260d144`). No npm package exists or is required for this contract; it is consumed by vendoring the checked-in files, identically to how `sol-usdc-clmm-intelligence` consumes `contracts/evidence-bundle/v1/`.
- **Expo Bundler Compatibility:** The Expo bundler can correctly resolve and bundle `ajv` and the JSON schema export without requiring Node-only built-in modules or throwing bundle errors.
- **Schema Completeness:** The canonical schema guarantees the presence of required fields like `status` and `freshness.capturedAtUnixMs`, making legacy fallback logic obsolete.
- **Invariant Scope:** This feature only handles reading advisory signals and does not change any directional mapping or execution rules in the domain layer.

## 5. Scope

**In Scope:**

- `CurrentPolicyInsightsAdapter` implementation and tests.
- Application DTOs (`packages/application/src/dto/policyInsights.ts`).
- App API parser (`apps/app/src/api/policyInsights.ts`).
- BFF controller validation and tests updates to use the fixture.
- Creation of a new centralized validator in `packages/application`.
- Vendoring the JSON schema and fixtures from Regime Engine's checked-in `contracts/policy-insight/v1/` directory into `schemas/regime-engine/policy-insight.v1/`.

**Out of Scope:**

- UI component design modifications.
- Evidence ingestion pipelines.
- Upstream synthesis rules inside Regime Engine.
- History, timeline, or detail views for PolicyInsights.
- Source references display in the UI.
- Applying policy changes automatically to positions.

## 6. Risks or Concerns Identified from Code Analysis

- **Expo / Ajv Compatibility:** `ajv` can occasionally struggle with React Native / Expo bundling if the schema relies on filesystem reads or dynamic imports. The schema must be imported statically.
- **Strict Validation Brittleness:** Because validation will be extremely strict (no additional keys allowed, no type coercion), any undocumented field addition by Regime Engine will cause `clmm-v2` to fail closed (returning `null`). This requires strict lockstep deployments or careful schema versioning upstream.
- **Fixture Mismatches:** If the vendored fixture copied from Regime Engine's `contracts/policy-insight/v1/` doesn't pass its own schema validator, our test suite will fail at step 1.
- **Cross-Layer Atomicity:** `PolicyInsightBlock` is used heavily across the UI, App, and Adapter layers. The refactor requires changing all of them in a single, atomic operation to ensure the workspace typecheck remains green.

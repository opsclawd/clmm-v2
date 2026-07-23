# Task Context: Task 2

Title: Replace every PolicyInsight reader and consumer with the shared canonical parser

## Workspace & Scope Constraints

## WORKSPACE CONSTRAINTS

Your working directory is a dedicated git worktree with the repository's complete history. Run all commands from it. Do NOT cd to or read paths outside this directory — external-directory access is automatically rejected. git log, git diff, etc. work here directly.

.ai-orchestrator.local.json, if one exists, lives only in the main checkout and is intentionally not copied into your worktree — it is operator-machine-specific and not part of your task. Do not search for it or read it outside this directory. Reason about configuration using only .ai-orchestrator.json in your own working directory; treat it as the effective config for your task.

Working Directory: /home/gary/.openclaw/workspace/clmm-superpowers-v2/.ai-worktrees/issue-92
Repository: opsclawd/clmm-v2
Branch: ai/issue-92
Start Commit: fb1d4a761de856add80733ef0af21e8e69fdc1eb

## Task Requirements

**Goal:** Change the exported DTO and parser once, then update all adapter, BFF, app, and UI consumers in the same atomic task so the mandatory workspace typecheck never observes a port/DTO-only intermediate state.

**Files:**

- Modify: `packages/application/src/dto/policyInsights.ts`
- Create: `packages/application/src/dto/policyInsightValidator.ts`
- Create: `packages/application/src/dto/policyInsightValidator.test.ts`
- Modify: `packages/application/src/dto/index.ts`
- Modify: `packages/application/src/index.ts`
- Modify: `packages/application/src/public/index.ts`
- Modify: `packages/application/src/public/policyInsights.exports.test.ts`
- Modify: `packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.ts`
- Modify: `packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.test.ts`
- Modify: `packages/adapters/src/inbound/http/PolicyInsightsController.test.ts`
- Modify: `apps/app/src/api/policyInsights.ts`
- Modify: `apps/app/src/api/policyInsights.test.ts`
- Modify: `packages/ui/src/view-models/PolicyInsightsViewModel.ts`
- Modify: `packages/ui/src/view-models/PolicyInsightsViewModel.test.ts`
- Modify: `packages/ui/src/components/PolicyInsightsSection.test.tsx`

**Dependencies:** Task 1.

**Exported signature changes:**

- Modify `PolicyInsightBlock` and any nested exported PolicyInsight DTOs in `packages/application/src/dto/policyInsights.ts` whose members differ from the published schema. Preserve a one-to-one wire representation; do not retain legacy-only members as optional compatibility aliases.
- Add `parsePolicyInsightBlock(value: unknown): PolicyInsightBlock | null` in `packages/application/src/dto/policyInsightValidator.ts` and export it through both `@clmm/application` and `@clmm/application/public`.
- Keep `PolicyInsightsReadPort.fetchCurrent(): Promise<PolicyInsightsReadResult>` unchanged. All implementations and consumers are nevertheless updated in this same task because `PolicyInsightsReadResult` contains the modified `PolicyInsightBlock`.

**Invariants to write as tests first:**

1. `returns the canonical fixture unchanged`
   - `parsePolicyInsightBlock(canonicalPolicyInsightFixture)` returns the same object reference and deep value.
2. `returns null when a canonical required field is missing`
   - Clone the fixture, delete one schema-required top-level field, and expect `null`.
3. `returns null for a coercible but incorrectly typed canonical field`
   - Replace a canonical numeric or boolean field with its string representation and expect `null`.
4. `returns null for a schema-forbidden additional property`
   - Add `legacyAlias` to a clone and expect `null`.
5. `returns null for the legacy freshness fallback shape`
   - Remove the canonical freshness timestamp member and supply only the legacy ISO/fallback input previously accepted by the handwritten readers; expect `null`.
6. `returns kind:"block" with the real canonical fixture on 200`
   - Adapter test imports the real package fixture, mocks a 200 JSON response, and expects the returned block to deeply equal the fixture with canonical freshness/status values intact.
7. `returns kind:"upstream-error" when a 200 payload violates the canonical schema`
   - Adapter test corrupts one required nested value and verifies the existing warning path.
8. `passes the canonical block through the BFF envelope without modification`
   - Controller test returns the canonical fixture from the fake port and asserts `{ policyInsight: fixture }`, including reference identity.
9. `returns the canonical BFF policyInsight without modification`
   - App test serves the real fixture in the BFF envelope and asserts reference/deep equality.
10. `throws when the BFF policyInsight violates the canonical schema`
    - App test corrupts the same representative nested field and expects the existing `malformed policyInsight block` error.
11. `derives freshness and stale presentation only from canonical status and freshness fields`
    - View-model tests use canonical fresh and stale fixtures and assert label/isStale output without `asOf` or ISO fallback behavior.
12. `renders the existing PolicyInsights card from a canonical block`
    - Component test updates its typed fixture to the canonical DTO and preserves existing labels, warning, and advisory-copy assertions.

**Implementation steps:**

- [ ] Update the test fixtures and add `policyInsightValidator.test.ts` first. Run the focused tests and confirm they fail because the shared parser/export and canonical DTO do not exist yet. Do not commit this red intermediate state.
- [ ] Rewrite `policyInsights.ts` from the published schema and fixture, preserving exact property names, requiredness, enum literals, nesting, and units. Remove the current drift-guard comment that instructs maintainers to synchronize two validators; replace it with a pointer to the canonical contract package and shared parser.
- [ ] Implement one module-level Ajv instance and precompiled validator in `policyInsightValidator.ts`. Configure `strict: true`, `coerceTypes: false`, `useDefaults: false`, and `removeAdditional: false`; return the original value when valid and `null` when invalid. Do not catch schema-compilation errors at module load, because an invalid shipped schema is a build/deploy defect rather than malformed user input.
- [ ] Export the DTO types through `dto/index.ts`, export the parser from `src/index.ts`, and export the parser plus required types from `src/public/index.ts`. Update `policyInsights.exports.test.ts` to prove both the canonical type surface and runtime parser are available from the UI/app-safe public entry point.
- [ ] Replace all `VALID_*` sets, record walkers, array readers, `parseFreshness`, and `parseUpstream` code in `CurrentPolicyInsightsAdapter.ts` with a call to `parsePolicyInsightBlock`. Keep URL construction, timeout behavior, status mapping, logging, and error-envelope parsing unchanged.
- [ ] Replace the duplicated DTO-validation helpers in `apps/app/src/api/policyInsights.ts` with the public `parsePolicyInsightBlock` import. Keep BFF envelope validation, unavailable-reason validation, abort handling, and error messages unchanged.
- [ ] Update `PolicyInsightsController.test.ts` to use the real fixture and assert transparent pass-through. Keep `PolicyInsightsController.ts` unchanged; do not map the block field-by-field.
- [ ] Update `PolicyInsightsViewModel.ts` to use only canonical action/risk/confidence/data-quality/status/freshness members. Remove fallback conversion from `asOf` or legacy freshness fields. Preserve the view-model's ownership of labels, severity, reasoning selection, and advisory copy.
- [ ] Update the view-model and component fixtures to satisfy the canonical DTO. Do not import the external contract package from `packages/ui`; UI remains dependent only on `@clmm/application/public`.
- [ ] Run the focused tests, package typechecks/builds/lints, the exact changed-path boundary check, and the automatic workspace-wide `pnpm -r typecheck` gate before committing.

**Acceptance criteria:**

- Exactly one handwritten/runtime PolicyInsight parser remains: `parsePolicyInsightBlock` in application. Adapter and app client contain no PolicyInsight field allowlists or freshness normalization.
- The canonical package fixture passes the parser, adapter, controller, and app-client paths without field or unit conversion.
- Representative malformed, legacy-only, coercible, and extra-property payloads fail closed.
- Freshness/status display behavior uses the canonical values directly.
- Existing 404, 503, config, timeout, network, invalid-JSON, null-envelope, and unavailable-reason tests remain green.
- `PolicyInsightsReadPort` and its adapter implementation stay type-compatible in the same commit.
- UI and testing boundaries remain intact; no domain or execution-policy file changes.

**Task-scoped validation commands:**

```bash
pnpm --filter @clmm/application exec vitest run src/dto/policyInsightValidator.test.ts src/public/policyInsights.exports.test.ts
pnpm --filter @clmm/adapters exec vitest run src/outbound/regime-engine/CurrentPolicyInsightsAdapter.test.ts src/inbound/http/PolicyInsightsController.test.ts
pnpm --filter @clmm/app exec vitest run --config vitest.config.ts src/api/policyInsights.test.ts
pnpm --filter @clmm/ui exec vitest run src/view-models/PolicyInsightsViewModel.test.ts src/components/PolicyInsightsSection.test.tsx
pnpm --filter @clmm/application typecheck
pnpm --filter @clmm/adapters typecheck
pnpm --filter @clmm/app typecheck
pnpm --filter @clmm/ui typecheck
pnpm --filter @clmm/application build
pnpm --filter @clmm/adapters build
pnpm --filter @clmm/ui build
pnpm --filter @clmm/app build
pnpm --filter @clmm/application lint
pnpm --filter @clmm/adapters lint
pnpm --filter @clmm/app lint
pnpm --filter @clmm/ui lint
pnpm exec depcruise --config packages/config/boundaries/dependency-cruiser.cjs packages/application/src/dto/policyInsights.ts packages/application/src/dto/policyInsightValidator.ts packages/application/src/dto/index.ts packages/application/src/index.ts packages/application/src/public/index.ts packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.ts apps/app/src/api/policyInsights.ts packages/ui/src/view-models/PolicyInsightsViewModel.ts
```

**Commit boundary:** Commit the DTO, parser, every implementation consumer, and all affected tests together. This is the deliberate exception to small per-layer commits because the exported DTO is embedded in the read-port result and the implementation loop runs workspace-wide typechecking after each task.

---

## Tests to add or update

**New tests**

- `packages/application/src/dto/policyInsightContract.test.ts`: published schema/fixture compatibility and validator non-mutation preflight.
- `packages/application/src/dto/policyInsightValidator.test.ts`: canonical acceptance, missing required field, type coercion rejection, extra-property rejection, and legacy freshness rejection.

**Updated tests**

- `packages/application/src/public/policyInsights.exports.test.ts`: canonical DTO construction and public runtime parser export.
- `packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.test.ts`: real canonical fixture, exact block preservation, malformed canonical payload failure, and unchanged HTTP outcome coverage.
- `packages/adapters/src/inbound/http/PolicyInsightsController.test.ts`: real canonical fixture and reference-preserving envelope passthrough.
- `apps/app/src/api/policyInsights.test.ts`: real canonical fixture, shared-parser rejection, and unchanged fetch/envelope/abort behavior.
- `packages/ui/src/view-models/PolicyInsightsViewModel.test.ts`: canonical status/freshness semantics and existing presentation derivations.
- `packages/ui/src/components/PolicyInsightsSection.test.tsx`: canonical typed fixture with existing render-state coverage.

The adapter, app-client, view-model, and component test files exceed ten cases in their current form, but Task 2 is not a standalone test-update task: their fixture/test edits are inseparable from the atomic exported-contract migration. Do not create separate test-only commits that leave the workspace typecheck red.

## Validation commands

After both implementation tasks complete, the repository's dedicated validate phase must run the full cross-package gates required for a shared contract change. This is not a standalone implementation task.

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
```

Expected result: every command exits 0. The Expo build is specifically required to prove Metro can bundle application code that statically imports Ajv and the package schema.

## Risk areas

- **Upstream package readiness:** The package may be unpublished, inaccessible, missing declared exports, or blocked by Regime Engine issue 63.
- **Schema/fixture disagreement:** A package fixture that fails its own schema makes the canonical source unusable.
- **Ajv strict compilation:** Unknown formats, unsupported vocabularies, or non-strict schema constructs may fail at module initialization. Do not weaken strict mode silently.
- **Unknown-property policy:** Rejection of extra properties depends on the canonical schema declaring the intended closed-object constraints. Do not add a second local schema to compensate.
- **Expo/Metro bundling:** Ajv or the contract package may expose Node-only modules, dynamic filesystem access, CommonJS/ESM incompatibilities, or package exports that fail under the app's `unstable_enablePackageExports = false` configuration.
- **Breaking DTO blast radius:** Tests and UI fixtures currently construct the legacy shape. All typed consumers must change in Task 2's atomic commit.
- **Mutation or normalization:** Ajv options or local mapping could silently coerce/default/remove data, violating exact wire preservation.
- **UI semantic drift:** Removing freshness fallbacks must not accidentally recompute upstream status or introduce a client-owned stale threshold.
- **Bundle size/startup cost:** A module-level precompiled validator avoids recompilation per request, but Ajv still becomes part of the Expo bundle; the app build is the compatibility gate.

## Stop conditions

Abort implementation instead of improvising if any of the following occurs:

- Regime Engine's `contracts/policy-insight/v1/` directory cannot be fetched (network/auth failure) or is missing the schema, `schema.sha256`, or fixtures at the pinned commit.
- The vendored schema and fixture do not validate together under strict Ajv.
- The schema permits legacy aliases, undocumented unit conversion, or additional properties contrary to `design.md`; resolve the upstream contract rather than layering a clmm-only schema over it.
- The schema uses formats/vocabularies Ajv cannot compile strictly and the required extension is not part of the approved design/dependency scope.
- The package or Ajv requires Node-only runtime behavior that cannot be statically bundled by Expo/Metro without an architectural change.
- The canonical contract removes or changes `status`/freshness semantics such that the existing UI behavior cannot be preserved without a product decision.
- Implementing the contract would require changing `PolicyInsightsReadPort.fetchCurrent`, any adapter method signature, or another exported port beyond the block type without updating every implementation in the same task.
- Any proposed change touches domain directional mapping, execution policy, Solana transaction logic, evidence ingestion, or Regime Engine synthesis.
- A validation failure is unrelated to the explicitly changed files and cannot be resolved without expanding scope; report it rather than editing unrelated code.

## Definition of done

- The canonical fixture is the positive test source at the application, adapter, controller, and app trust boundaries.
- One shared application parser validates both adapter and app payloads.
- DTOs match the published schema with no undocumented renames, aliases, defaults, or unit conversions.
- Malformed and legacy-only payloads fail closed.
- Freshness/status semantics reach the view model unchanged.
- Every task-scoped command and the final dedicated validate phase passes.
- The final diff contains only the files listed in this plan and no abandoned compatibility or experimental code.

## Repository Targets

### Expected Files

- packages/application/src/dto/policyInsights.ts
- packages/application/src/dto/policyInsightValidator.ts
- packages/application/src/dto/policyInsightValidator.test.ts
- packages/application/src/dto/index.ts
- packages/application/src/index.ts
- packages/application/src/public/index.ts
- packages/application/src/public/policyInsights.exports.test.ts
- packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.ts
- packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.test.ts
- packages/adapters/src/inbound/http/PolicyInsightsController.test.ts
- apps/app/src/api/policyInsights.ts
- apps/app/src/api/policyInsights.test.ts
- packages/ui/src/view-models/PolicyInsightsViewModel.ts
- packages/ui/src/view-models/PolicyInsightsViewModel.test.ts
- packages/ui/src/components/PolicyInsightsSection.test.tsx

## Validation Commands

```bash
pnpm --filter @clmm/application exec vitest run src/dto/policyInsightValidator.test.ts src/public/policyInsights.exports.test.ts
pnpm --filter @clmm/adapters exec vitest run src/outbound/regime-engine/CurrentPolicyInsightsAdapter.test.ts src/inbound/http/PolicyInsightsController.test.ts
pnpm --filter @clmm/app exec vitest run --config vitest.config.ts src/api/policyInsights.test.ts
pnpm --filter @clmm/ui exec vitest run src/view-models/PolicyInsightsViewModel.test.ts src/components/PolicyInsightsSection.test.tsx
pnpm --filter @clmm/application typecheck
pnpm --filter @clmm/adapters typecheck
pnpm --filter @clmm/app typecheck
pnpm --filter @clmm/ui typecheck
pnpm --filter @clmm/application build
pnpm --filter @clmm/adapters build
pnpm --filter @clmm/ui build
pnpm --filter @clmm/app build
pnpm --filter @clmm/application lint
pnpm --filter @clmm/adapters lint
pnpm --filter @clmm/app lint
pnpm --filter @clmm/ui lint
pnpm exec depcruise --config packages/config/boundaries/dependency-cruiser.cjs packages/application/src/dto/policyInsights.ts packages/application/src/dto/policyInsightValidator.ts packages/application/src/dto/index.ts packages/application/src/index.ts packages/application/src/public/index.ts packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.ts apps/app/src/api/policyInsights.ts packages/ui/src/view-models/PolicyInsightsViewModel.ts
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **canonical payload identity**: A canonical PolicyInsight payload is returned unchanged, including object identity, field names, nesting, and units. (Test: `returns the canonical fixture unchanged`)
- **required fields fail closed**: Deleting any representative schema-required field causes parsing to return null. (Test: `returns null when a canonical required field is missing`)
- **type coercion is forbidden**: A value with a coercible but incorrect scalar type is rejected rather than converted. (Test: `returns null for a coercible but incorrectly typed canonical field`)
- **additional properties fail closed**: A schema-forbidden extra property is rejected and is never stripped from the input. (Test: `returns null for a schema-forbidden additional property`)
- **legacy freshness is rejected**: A payload that supplies only the former ISO or asOf freshness fallback shape is rejected instead of normalized. (Test: `returns null for the legacy freshness fallback shape`)
- **adapter accepts canonical 200**: A 200 response containing the real canonical fixture maps to a block result with freshness and status intact. (Test: `returns kind:"block" with the real canonical fixture on 200`)
- **adapter rejects malformed 200**: A 200 response that violates the canonical schema maps to upstream-error and follows the existing warning path. (Test: `returns kind:"upstream-error" when a 200 payload violates the canonical schema`)
- **controller is transparent**: The BFF controller wraps the canonical block without cloning, remapping, or dropping fields. (Test: `passes the canonical block through the BFF envelope without modification`)
- **app accepts canonical envelope**: The Expo client returns a canonical non-null BFF block unchanged through the shared parser. (Test: `returns the canonical BFF policyInsight without modification`)
- **app rejects malformed envelope**: The Expo client throws its existing malformed-block error for a non-null payload that violates the canonical schema. (Test: `throws when the BFF policyInsight violates the canonical schema`)
- **canonical freshness drives presentation**: The view model derives freshness and stale presentation only from canonical status and freshness members, without asOf or ISO fallback logic. (Test: `derives freshness and stale presentation only from canonical status and freshness fields`)
- **canonical block renders existing UI**: The existing card renders its current labels, stale warning, and advisory copy from a canonical typed block. (Test: `renders the existing PolicyInsights card from a canonical block`)

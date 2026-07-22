# Task Context: Task 2

Title: Migrate every PolicyInsights boundary to the canonical DTO and parser

## Workspace & Scope Constraints

## WORKSPACE CONSTRAINTS

Your working directory is a dedicated git worktree with the repository's complete history. Run all commands from it. Do NOT cd to or read paths outside this directory — external-directory access is automatically rejected. git log, git diff, etc. work here directly.

.ai-orchestrator.local.json, if one exists, lives only in the main checkout and is intentionally not copied into your worktree — it is operator-machine-specific and not part of your task. Do not search for it or read it outside this directory. Reason about configuration using only .ai-orchestrator.json in your own working directory; treat it as the effective config for your task.

Working Directory: /home/gary/.openclaw/workspace/clmm-superpowers-v2/.ai-worktrees/issue-92
Repository: opsclawd/clmm-v2
Branch: ai/issue-92
Start Commit: fb1d4a761de856add80733ef0af21e8e69fdc1eb

## Task Requirements

**Files:**

- Modify: `packages/application/src/dto/policyInsightValidator.ts`
- Modify: `packages/application/src/dto/policyInsights.ts`
- Modify: `packages/application/src/dto/index.ts`
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

This task deliberately combines the exported DTO change with every adapter/client/UI implementation affected by its required-member shape. Splitting by layer would leave an intermediate commit that fails the automatic workspace-wide `pnpm -r typecheck` gate. No port method changes are made.

**Behavioral invariants (write these exact named tests first):**

1. `parses the canonical PolicyInsight fixture as the exact public DTO` — the shared parser returns a `PolicyInsightBlock` equal to the upstream fixture, with no renamed keys or converted units.
2. `maps a canonical 200 PolicyInsight response to kind block without transformation` — the outbound adapter returns `{ kind: 'block', block: canonicalFixture }`.
3. `maps a schema-invalid 200 PolicyInsight response to upstream-error` — malformed upstream data never reaches the controller.
4. `passes the canonical PolicyInsight block through the BFF envelope unchanged` — the controller result is exactly `{ policyInsight: canonicalFixture }`.
5. `accepts a canonical PolicyInsight block from the BFF without transformation` — the Expo client returns the canonical block byte-for-field after JSON parsing.
6. `throws malformed policyInsight block for a schema-invalid BFF block` — app-bound malformed data fails closed through the same shared parser.
7. `rejects the legacy PolicyInsight block at both network boundaries` — neither adapter nor app client retains a legacy alias, fallback, or unit conversion.
8. `preserves canonical status and freshness semantics in the PolicyInsights view model` — the view model's fresh/stale label and warning state derive only from the canonical status/freshness members documented by the schema.

- [ ] **Step 1: Update tests to the canonical fixture before changing production consumers.**

In the application export test, adapter test, controller test, and app client test, replace hand-authored success blocks with the upstream canonical fixture imported from the contract package. Add the invariant test names above. Keep the adapter's existing URL/config/404/503/network/timeout tests and the app client's envelope/network/abort tests intact; only replace block-contract assertions. In UI tests, build typed fixtures from the canonical DTO fields actually consumed by `PolicyInsightsViewModel` and `PolicyInsightsSection`; do not import Regime Engine artifacts into production UI code.

Run the following targeted red-state tests:

```bash
pnpm --filter @clmm/application exec vitest run src/public/policyInsights.exports.test.ts src/dto/policyInsightValidator.test.ts
pnpm --filter @clmm/adapters exec vitest run src/outbound/regime-engine/CurrentPolicyInsightsAdapter.test.ts src/inbound/http/PolicyInsightsController.test.ts
pnpm --filter @clmm/app exec vitest run src/api/policyInsights.test.ts
pnpm --filter @clmm/ui exec vitest run src/view-models/PolicyInsightsViewModel.test.ts src/components/PolicyInsightsSection.test.tsx
```

Expected: the new canonical-contract cases FAIL against the assumed DTO and duplicated parsers, while unrelated outcome tests remain green.

- [ ] **Step 2: Align the application DTO and parser with the schema.**

Replace the member declarations in `packages/application/src/dto/policyInsights.ts` with the exact names, required/optional status, enum literals, nesting, and units defined by the installed schema. Preserve `PolicyInsightsUnavailableReason`, because it describes the clmm-v2 BFF envelope rather than the Regime Engine block. Delete the comment requiring two validators.

Change the parser signature to:

```ts
export function parsePolicyInsightBlock(value: unknown): PolicyInsightBlock | null;
```

The implementation delegates to the already compiled schema validator and returns the original validated value typed as `PolicyInsightBlock`; it does not construct a replacement object. Re-export `parsePolicyInsightBlock` through `packages/application/src/dto/index.ts` and `packages/application/src/public/index.ts`. Update `policyInsights.exports.test.ts` to prove both the canonical type shape and callable parser are available through `@clmm/application/public`.

- [ ] **Step 3: Replace adapter-side block parsing with the shared parser.**

In `CurrentPolicyInsightsAdapter.ts`, import `parsePolicyInsightBlock` from `@clmm/application`, remove `VALID_*`, array/nested-object parsers, and freshness fallback/conversion code used only for the success block. Retain the local record check needed by `readErrorEnvelope`; that validates the adapter-specific error envelope, not the canonical PolicyInsight block. On a `200`, parse JSON once, call the shared parser once, log the existing shape-validation warning on `null`, and otherwise return `{ kind: 'block', block }`. Do not change URL, timeout, one-request behavior, or result classification.

- [ ] **Step 4: Keep the BFF a transparent envelope mapper.**

Do not change `PolicyInsightsController.ts`. Update `PolicyInsightsController.test.ts` so its block fixture is the canonical contract object and its success assertion uses deep equality. Existing tests for `not-found`, `store-unavailable`, `config-error`, and `upstream-error` remain unchanged.

- [ ] **Step 5: Replace app-side block parsing with the same shared parser.**

In `apps/app/src/api/policyInsights.ts`, import `parsePolicyInsightBlock` from `@clmm/application/public`. Remove block-specific enum sets, nested validators, array validators, and freshness conversion/fallback logic. Retain `isRecord` for the BFF response envelope, `VALID_REASONS`/`isUnavailableReason` for clmm-v2's envelope, and all timeout/network/abort handling. Call the shared parser only when `policyInsight` is non-null and preserve the existing controlled error text when it returns `null`.

- [ ] **Step 6: Adapt presentation reads without changing the design.**

Update `PolicyInsightsViewModel.ts` only where canonical member names/nesting or units require it. Preserve the existing exported view-model shape, severity precedence, advisory copy, reasoning limit, and component layout. Freshness/status presentation must read the canonical fields directly; do not recover removed fields from `asOf`, infer stale state from wall-clock time, or convert a differently named unit without documenting that mapping beside the formatter and covering it with the named semantics test. Update the view-model and component fixtures accordingly.

- [ ] **Step 7: Run file-scoped acceptance checks for every changed package.**

Run:

```bash
pnpm --filter @clmm/application exec vitest run src/dto/policyInsightValidator.test.ts src/public/policyInsights.exports.test.ts
pnpm --filter @clmm/application typecheck
pnpm --filter @clmm/application lint
pnpm --filter @clmm/adapters exec vitest run src/outbound/regime-engine/CurrentPolicyInsightsAdapter.test.ts src/inbound/http/PolicyInsightsController.test.ts
pnpm --filter @clmm/adapters typecheck
pnpm --filter @clmm/adapters lint
pnpm --filter @clmm/app exec vitest run src/api/policyInsights.test.ts
pnpm --filter @clmm/app typecheck
pnpm --filter @clmm/app lint
pnpm --filter @clmm/ui exec vitest run src/view-models/PolicyInsightsViewModel.test.ts src/components/PolicyInsightsSection.test.tsx
pnpm --filter @clmm/ui typecheck
pnpm --filter @clmm/ui lint
```

Expected: all commands PASS. The dedicated validate phase may subsequently run the repository-wide build, typecheck, lint, boundaries, and test commands; do not add a separate implementation task for that phase.

- [ ] **Step 8: Commit the atomic cross-layer contract migration.**

```bash
git add packages/application/src/dto/policyInsightValidator.ts packages/application/src/dto/policyInsights.ts packages/application/src/dto/index.ts packages/application/src/public/index.ts packages/application/src/public/policyInsights.exports.test.ts packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.ts packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.test.ts packages/adapters/src/inbound/http/PolicyInsightsController.test.ts apps/app/src/api/policyInsights.ts apps/app/src/api/policyInsights.test.ts packages/ui/src/view-models/PolicyInsightsViewModel.ts packages/ui/src/view-models/PolicyInsightsViewModel.test.ts packages/ui/src/components/PolicyInsightsSection.test.tsx
git commit -m "fix: align PolicyInsights with canonical regime contract"
```

**Tests to add or update**

- Add schema conformance and non-mutation coverage in `packages/application/src/dto/policyInsightValidator.test.ts`.
- Update the public export test to compile the canonical fixture as `PolicyInsightBlock` and call `parsePolicyInsightBlock`.
- Update adapter success/malformed/legacy cases to use the real Regime Engine fixture; retain its 20 existing outcome tests rather than splitting them into a test-only task.
- Update controller success coverage to prove exact pass-through.
- Update app client success/malformed/legacy cases to use the canonical fixture; retain the existing 17 envelope/network/abort cases.
- Update the UI's existing 11-case view-model file and component tests only as part of the production contract migration, not as oversized standalone test-update tasks.

**Risk areas**

- The upstream artifact is currently absent from this worktree and the issue declares an upstream blocker. Guessing package exports or copying the old fixture would recreate the drift this issue exists to remove.
- Ajv/schema code can affect the Expo bundle. The implementation should import only the PolicyInsight schema export, never a package-wide schema registry. If Expo cannot bundle the selected JSON-schema export, stop and revise the artifact packaging rather than adding a second app-only validator.
- Ajv mutation options can hide upstream drift. Strict, non-coercing, non-defaulting validation and the input non-mutation test are mandatory.
- `PolicyInsightBlock` is a public exported required-member shape used by adapters, app, and UI. It must change atomically with those consumers.
- Freshness and status are user-visible safety signals. Any renamed field or changed unit must come from the canonical schema and be represented directly; undocumented conversion is an acceptance-criteria failure.
- The adapter and app test files have more than ten cases, and the UI view-model test has eleven. They are intentionally updated inside the corresponding production migration task so each commit remains green; do not create a broad test-only cleanup task.

**Stop conditions**

- Stop before Task 1 if `@opsclawd/regime-engine-contracts` is unpublished, cannot be installed at an exact version, or does not export both the canonical PolicyInsight schema and a real payload fixture.
- Stop if the fixture does not validate against the schema from the same package version; that is an upstream contract release defect.
- Stop if the canonical artifact requires application to import adapters, React, Expo, Solana SDKs, or platform code.
- Stop if consuming the schema in Expo requires Node-only runtime modules or cannot be bundled without introducing a second validator. Request a browser-neutral/precompiled upstream artifact instead.
- Stop if the canonical schema leaves status/freshness fields or units ambiguous. Do not infer them from the old DTO or `asOf`.
- Stop if implementing the contract would require changing `PolicyInsightsReadPort.fetchCurrent()`, result variants, routes, query behavior, UI design, or any directional-exit behavior; those are outside this issue and require a revised design.
- Stop if baseline failures exist in one of the targeted package commands before source changes; record them separately rather than folding unrelated fixes into this work.

**Plan review classification**

This plan adds no retry loop, no explicit state machine, and no irreversible external side effect. It therefore does not require the `plan-review-required` marker.

## Repository Targets

### Expected Files

- packages/application/src/dto/policyInsightValidator.ts
- packages/application/src/dto/policyInsights.ts
- packages/application/src/dto/index.ts
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
pnpm --filter @clmm/application typecheck
pnpm --filter @clmm/application lint
pnpm --filter @clmm/adapters exec vitest run src/outbound/regime-engine/CurrentPolicyInsightsAdapter.test.ts src/inbound/http/PolicyInsightsController.test.ts
pnpm --filter @clmm/adapters typecheck
pnpm --filter @clmm/adapters lint
pnpm --filter @clmm/app exec vitest run src/api/policyInsights.test.ts
pnpm --filter @clmm/app typecheck
pnpm --filter @clmm/app lint
pnpm --filter @clmm/ui exec vitest run src/view-models/PolicyInsightsViewModel.test.ts src/components/PolicyInsightsSection.test.tsx
pnpm --filter @clmm/ui typecheck
pnpm --filter @clmm/ui lint
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **public DTO is exact canonical contract**: The shared parser returns the upstream fixture as PolicyInsightBlock without renaming keys or converting units. (Test: `parses the canonical PolicyInsight fixture as the exact public DTO`)
- **adapter canonical success passthrough**: A canonical HTTP 200 body becomes a block result containing the unchanged fixture. (Test: `maps a canonical 200 PolicyInsight response to kind block without transformation`)
- **adapter malformed success fails closed**: A schema-invalid HTTP 200 body is classified as upstream-error and never reaches the controller as a block. (Test: `maps a schema-invalid 200 PolicyInsight response to upstream-error`)
- **BFF canonical block passthrough**: The controller wraps the canonical block without adding, removing, renaming, or converting fields. (Test: `passes the canonical PolicyInsight block through the BFF envelope unchanged`)
- **app canonical success passthrough**: A valid BFF envelope yields the canonical block unchanged after JSON parsing. (Test: `accepts a canonical PolicyInsight block from the BFF without transformation`)
- **app malformed block fails closed**: A schema-invalid non-null BFF block produces the existing controlled malformed-block error. (Test: `throws malformed policyInsight block for a schema-invalid BFF block`)
- **both network boundaries reject legacy blocks**: Neither the Regime Engine adapter nor the Expo client accepts aliases, fallback timestamps, or unit conversions from the legacy shape. (Test: `rejects the legacy PolicyInsight block at both network boundaries`)
- **canonical freshness drives presentation**: The view model derives its fresh/stale label and warning state only from canonical status and freshness members. (Test: `preserves canonical status and freshness semantics in the PolicyInsights view model`)

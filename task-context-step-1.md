# Task Context: Task 1

Title: Propagate a distinct malformed outcome through the existing read path

## Workspace & Scope Constraints

## WORKSPACE CONSTRAINTS

Your working directory is a dedicated git worktree with the repository's complete history. Run all commands from it. Do NOT cd to or read paths outside this directory — external-directory access is automatically rejected. git log, git diff, etc. work here directly.

.ai-orchestrator.local.json, if one exists, lives only in the main checkout and is intentionally not copied into your worktree — it is operator-machine-specific and not part of your task. Do not search for it or read it outside this directory. Reason about configuration using only .ai-orchestrator.json in your own working directory; treat it as the effective config for your task.

Working Directory: /home/gary/.openclaw/workspace/clmm-superpowers-v2/.ai-worktrees/issue-93
Repository: opsclawd/clmm-v2
Branch: ai/issue-93
Start Commit: ea439d93e9d2ece2778fd487e370173c295002c9

## Task Requirements

**Files:**

- Modify: `packages/application/src/dto/policyInsights.ts`
- Modify: `packages/application/src/ports/index.ts`
- Modify: `packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.ts`
- Modify: `packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.test.ts`
- Modify: `packages/adapters/src/inbound/http/PolicyInsightsController.ts`
- Modify: `packages/adapters/src/inbound/http/PolicyInsightsController.test.ts`
- Modify: `apps/app/src/api/policyInsights.ts`
- Modify: `apps/app/src/api/policyInsights.test.ts`
- Modify: `packages/ui/src/components/PolicyInsightsSection.tsx`
- Modify: `packages/ui/src/components/PolicyInsightsSection.test.tsx`
- Modify: `packages/ui/src/screens/PositionsListScreen.tsx`

**Behavioral invariants:**

- A syntactically valid `200` JSON body rejected by `parsePolicyInsightBlock` yields `{ kind: 'malformed' }`, logs the existing shape-validation warning, and never yields a block.
- Invalid JSON, a timeout, a network error, and non-2xx responses remain `upstream-error`; malformed is reserved for canonical schema rejection after JSON decoding.
- The controller maps `malformed` to `{ policyInsight: null, unavailableReason: 'malformed' }`.
- The app client accepts the typed malformed null envelope but still throws when the BFF itself sends a malformed top-level envelope or invalid embedded block.
- The UI renders malformed as a fail-closed unavailable card and never calls the view-model builder for absent/rejected data.
- Every unavailable copy states that position monitoring and deterministic stop-loss protection continue independently; not-found, store-unavailable, config-error, upstream-error, and malformed use distinct text.

- [ ] **Step 1: Write the failing boundary tests**

Update the existing focused cases and add exact tests named:

```text
returns kind:"malformed" when a 200 payload violates the canonical schema
logs contract validation failure when returning kind:"malformed"
maps malformed to { policyInsight: null, unavailableReason: "malformed" }
returns { policyInsight: null, unavailableReason } for malformed
renders fail-closed unavailable copy for malformed
renders distinct bounded copy for every unavailable reason
```

Keep the existing invalid-JSON test asserting `upstream-error` and the app-client malformed-block tests asserting thrown errors.

- [ ] **Step 2: Run focused tests and confirm the new cases fail**

Run:

```bash
pnpm --filter @clmm/adapters test -- src/outbound/regime-engine/CurrentPolicyInsightsAdapter.test.ts src/inbound/http/PolicyInsightsController.test.ts
pnpm --filter @clmm/app test -- src/api/policyInsights.test.ts
pnpm --filter @clmm/ui test -- src/components/PolicyInsightsSection.test.tsx
```

Expected: the new `malformed` expectations fail because the unions, mappings, reason allowlist, and UI copy do not yet contain that variant.

- [ ] **Step 3: Extend the port and all implementations/consumers atomically**

Make these exact surface changes in one step so the workspace typecheck remains green:

```ts
export type PolicyInsightsUnavailableReason =
  | 'not-found'
  | 'store-unavailable'
  | 'config-error'
  | 'malformed'
  | 'upstream-error';

export type PolicyInsightsReadResult =
  | { kind: 'block'; block: PolicyInsightBlock }
  | { kind: 'not-found' }
  | { kind: 'store-unavailable' }
  | { kind: 'config-error' }
  | { kind: 'malformed' }
  | { kind: 'upstream-error' };
```

Return `malformed` only from the adapter branch where parsed JSON fails `parsePolicyInsightBlock`. Add the matching exhaustive controller case, app-client allowlist entry, `PositionsListScreen` prop member, and `PolicyInsightsSection` unavailable-copy branch. Use stable copy with these meanings:

```text
not-found: No policy insight is available yet.
store-unavailable: The policy insight store is temporarily unavailable.
config-error: Policy analysis is not configured.
malformed: The policy insight payload was malformed, so guidance was withheld.
upstream-error: The policy insight service could not be reached.
shared suffix: Position monitoring and deterministic stop-loss protection continue independently.
```

Do not expose parser diagnostics or rejected payload fields to the UI.

- [ ] **Step 4: Run focused verification**

Run:

```bash
pnpm --filter @clmm/adapters test -- src/outbound/regime-engine/CurrentPolicyInsightsAdapter.test.ts src/inbound/http/PolicyInsightsController.test.ts
pnpm --filter @clmm/app test -- src/api/policyInsights.test.ts
pnpm --filter @clmm/ui test -- src/components/PolicyInsightsSection.test.tsx
pnpm --filter @clmm/application typecheck
pnpm --filter @clmm/adapters typecheck
pnpm --filter @clmm/app typecheck
pnpm --filter @clmm/ui typecheck
```

Expected: all focused tests and package typechecks pass; invalid JSON is still upstream-error, schema-invalid decoded JSON is malformed, and no union consumer is non-exhaustive.

- [ ] **Step 5: Commit the atomic boundary change**

```bash
git add packages/application/src/dto/policyInsights.ts packages/application/src/ports/index.ts packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.ts packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.test.ts packages/adapters/src/inbound/http/PolicyInsightsController.ts packages/adapters/src/inbound/http/PolicyInsightsController.test.ts apps/app/src/api/policyInsights.ts apps/app/src/api/policyInsights.test.ts packages/ui/src/components/PolicyInsightsSection.tsx packages/ui/src/components/PolicyInsightsSection.test.tsx packages/ui/src/screens/PositionsListScreen.tsx
git commit -m "feat: distinguish malformed policy insights"
```

## Repository Targets

### Expected Files

- packages/application/src/dto/policyInsights.ts
- packages/application/src/ports/index.ts
- packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.ts
- packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.test.ts
- packages/adapters/src/inbound/http/PolicyInsightsController.ts
- packages/adapters/src/inbound/http/PolicyInsightsController.test.ts
- apps/app/src/api/policyInsights.ts
- apps/app/src/api/policyInsights.test.ts
- packages/ui/src/components/PolicyInsightsSection.tsx
- packages/ui/src/components/PolicyInsightsSection.test.tsx
- packages/ui/src/screens/PositionsListScreen.tsx

## Validation Commands

```bash
pnpm --filter @clmm/adapters test -- src/outbound/regime-engine/CurrentPolicyInsightsAdapter.test.ts src/inbound/http/PolicyInsightsController.test.ts
pnpm --filter @clmm/app test -- src/api/policyInsights.test.ts
pnpm --filter @clmm/ui test -- src/components/PolicyInsightsSection.test.tsx
pnpm --filter @clmm/application typecheck
pnpm --filter @clmm/adapters typecheck
pnpm --filter @clmm/app typecheck
pnpm --filter @clmm/ui typecheck
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **schema rejection is malformed**: A decoded 200 response rejected by parsePolicyInsightBlock returns malformed, emits contract-failure observability, and never exposes a block. (Test: `returns kind:"malformed" when a 200 payload violates the canonical schema`)
- **transport failures remain upstream errors**: Invalid JSON, network failures, timeouts, and non-2xx responses remain upstream-error rather than being classified as malformed. (Test: `keeps invalid JSON distinct as kind:"upstream-error"`)
- **controller preserves malformed**: The BFF maps malformed to a null policyInsight envelope with unavailableReason malformed. (Test: `maps malformed to { policyInsight: null, unavailableReason: "malformed" }`)
- **client accepts typed malformed envelope**: The app client accepts a null malformed envelope while continuing to reject malformed top-level or embedded block data. (Test: `returns { policyInsight: null, unavailableReason } for malformed`)
- **malformed fails closed in UI**: The UI renders stable malformed unavailable copy and never partially renders rejected policy fields. (Test: `renders fail-closed unavailable copy for malformed`)
- **unavailable states stay distinct**: Not-found, store, config, malformed, and upstream outcomes have distinct bounded copy and all preserve independent deterministic monitoring. (Test: `renders distinct bounded copy for every unavailable reason`)

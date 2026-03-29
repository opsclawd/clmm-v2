# CLMM V2 — Epic Implementation Review & Remediation Plan

**Date:** 2026-03-28
**Scope:** Full MVP audit across Epics 1–8
**Branch:** `superpowers-v2`
**Verdict:** PARTIALLY COMPLIANT — 5 blocking issues, 8 drift items

---

## 1. Executive Summary

The CLMM V2 implementation is substantially complete. All 7 packages and 1 app exist with correct monorepo wiring. The domain model is fully implemented with the core directional exit policy invariant properly enforced. Application use cases, infrastructure adapters, UI components, and the Expo app shell are all present. **193 tests pass across 46 test files**, typecheck passes, lint passes with warnings only, and dependency-cruiser boundary checks pass.

However, the audit identified **5 blocking issues** that prevent full spec compliance, plus **8 drift items** where the implementation works but diverges from the epic specifications.

### Verification Results (fresh run)

| Check | Command | Exit Code | Status |
|---|---|---|---|
| Package structure | `ls packages/` | 0 | PASS |
| Barrel exports | glob `packages/*/src/index.ts` | — | PASS |
| Full build (`turbo build`) | `pnpm run build` | **1** | **FAIL** |
| Library build (no app) | `pnpm --filter ...` | 0 | PASS |
| Tests (`turbo test`) | `pnpm run test` | 0 | PASS (193/193) |
| Lint (`turbo lint`) | `pnpm run lint` | 0 | PASS (15 warnings) |
| Typecheck (`turbo typecheck`) | `pnpm run typecheck` | 0 | PASS |
| Boundaries (`depcruise`) | `pnpm run boundaries` | 0 | PASS |
| CI config (`.github/workflows/`) | glob | — | **MISSING** |

---

## 2. Blocking Issues (FAIL)

### FAIL-1: App build fails — Metro cannot resolve `.js` imports to `.tsx` files

**Severity:** Critical
**Evidence:** `pnpm run build` exits 1. Metro bundler cannot resolve `./screens/PositionsListScreen.js` from `packages/ui/src/index.ts`. The screen files exist as `.tsx` but Metro does not follow TypeScript's `moduleResolution: "NodeNext"` convention.

**Root cause:** `packages/ui/src/index.ts` uses `.js` extension imports (standard for `NodeNext` module resolution), but Metro bundler used by Expo does not resolve `.js` → `.tsx`.

**Fix:** Either:
- (a) Add Metro resolver configuration in `apps/app/metro.config.js` to handle `.js` → `.tsx` resolution, OR
- (b) Change the UI package barrel to use extensionless imports and adjust `tsconfig` accordingly, OR
- (c) Add an explicit `exports` field to `packages/ui/package.json` mapping entry points

### FAIL-2: UI package imports directly from `@clmm/domain` — boundary violation

**Severity:** High
**Evidence:** 10 files in `packages/ui/src/` import directly from `@clmm/domain`:
- `DirectionalPolicyCardUtils.ts` imports `applyDirectionalExitPolicy`, `LOWER_BOUND_BREACH`, `UPPER_BOUND_BREACH`
- Multiple view models import `BreachDirection`, `ExecutionLifecycleState`, `makeClockTimestamp`
- `@clmm/domain` is NOT declared in `packages/ui/package.json` dependencies

**Epic rule:** UI must import only from `@clmm/application/public`, never from `@clmm/domain` directly.

**Note:** The epic's own `DirectionalPolicyCard` code example calls `applyDirectionalExitPolicy()` from domain, creating an internal spec contradiction. The fix should re-export needed types/functions through `@clmm/application/public`.

**Fix:**
1. Add all domain types needed by UI to `packages/application/src/public/index.ts` as re-exports
2. Update all 10 UI files to import from `@clmm/application/public` instead of `@clmm/domain`
3. Add boundary rule to dep-cruiser and ESLint: `packages/ui` must NOT import `@clmm/domain`

### FAIL-3: No co-located use-case tests in `packages/application/`

**Severity:** Medium
**Evidence:** Epic 3 requires `.test.ts` files co-located next to each use case (e.g., `use-cases/positions/ListSupportedPositions.test.ts`). Zero test files exist in `packages/application/src/`. All 25 use-case tests were moved to `packages/testing/src/scenarios/` instead.

`@clmm/application` has 0 test files, 0 tests. It exits 0 on `pnpm test` because there's nothing to run.

**Fix:** Either:
- (a) Move use-case tests back to co-located positions per spec (preferred for spec compliance), OR
- (b) Accept the current structure as an intentional deviation and document it

**Dependency implication:** If tests move back, `@clmm/application` needs `@clmm/testing` in `devDependencies` (currently missing — see FAIL-4).

### FAIL-4: `@clmm/application` missing `@clmm/testing` devDependency

**Severity:** Low (blocked by FAIL-3 decision)
**Evidence:** Epic 3 requires `@clmm/application` to have `"@clmm/testing": "workspace:*"` in `devDependencies`. Currently absent.
**Fix:** Add `"@clmm/testing": "workspace:*"` to `packages/application/package.json` devDependencies.

### FAIL-5: No CI configuration

**Severity:** Medium
**Evidence:** No `.github/workflows/` directory exists. Epics 5–8 reference CI gates including build, test, typecheck, lint, and boundary checks.
**Fix:** Create `.github/workflows/ci.yml` running the standard turbo pipeline.

---

## 3. Drift & Substitutions (PARTIAL)

These items work but diverge from spec wording.

### DRIFT-1: ESLint type-safety rules disabled for adapters

`packages/config/eslint/index.js` lines 37–51 disable `no-explicit-any`, `no-unsafe-assignment`, `no-unsafe-argument`, `no-unsafe-call`, `no-unsafe-member-access`, `no-unsafe-return`, and more for ALL `packages/adapters/src/**` files. The spec requires `no-explicit-any: error` globally.

**Impact:** Adapters can use `any` freely, reducing type safety in the layer that interacts with external SDKs.
**Recommendation:** Tighten rules incrementally. At minimum, re-enable `no-explicit-any` and fix violations.

### DRIFT-2: `ExecutionPreparationPort` signature uses object bag

**Spec:** `prepareExecution(plan: ExecutionPlan, walletId: WalletId)`
**Actual:** `prepareExecution(params: { plan, walletId, positionId })`

Added `positionId` parameter and uses object pattern. Functionally sensible but deviates from spec.

### DRIFT-3: `ExecutionRepository.savePreview` adds `breachDirection` param

**Spec:** `savePreview(positionId, preview)`
**Actual:** `savePreview(positionId, preview, breachDirection)` — also `getPreview` returns `{ preview, positionId, breachDirection }` instead of `ExecutionPreview | null`.

New `StoredExecutionAttempt` wrapper type was introduced.

### DRIFT-4: `TriggerRepository` gains extra `deleteTrigger` method

Not in Epic 3 spec. Added for operational needs.

### DRIFT-5: Use-case directory reorganization

- Spec: `use-cases/history/GetExecutionHistory.ts` → Actual: `use-cases/execution/GetExecutionHistory.ts`
- Spec: `use-cases/notifications/AcknowledgeAlert.ts` → Actual: `use-cases/alerts/AcknowledgeAlert.ts` (+ `ListActionableAlerts.ts`)

### DRIFT-6: Banned concepts scanner factored into multiple files

Spec expects self-contained `banned-concepts.test.ts`. Actual splits logic into `banned-concepts.ts` (helper), `banned-concepts.test.ts`, and `banned-concepts.patterns.test.ts`.

### DRIFT-7: ESLint config path style

`.eslintrc.js` uses `'./packages/config/eslint/index.js'` path instead of `@clmm/config/eslint` package reference.

### DRIFT-8: `@clmm/testing` has `@clmm/application` in devDependencies not dependencies

Spec says `dependencies`. Minor dep-graph difference.

---

## 4. Full Compliance Matrix

### Epic 1: Repo Foundation & CI Guardrails

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| E1.1 | Root `package.json` with correct fields | PASS | |
| E1.2 | `pnpm-workspace.yaml` | PASS | |
| E1.3 | `turbo.json` with 6 tasks | PASS | |
| E1.4 | `.gitignore` | PASS | |
| E1.5 | Root `tsconfig.json` with composite refs | PASS | |
| E1.6 | `base.json` tsconfig (strict, composite) | PASS | |
| E1.7 | `nestjs.json` tsconfig | PASS | |
| E1.8 | `react-native.json` tsconfig | PASS | |
| E1.9 | ESLint config with `no-explicit-any: error` | PARTIAL | Disabled for adapters (DRIFT-1) |
| E1.10 | Boundary rules ESLint | PASS | |
| E1.11 | Root `.eslintrc.js` | PARTIAL | Path style differs (DRIFT-7) |
| E1.12 | Dependency cruiser config | PASS | |
| E1.13 | Banned concepts scanner | PARTIAL | Factored into multiple files (DRIFT-6) |
| E1.14 | 7 packages + 1 app exist | PASS | |
| E1.15 | NestJS BFF skeleton | PASS | |
| E1.16 | NestJS worker skeleton | PASS | |
| E1.17 | `AdaptersModule.ts` | PASS | |
| E1.18 | Expo app shell skeleton | PASS | |
| E1.19 | `app.json` Expo config | PASS | |
| E1.20 | Vitest configs for all packages | PASS | |
| E1.21 | Testing package barrels | PASS | |
| E1.22 | `@clmm/domain` zero runtime deps | PASS | |

### Epic 2: Domain Model

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| E2.1 | Branded value objects | PASS | |
| E2.2 | `BreachDirection` discriminated union | PASS | |
| E2.3 | `PostExitAssetPosture` + constants | PASS | |
| E2.4 | `AssetSymbol`, `TokenAmount` | PASS | |
| E2.5 | `LiquidityPosition`, `RangeBounds`, etc. | PASS | |
| E2.6 | `evaluateRangeState()` pure function | PASS | |
| E2.7 | Trigger types | PASS | |
| E2.8 | `TriggerQualificationService` + tests | PASS | |
| E2.9 | `DirectionalExitPolicyService` (core invariant) | PASS | |
| E2.10 | Exit policy exhaustive tests | PASS | 12 tests |
| E2.11 | Execution types | PASS | |
| E2.12 | `ExecutionPlanFactory` + tests | PASS | |
| E2.13 | `PreviewFreshnessPolicy` + tests | PASS | |
| E2.14 | `RetryBoundaryPolicy` + tests | PASS | |
| E2.15 | `ExecutionStateReducer` + tests | PASS | 9 valid + 6 forbidden transitions |
| E2.16 | History types | PASS | |
| E2.17 | Domain barrel exports | PASS | |

### Epic 3: Application Use Cases

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| E3.1 | Port interfaces | PASS | All 16+ ports present |
| E3.2 | `ExecutionPreparationPort` signature | PARTIAL | Object bag + extra param (DRIFT-2) |
| E3.3 | `ExecutionRepository.savePreview` signature | PARTIAL | Extra `breachDirection` param (DRIFT-3) |
| E3.4 | `TriggerRepository` extra method | PARTIAL | `deleteTrigger` added (DRIFT-4) |
| E3.5 | DTOs | PASS | |
| E3.6 | `public/index.ts` barrel | PASS | |
| E3.7 | Use case file map | PARTIAL | Directory reorg (DRIFT-5) |
| E3.8 | Co-located use-case tests | **FAIL** | Tests in `testing/` not `application/` (FAIL-3) |
| E3.9 | Tests use fake ports | PASS | 25 test files in testing package |
| E3.10 | All 16 fake ports | PASS | 17 fakes (16 spec + 1 extra) |
| E3.11 | Fixtures | PASS | |
| E3.12 | `@clmm/application` depends on `@clmm/domain` only | PASS | |
| E3.13 | `@clmm/application` devDepends on `@clmm/testing` | **FAIL** | Missing (FAIL-4) |
| E3.14 | `@clmm/testing` depends on `@clmm/application` | PARTIAL | In devDeps not deps (DRIFT-8) |

### Epic 4: Infrastructure Adapters

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| E4.1 | Drizzle schemas | PASS | |
| E4.2 | `db.ts` client factory | PASS | |
| E4.3 | `OperationalStorageAdapter` | PASS | |
| E4.4 | `OffChainHistoryStorageAdapter` | PASS | |
| E4.5 | `OrcaPositionReadAdapter` | PASS | |
| E4.6 | `SolanaRangeObservationAdapter` | PASS | |
| E4.7 | `JupiterQuoteAdapter` | PASS | Direction-preserving |
| E4.8 | Execution adapters | PASS | |
| E4.9 | Wallet signing adapters | PASS | |
| E4.10 | Notification adapters | PASS | |
| E4.11 | Capability adapters | PASS | |
| E4.12 | `TelemetryAdapter` | PASS | |
| E4.13 | HTTP controllers | PASS | |
| E4.14 | Job handlers | PASS | |
| E4.15 | Contract tests | PASS | |
| E4.16 | `drizzle.config.ts` | PASS | |
| E4.17 | No adapter decides breach direction | PASS | |
| E4.18 | Adapter dependencies correct | PASS | |

### Epics 5–8: App Shell, UI, Notifications, Integration

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| E5.1 | Root layout with TanStack Query | PASS | |
| E5.2 | Tab layout (3 tabs) | PASS | |
| E5.3 | Tab screens delegate to `@clmm/ui` | PASS | |
| E5.4 | Dynamic routes | PASS | |
| E5.5 | `queryClient.ts` | PASS | |
| E5.6 | Single composition entrypoint | PASS | |
| E5.7 | Platform capability selector | PASS | |
| E5.8 | Deep-link bootstrap | PASS | |
| E5.9 | App dependencies correct | PASS | |
| E5.10 | NativeWind config | PASS | |
| E6.1 | Design system tokens | PASS | |
| E6.2 | `DirectionalPolicyCard` + test | PARTIAL | Field name differs from spec example |
| E6.3 | `PreviewStepSequence` + test | PASS | |
| E6.4 | `RangeStatusBadge` + test | PASS | |
| E6.5 | `ExecutionStateCard`, `HistoryEventRow` | PASS | |
| E6.6 | View models (5) | PASS | |
| E6.7 | Presenters (2) | PASS | |
| E6.8 | Screens (8) | PASS | |
| E6.9 | UI must NOT import `@clmm/adapters` | PASS | |
| E6.10 | UI must NOT import `@clmm/domain` | **FAIL** | 10 files violate (FAIL-2) |
| E6.11 | VM tests | PASS | |
| E7.1 | Notification adapters | PASS | |
| E7.2 | Deep-link adapters | PASS | |
| E7.3 | `DispatchActionableNotification` | PASS | |
| E7.4 | Notification dispatch test | PASS | |
| E8.1 | `BreachToExitScenario` integration | PASS | |
| E8.2 | `StalePreviews` integration | PASS | |

---

## 5. Remediation Implementation Plan

### Phase 1: Critical — Fix App Build (FAIL-1)

**Priority:** P0 — blocks `pnpm run build`
**Estimated scope:** 1–2 files

1. Diagnose Metro resolution: check `apps/app/metro.config.js` (if exists) and `packages/ui/tsconfig.json`
2. Fix: either configure Metro resolver for `.js` → `.tsx` resolution, or switch UI barrel to extensionless imports
3. Verify: `pnpm run build` exits 0

### Phase 2: High — Fix UI Boundary Violation (FAIL-2)

**Priority:** P1 — architectural integrity
**Estimated scope:** ~12 files

1. Identify all domain types/functions used by UI:
   - `applyDirectionalExitPolicy`, `DirectionalExitPolicyService`
   - `BreachDirection`, `LOWER_BOUND_BREACH`, `UPPER_BOUND_BREACH`
   - `ExecutionLifecycleState`, `makeClockTimestamp`
   - Other domain types imported directly
2. Re-export these from `packages/application/src/public/index.ts`
3. Update all 10 UI files to import from `@clmm/application/public`
4. Add boundary enforcement:
   - Add dep-cruiser rule: `ui-no-domain` blocking `packages/ui` → `@clmm/domain`
   - Add ESLint boundary rule for same
5. Verify: `pnpm run boundaries` still passes, no direct `@clmm/domain` imports in UI

### Phase 3: Medium — Resolve Test Location (FAIL-3 + FAIL-4)

**Priority:** P2 — spec compliance
**Estimated scope:** Decision + possible file moves

**Option A (spec-compliant):**
1. Copy/move the 25 use-case test files from `packages/testing/src/scenarios/` to co-located positions in `packages/application/src/use-cases/`
2. Add `"@clmm/testing": "workspace:*"` to `packages/application/package.json` devDependencies
3. Keep integration scenario tests (BreachToExitScenario, StalePreviews) in `packages/testing/`
4. Verify: `pnpm test` in `@clmm/application` runs the co-located tests

**Option B (accept deviation):**
1. Document the decision to centralize all use-case tests in `packages/testing/`
2. Still add `@clmm/testing` devDep to `packages/application` if any cross-package test support is needed

### Phase 4: Medium — Add CI Configuration (FAIL-5)

**Priority:** P2
**Estimated scope:** 1 new file

Create `.github/workflows/ci.yml`:
```yaml
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run typecheck
      - run: pnpm run lint
      - run: pnpm run boundaries
      - run: pnpm run test
      - run: pnpm run build
```

### Phase 5: Low — Tighten ESLint for Adapters (DRIFT-1)

**Priority:** P3
**Estimated scope:** Fix `any` usages in adapters, then remove overrides

1. Re-enable `no-explicit-any: error` for `packages/adapters/src/**`
2. Fix all `any` type violations with proper types
3. Progressively re-enable other disabled rules
4. Verify: `pnpm run lint` passes without the override block

### Phase 6: Low — Address Remaining Drift

**Priority:** P3 — cosmetic/documentation

| Drift | Action |
|-------|--------|
| DRIFT-2: Port signature object bag | Accept — document as intentional improvement |
| DRIFT-3: Extra `breachDirection` on storage | Accept — operationally necessary |
| DRIFT-4: Extra `deleteTrigger` method | Accept — operationally necessary |
| DRIFT-5: Directory reorg | Accept — document mapping |
| DRIFT-6: Banned concepts factoring | Accept — same functionality |
| DRIFT-7: ESLint path style | Accept — functionally equivalent |
| DRIFT-8: testing dep type | Fix: move `@clmm/application` from devDeps to deps in `packages/testing/package.json` |

---

## 6. Unverifiable Items

| Item | Reason |
|------|--------|
| Adapter correctness against real Solana/Jupiter APIs | No devnet integration tests |
| `DirectionalExitPolicyService` 100% branch coverage | `/* v8 ignore next 6 */` pragma excludes exhaustiveness branch |
| Boundary enforcement catches UI→domain | Current dep-cruiser rules do NOT block `@clmm/domain` from UI |
| Expo app runtime behavior | Build fails; cannot verify runtime |

---

## 7. Final Bottom Line

### What is truly done
- Complete domain model with core invariant (directional exit policy) fully tested
- All application use cases implemented with 25 passing test scenarios
- Full adapter layer: Solana, Orca, Jupiter, Drizzle storage, NestJS controllers/jobs
- UI layer: 8 screens, 5 view models, 2 presenters, design system, 5 tested components
- Expo app shell with correct composition root pattern
- 193 tests passing, typecheck clean, lint clean, boundary checks passing

### What is missing
- Working full build (Metro resolution issue)
- UI→domain boundary enforcement
- Co-located application tests (or documented deviation)
- CI pipeline configuration
- Adapter ESLint strictness

### What blocks MVP compliance
1. **Fix the app build** (Phase 1) — nothing ships if it doesn't build
2. **Fix the UI boundary violation** (Phase 2) — core architectural principle
3. **Decide on test location** (Phase 3) — spec compliance vs pragmatism

Phases 1–3 are required for spec compliance. Phases 4–6 are recommended improvements.

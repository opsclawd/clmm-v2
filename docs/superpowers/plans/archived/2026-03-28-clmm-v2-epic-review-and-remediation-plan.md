# CLMM V2 Epic Implementation Review & Remediation Plan

**Date:** 2026-03-28
**Branch:** `superpowers-v2`
**Reviewer:** Claude (Epic Implementation Review)
**Scope:** Epics 1-8 (Foundation through Hardening)

---

## 1. Verdict

**PARTIALLY COMPLIANT**

The CLMM V2 implementation delivers strong foundations: the hexagonal architecture is enforced, the core domain invariant (directional exit policy) is correct with 100% branch coverage, all 164 tests pass, and dependency-cruiser confirms zero boundary violations across 460 modules. However, the implementation is missing approximately 9 application use cases, 8 UI components/view models, all colocated application tests, and has 2 build/lint failures that block a clean CI pass. The project is estimated at ~75% of the spec-defined MVP scope.

---

## 2. Executive Failures

| Priority | Issue | Impact |
|----------|-------|--------|
| **P0** | `pnpm build` fails -- `@clmm/app` missing `react-native-web` dependency | Expo web build broken |
| **P0** | `pnpm lint` fails -- unused `ExecutionAttempt` import in `FakeExecutionRepository.ts` | CI gate failure |
| **P1** | 9 application use cases missing (wallet, position detail, execution signing flow) | Core user journeys incomplete |
| **P1** | Zero application-layer test files (spec requires 10+ colocated tests) | No use-case-level test coverage |
| **P1** | 5 missing fake ports in `@clmm/testing` | Cannot test missing use cases |
| **P2** | 8 UI components/view models missing (RangeStatusBadge, ExecutionStateCard, HistoryEventRow, presenters, view models) | UI screens are shells without full rendering logic |
| **P2** | `ExecutionStateViewModel` behavioral deviations from spec (abandoned isTerminal, showRetry logic) | Incorrect UX for terminal/retryable states |
| **P2** | `drizzle-orm` and `postgres` not in `@clmm/adapters` runtime dependencies | Will fail at runtime when DB adapter is invoked |
| **P3** | Application test relocation (colocated -> testing/scenarios) | Architectural drift from spec |
| **P3** | Missing `fixtures/triggers.ts` and `fixtures/previews.ts` | Fixture data incomplete |

---

## 3. Compliance Matrix

### Epic 1: Repo Foundation & CI Guardrails

| ID | Category | Requirement | Expected | Actual Evidence | Status |
|----|----------|-------------|----------|-----------------|--------|
| E1-001 | File map | Root `package.json` with name, private, packageManager | Exact fields | Present, matches | **PASS** |
| E1-002 | File map | `pnpm-workspace.yaml` | `apps/*`, `packages/*` | Exact match | **PASS** |
| E1-003 | File map | `turbo.json` with all tasks | build, test, typecheck, lint, boundaries, dev | Present | **PASS** |
| E1-004 | File map | `.gitignore` | All required patterns | Present + extra `.worktrees` | **PASS** |
| E1-005 | Config | `@clmm/config` package with exports | tsconfig/*, eslint, boundaries | Present | **PASS** |
| E1-006 | Config | tsconfig/base.json strict flags | All strict flags | Exact match | **PASS** |
| E1-007 | Config | tsconfig/nestjs.json | NestJS-specific config | Exact match | **PASS** |
| E1-008 | Config | tsconfig/react-native.json | RN-specific config | Exact match | **PASS** |
| E1-009 | File map | All 7 package.json files | name, deps correct | 5 PASS, 2 PARTIAL (application missing testing devDep; adapters missing drizzle-orm) | **PARTIAL** |
| E1-010 | Config | Root tsconfig.json composite refs | 7 references | All present | **PASS** |
| E1-011 | Config | ESLint config + boundary-rules | .eslintrc.js, boundary-rules.js | Present | **PASS** |
| E1-012 | Config | dependency-cruiser rules | 5 forbidden rules | All present | **PASS** |
| E1-013 | Config | Banned-concept scanner | Test file scanning all dirs | Present, 9 tests pass | **PASS** |
| E1-014 | Config | Vitest configs for all packages | 6 vitest.config.ts | All present | **PASS** |
| E1-015 | File map | NestJS BFF + Worker skeletons | main.ts, AppModule, WorkerModule | All present | **PASS** |
| E1-016 | File map | Expo app shell skeleton | _layout.tsx, app.json, composition | All present | **PASS** |
| E1-017 | File map | Testing sub-barrels | fakes/, fixtures/, scenarios/, contracts/ | All present | **PASS** |
| E1-018 | Done-when | `pnpm typecheck` exits 0 | Exit 0 | Exit 0 (10 tasks) | **PASS** |
| E1-019 | Done-when | `pnpm boundaries` exits 0 | Exit 0 | Exit 0 (460 modules, 0 violations) | **PASS** |
| E1-020 | Done-when | `pnpm test` exits 0 | Exit 0 | Exit 0 (164 tests) | **PASS** |
| E1-021 | Done-when | `pnpm lint` exits 0 | Exit 0 | Exit 1 (1 unused import) | **FAIL** |

### Epic 2: Domain Model

| ID | Category | Requirement | Expected | Actual Evidence | Status |
|----|----------|-------------|----------|-----------------|--------|
| E2-001 | File map | shared/index.ts (branded IDs, enums) | All types | Exact match | **PASS** |
| E2-002 | File map | positions/index.ts | LiquidityPosition, RangeBounds, etc. | Present | **PASS** |
| E2-003 | File map | triggers/index.ts | BreachEpisode, ExitTrigger, etc. | Present | **PASS** |
| E2-004 | File map | TriggerQualificationService + test | Service + test file | Both present, tests pass | **PASS** |
| E2-005 | Structural | DirectionalExitPolicyService (CORE INVARIANT) | Lower->USDC+SOL->USDC, Upper->SOL+USDC->SOL | Exact match, exhaustive switch | **PASS** |
| E2-006 | Tests | DirectionalExitPolicyService.test.ts | Both directions, step order, non-identical | All test cases present | **PASS** |
| E2-007 | File map | ExecutionPlanFactory + test | Service + test | Both present | **PASS** |
| E2-008 | File map | PreviewFreshnessPolicy + test | Service + test | Both present | **PASS** |
| E2-009 | File map | RetryBoundaryPolicy + test | Service + test | Both present | **PASS** |
| E2-010 | File map | ExecutionStateReducer + test | Service + test, valid AND forbidden transitions | Both present | **PASS** |
| E2-011 | File map | history/index.ts | All types | Present | **PASS** |
| E2-012 | Structural | Domain barrel exports | All re-exports | Match spec | **PASS** |
| E2-013 | Boundary | Zero external dependencies | No @solana/*, react, etc. | Verified clean | **PASS** |
| E2-014 | Done-when | 100% branch coverage on DirectionalExitPolicyService | 100% branch | 100% confirmed via coverage run | **PASS** |
| E2-015 | Done-when | No banned concepts in domain | Clean scan | 9/9 config tests pass | **PASS** |

### Epic 3: Application Use Cases

| ID | Category | Requirement | Expected | Actual Evidence | Status |
|----|----------|-------------|----------|-----------------|--------|
| E3-001 | File map | ports/index.ts | All port interfaces | Present + extras (StoredExecutionAttempt, deleteTrigger) | **PASS** |
| E3-002 | File map | dto/index.ts | DTOs | Present | **PASS** |
| E3-003 | File map | public/index.ts barrel | Re-exports | Present | **PASS** |
| E3-004 | File map | ScanPositionsForBreaches | Use case | Present | **PASS** |
| E3-005 | File map | QualifyActionableTrigger | Use case | Present | **PASS** |
| E3-006 | File map | CreateExecutionPreview | Use case | Present | **PASS** |
| E3-007 | File map | RefreshExecutionPreview | Use case | Present | **PASS** |
| E3-008 | File map | GetExecutionPreview | Use case | Present | **PASS** |
| E3-009 | File map | ApproveExecution | Use case | Present | **PASS** |
| E3-010 | File map | ReconcileExecutionAttempt | Use case | Present | **PASS** |
| E3-011 | File map | GetExecutionAttemptDetail | Use case | Present | **PASS** |
| E3-012 | File map | RecordExecutionAbandonment | Use case | Present | **PASS** |
| E3-013 | File map | DispatchActionableNotification | Use case | Present | **PASS** |
| E3-014 | File map | ListSupportedPositions | Use case | Present | **PASS** |
| E3-015 | File map | ListActionableAlerts | Use case | Present at `alerts/` not `triggers/` | **PARTIAL** |
| E3-016 | File map | AcknowledgeAlert | Use case | Present at `alerts/` not `notifications/` | **PARTIAL** |
| E3-017 | File map | GetExecutionHistory | Use case | Present at `execution/` not `history/` | **PARTIAL** |
| E3-018 | File map | GetPositionDetail | Use case | **Not found** | **FAIL** |
| E3-019 | File map | GetMonitoringReadiness | Use case | **Not found** | **FAIL** |
| E3-020 | File map | RequestWalletSignature | Use case | **Not found** | **FAIL** |
| E3-021 | File map | SubmitExecutionAttempt | Use case | **Not found** | **FAIL** |
| E3-022 | File map | RecordSignatureDecline | Use case | **Not found** | **FAIL** |
| E3-023 | File map | ResumeExecutionAttempt | Use case | **Not found** | **FAIL** |
| E3-024 | File map | ResolveExecutionEntryContext | Use case | **Not found** | **FAIL** |
| E3-025 | File map | ConnectWalletSession | Use case | **Not found** | **FAIL** |
| E3-026 | File map | SyncPlatformCapabilities | Use case | **Not found** | **FAIL** |
| E3-027 | Tests | Colocated application test files (10+) | `.test.ts` in `application/src/` | Zero test files in application/src | **FAIL** |
| E3-028 | File map | All 16 fake ports | In testing/fakes/ | 11/16 present, 5 missing | **PARTIAL** |
| E3-029 | File map | fixtures/triggers.ts, fixtures/previews.ts | Fixture data | Missing both | **FAIL** |
| E3-030 | Config | `@clmm/testing` as application devDep | In package.json | Missing | **FAIL** |

### Epic 4: Infrastructure Adapters

| ID | Category | Requirement | Expected | Actual Evidence | Status |
|----|----------|-------------|----------|-----------------|--------|
| E4-001 | File map | Drizzle schema files (4) + barrel | triggers, previews, executions, history | All present | **PASS** |
| E4-002 | File map | db.ts | Database connection | Present | **PASS** |
| E4-003 | File map | drizzle.config.ts at root | Config | Present | **PASS** |
| E4-004 | File map | OperationalStorageAdapter | Implements TriggerRepo + ExecutionRepo | Present | **PASS** |
| E4-005 | File map | OffChainHistoryStorageAdapter | Implements ExecutionHistoryRepository | Present | **PASS** |
| E4-006 | File map | TelemetryAdapter | Implements ObservabilityPort | Present | **PASS** |
| E4-007 | File map | All Solana adapters (Orca, Jupiter, Range, Exec Prep, Exec Submit) | 5 adapters | All present (some stubs) | **PASS** |
| E4-008 | File map | Wallet signing adapters (Native, Browser) | 2 adapters | Both present | **PASS** |
| E4-009 | File map | Notification adapters (ExpoPush, WebPush, InApp) | 3 adapters | All present | **PASS** |
| E4-010 | File map | Platform adapters (Capability, Permission, DeepLink x2) | 6 adapters | All present | **PASS** |
| E4-011 | File map | NestJS BFF controllers (Position, Preview, Execution, Alert) | 4 controllers | All present | **PASS** |
| E4-012 | File map | Job handlers (Breach, Qualification, Reconciliation, Notification) | 4 handlers | All present | **PASS** |
| E4-013 | File map | AppModule + WorkerModule | NestJS modules | Both present | **PASS** |
| E4-014 | Tests | Contract tests (Storage, PositionRead, WalletSigning) | 3 contracts | All present in testing/contracts/ | **PASS** |
| E4-015 | Config | drizzle-orm + postgres in adapters deps | Runtime dependencies | **Missing** | **FAIL** |
| E4-016 | Structural | Adapters barrel export completeness | All adapters exported | Only 5 of ~20 exported | **PARTIAL** |
| E4-017 | Structural | Adapters must not decide breach direction | No policy logic in adapters | Verified clean | **PASS** |

### Epic 5: Expo Universal App Shell

| ID | Category | Requirement | Expected | Actual Evidence | Status |
|----|----------|-------------|----------|-----------------|--------|
| E5-001 | File map | app.json with scheme: clmmv2 | Config | Present | **PASS** |
| E5-002 | File map | Root layout with TanStack Query | _layout.tsx | Present | **PASS** |
| E5-003 | File map | Tab layout (positions, alerts, history) | 3 tabs | Present | **PASS** |
| E5-004 | File map | Dynamic routes (position, preview, execution) | 3 routes | Present | **PASS** |
| E5-005 | File map | Composition bootstrap | queryClient.ts, index.ts | Present | **PASS** |
| E5-006 | File map | Platform capabilities + deepLinks | 2 files | Present | **PASS** |
| E5-007 | Config | tailwind.config.js | Tailwind config | Present | **PASS** |
| E5-008 | Done-when | `pnpm build` includes app | Expo export succeeds | **Fails** -- missing `react-native-web` | **FAIL** |

### Epic 6: Core Feature UI

| ID | Category | Requirement | Expected | Actual Evidence | Status |
|----|----------|-------------|----------|-----------------|--------|
| E6-001 | File map | design-system/colors.ts | Color tokens | Present | **PASS** |
| E6-002 | File map | design-system/typography.ts | Typography tokens | **Not found** | **FAIL** |
| E6-003 | File map | DirectionalPolicyCard + test | Component + test | Present (util split into separate file) | **PASS** |
| E6-004 | File map | PreviewStepSequence + test | Component + test | Present (util split into separate file) | **PASS** |
| E6-005 | File map | RangeStatusBadge | Component | **Not found** | **FAIL** |
| E6-006 | File map | ExecutionStateCard | Component | **Not found** | **FAIL** |
| E6-007 | File map | HistoryEventRow | Component | **Not found** | **FAIL** |
| E6-008 | File map | PreviewViewModel + test | View model + test | Present | **PASS** |
| E6-009 | File map | ExecutionStateViewModel + test | View model + test | Present but behavioral deviations | **PARTIAL** |
| E6-010 | File map | PositionListViewModel | View model | **Not found** | **FAIL** |
| E6-011 | File map | PositionDetailViewModel | View model | **Not found** | **FAIL** |
| E6-012 | File map | HistoryViewModel | View model | **Not found** | **FAIL** |
| E6-013 | File map | PositionDetailPresenter | Presenter | **Not found** | **FAIL** |
| E6-014 | File map | PreviewPresenter | Presenter | **Not found** | **FAIL** |
| E6-015 | File map | All 8 screen stubs | Screens | All present | **PASS** |
| E6-016 | Structural | UI public barrel exports | Complete exports | Present | **PASS** |

### Epic 7: Notifications

| ID | Category | Requirement | Expected | Actual Evidence | Status |
|----|----------|-------------|----------|-----------------|--------|
| E7-001 | Structural | ExpoPush includes direction in copy | Direction string | Present in stub | **PASS** |
| E7-002 | File map | InAppAlertAdapter | Fallback alert display | Present | **PASS** |
| E7-003 | File map | NativeNotificationPermissionAdapter | Permission handling | Present | **PASS** |
| E7-004 | Tests | Notification duplicate suppression test | Test file | Present and passing | **PASS** |

### Epic 8: Hardening & Smoke Tests

| ID | Category | Requirement | Expected | Actual Evidence | Status |
|----|----------|-------------|----------|-----------------|--------|
| E8-001 | Tests | BreachToExitScenario + test (both directions) | End-to-end scenario | Present, tests both directions | **PASS** |
| E8-002 | Tests | StalePreviews.test.ts | Stale preview scenario | Present | **PASS** |
| E8-003 | File map | Release checklist | docs/architecture/ | Present | **PASS** |
| E8-004 | Done-when | All CI gates pass | Clean CI | **Blocked** by lint + build failures | **FAIL** |

---

## 4. Verification Log

| Command | Purpose | Exit Code | Decisive Output | Result |
|---------|---------|-----------|-----------------|--------|
| `pnpm run typecheck` | TypeScript compilation | 0 | 10 tasks successful | **PASS** |
| `pnpm run build` | Full build including Expo | 1 | `@clmm/app` fails: missing `react-native-web` | **FAIL** |
| `pnpm run test` | All test suites | 0 | 164 tests, 0 failures | **PASS** |
| `pnpm run lint` | ESLint all packages | 1 | 1 error: unused `ExecutionAttempt` import in FakeExecutionRepository.ts | **FAIL** |
| `pnpm run boundaries` | dependency-cruiser | 0 | 460 modules, 0 violations | **PASS** |
| `pnpm --filter @clmm/domain test -- --coverage` | Domain coverage | 0 | DirectionalExitPolicyService: 100% branch | **PASS** |
| `pnpm --filter @clmm/config test` | Banned concepts | 0 | 9 tests passed | **PASS** |

---

## 5. Drift and Substitutions

| # | Drift | Spec Says | Implementation Does | Severity |
|---|-------|-----------|---------------------|----------|
| D1 | Application test relocation | Colocated `.test.ts` files in `application/src/use-cases/` | Tests moved to `testing/src/scenarios/` | Medium -- architectural pattern divergence |
| D2 | DirectionalPolicyCard function split | `renderDirectionalPolicyText` inside component file | Extracted to `DirectionalPolicyCardUtils.ts` | Low -- same for PreviewStepSequence |
| D3 | ExecutionRepository.savePreview signature | `savePreview(positionId, preview)` | `savePreview(positionId, preview, breachDirection)` -- extra param | Medium -- API surface change |
| D4 | StoredExecutionAttempt type | Not in spec | Added to ports with `breachDirection` | Low -- additive |
| D5 | TriggerRepository.deleteTrigger | Not in spec | Added extra method | Low -- additive |
| D6 | ListActionableAlerts location | `use-cases/triggers/` | `use-cases/alerts/` | Low -- reasonable reorganization |
| D7 | AcknowledgeAlert location | `use-cases/notifications/` | `use-cases/alerts/` | Low -- reasonable reorganization |
| D8 | GetExecutionHistory location | `use-cases/history/` | `use-cases/execution/` | Low -- reasonable reorganization |
| D9 | ExecutionStateViewModel.abandoned.isTerminal | `true` | `false` | **High -- behavioral bug** |
| D10 | ExecutionStateViewModel.showRetry logic | `retryEligible` parameter | Unconditional `true` | **High -- behavioral bug** |

---

## 6. Unverifiable Items

| Item | Reason |
|------|--------|
| Expo app runs on physical device | `react-native-web` missing, cannot verify |
| Deep link routing works end-to-end | App build blocked |
| Push notification delivery | ExpoPush is a console.warn stub |
| Actual Solana RPC calls | Orca/Jupiter adapters are stubs with TODOs |
| Database migrations run clean | No migration files generated yet |

---

## 7. Final Bottom Line

### What Is Truly Done
- **Hexagonal architecture** fully enforced (460 modules, 0 boundary violations)
- **Core domain invariant** (directional exit policy) correct with 100% branch coverage
- **Domain layer** complete with all services, value objects, and exhaustive tests (49 tests)
- **12 of 21 application use cases** implemented
- **All infrastructure adapters** scaffolded (some as stubs with TODOs)
- **NestJS BFF + Worker** fully wired with controllers and job handlers
- **Expo app shell** structured with routing, tabs, and composition
- **Banned concept scanner + dependency-cruiser** active and passing
- **164 tests passing** across all packages
- **Contract tests** for storage, position read, and wallet signing

### What Is Missing
- **9 application use cases** (wallet, position detail, execution signing flow)
- **All colocated application tests** (0 test files in application/src)
- **5 fake ports** needed for testing missing use cases
- **2 fixture files** (triggers, previews)
- **8 UI components/view models/presenters** (RangeStatusBadge, ExecutionStateCard, HistoryEventRow, typography, presenters, position/history view models)
- **2 behavioral bugs** in ExecutionStateViewModel

### What Blocks Compliance
1. **Lint failure** -- trivial one-line fix
2. **Build failure** -- missing `react-native-web` dependency
3. **Missing use cases** -- 9 files need implementation
4. **Missing tests** -- application layer has zero test coverage
5. **Missing UI components** -- screens cannot render full UX

---

## 8. Remediation Plan

### Phase 1: CI Green (Priority: Immediate)

**Estimated effort: Small**

| Task | File | Action |
|------|------|--------|
| 1.1 | `packages/testing/src/fakes/FakeExecutionRepository.ts` | Remove unused `ExecutionAttempt` import |
| 1.2 | `apps/app/package.json` | Add `react-native-web@~0.19.13` dependency |
| 1.3 | `packages/adapters/package.json` | Add `drizzle-orm` and `postgres` to runtime dependencies |
| 1.4 | `packages/application/package.json` | Add `@clmm/testing` as devDependency |
| 1.5 | Verify | Run `pnpm install && pnpm build && pnpm lint && pnpm test` -- all must exit 0 |

### Phase 2: Behavioral Bug Fixes (Priority: High)

**Estimated effort: Small**

| Task | File | Action |
|------|------|--------|
| 2.1 | `packages/ui/src/view-models/ExecutionStateViewModel.ts` | Fix `abandoned` state: set `isTerminal: true` per spec |
| 2.2 | `packages/ui/src/view-models/ExecutionStateViewModel.ts` | Fix `failed` and `expired` states: use `retryEligible` parameter for `showRetry` |
| 2.3 | `packages/ui/src/view-models/ExecutionStateViewModel.test.ts` | Update tests to verify corrected behavior |

### Phase 3: Missing Application Use Cases (Priority: High)

**Estimated effort: Medium**

Implement in dependency order:

| Task | Use Case | Location | Dependencies |
|------|----------|----------|-------------|
| 3.1 | `GetPositionDetail` | `application/src/use-cases/positions/` | PositionReadPort |
| 3.2 | `GetMonitoringReadiness` | `application/src/use-cases/positions/` | PositionReadPort, RangeObservationPort |
| 3.3 | `ConnectWalletSession` | `application/src/use-cases/wallet/` | WalletSigningPort |
| 3.4 | `SyncPlatformCapabilities` | `application/src/use-cases/wallet/` | PlatformCapabilityPort |
| 3.5 | `ResolveExecutionEntryContext` | `application/src/use-cases/execution/` | DeepLinkEntryPort, ExecutionRepository |
| 3.6 | `RequestWalletSignature` | `application/src/use-cases/execution/` | WalletSigningPort, ExecutionRepository |
| 3.7 | `SubmitExecutionAttempt` | `application/src/use-cases/execution/` | ExecutionSubmissionPort, ExecutionRepository |
| 3.8 | `RecordSignatureDecline` | `application/src/use-cases/execution/` | ExecutionRepository |
| 3.9 | `ResumeExecutionAttempt` | `application/src/use-cases/execution/` | ExecutionRepository, ExecutionSubmissionPort |

### Phase 4: Missing Fakes & Fixtures (Priority: High)

**Estimated effort: Small**

| Task | File | Action |
|------|------|--------|
| 4.1 | `testing/src/fakes/FakeRangeObservationPort.ts` | Implement fake |
| 4.2 | `testing/src/fakes/FakeDeepLinkEntryPort.ts` | Implement fake |
| 4.3 | `testing/src/fakes/FakeExecutionSessionRepository.ts` | Implement fake |
| 4.4 | `testing/src/fakes/FakePlatformCapabilityPort.ts` | Implement fake |
| 4.5 | `testing/src/fakes/FakeNotificationPermissionPort.ts` | Implement fake |
| 4.6 | `testing/src/fixtures/triggers.ts` | Create trigger fixture data |
| 4.7 | `testing/src/fixtures/previews.ts` | Create preview fixture data |

### Phase 5: Application Tests (Priority: High)

**Decision required:** The spec requires colocated tests in `application/src/use-cases/**/*.test.ts`. Current tests live in `testing/src/scenarios/`. Options:

- **Option A (Spec-compliant):** Create colocated test files in application/src alongside each use case. Keep scenario tests in testing/ as integration-level tests.
- **Option B (Accept drift):** Document the architectural decision to centralize all use-case tests in testing/scenarios. Update spec.

Regardless of decision, the following test files are needed (at minimum):

| Task | Test File | Covers |
|------|-----------|--------|
| 5.1 | `ScanPositionsForBreaches.test.ts` | Breach detection flow |
| 5.2 | `QualifyActionableTrigger.test.ts` | Trigger qualification |
| 5.3 | `CreateExecutionPreview.test.ts` | Preview creation |
| 5.4 | `RefreshExecutionPreview.test.ts` | Preview refresh |
| 5.5 | `ApproveExecution.test.ts` | Execution approval |
| 5.6 | `ReconcileExecutionAttempt.test.ts` | Reconciliation |
| 5.7 | `RequestWalletSignature.test.ts` | Wallet signing (new) |
| 5.8 | `SubmitExecutionAttempt.test.ts` | Execution submission (new) |
| 5.9 | `ResumeExecutionAttempt.test.ts` | Execution resume (new) |
| 5.10 | `ResolveExecutionEntryContext.test.ts` | Deep link entry (new) |
| 5.11 | `DispatchActionableNotification.test.ts` | Notification dispatch |
| 5.12 | `ListSupportedPositions.test.ts` | Position listing |

### Phase 6: Missing UI Components (Priority: Medium)

**Estimated effort: Medium**

| Task | File | Description |
|------|------|-------------|
| 6.1 | `ui/src/design-system/typography.ts` | Typography tokens (font sizes, weights, line heights) |
| 6.2 | `ui/src/components/RangeStatusBadge.tsx` | Shows in-range / out-of-range / breach status |
| 6.3 | `ui/src/components/ExecutionStateCard.tsx` | Displays execution state with actions |
| 6.4 | `ui/src/components/HistoryEventRow.tsx` | Single row in history list |
| 6.5 | `ui/src/view-models/PositionListViewModel.ts` | Transforms position data for list display |
| 6.6 | `ui/src/view-models/PositionDetailViewModel.ts` | Transforms position data for detail display |
| 6.7 | `ui/src/view-models/HistoryViewModel.ts` | Transforms history data for list display |
| 6.8 | `ui/src/presenters/PositionDetailPresenter.ts` | Orchestrates position detail screen data |
| 6.9 | `ui/src/presenters/PreviewPresenter.ts` | Orchestrates preview screen data |

### Phase 7: Adapter Completeness (Priority: Medium)

| Task | File | Action |
|------|------|--------|
| 7.1 | `adapters/src/index.ts` | Export all adapters (currently only 5 of ~20) |
| 7.2 | `adapters/src/outbound/solana/OrcaPositionReadAdapter.ts` | Replace TODO stub with real implementation |
| 7.3 | `adapters/src/outbound/solana/JupiterQuoteAdapter.ts` | Replace TODO stub with real implementation |
| 7.4 | `adapters/src/outbound/notifications/ExpoPushAdapter.ts` | Replace console.warn stub with real Expo push |
| 7.5 | Generate Drizzle migration files | `pnpm drizzle-kit generate` |

### Phase 8: Final Verification (Priority: Gate)

| Task | Command | Expected |
|------|---------|----------|
| 8.1 | `pnpm install` | Clean install |
| 8.2 | `pnpm typecheck` | Exit 0 |
| 8.3 | `pnpm build` | Exit 0 (including @clmm/app) |
| 8.4 | `pnpm test` | Exit 0, all tests pass |
| 8.5 | `pnpm lint` | Exit 0, zero errors |
| 8.6 | `pnpm boundaries` | Exit 0, zero violations |
| 8.7 | `pnpm --filter @clmm/domain test -- --coverage` | DirectionalExitPolicyService: 100% branch |

---

## 9. Summary Statistics

| Metric | Count |
|--------|-------|
| Total requirements audited | ~120 |
| PASS | ~85 (71%) |
| PARTIAL | ~10 (8%) |
| FAIL | ~25 (21%) |
| Tests passing | 164 |
| Boundary violations | 0 |
| Missing use cases | 9 |
| Missing UI files | 9 |
| Missing test files | 12+ |
| Behavioral bugs | 2 |
| CI blockers | 2 |

---

*Generated by Epic Implementation Review -- 2026-03-28*

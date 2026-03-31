# Working MVP End-to-End Out-of-Range Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining stubbed and disconnected monitoring, alert, preview, execution, history, and re-entry work so CLMM V2 behaves like a backend-triggered MVP from real out-of-range detection through explicit user-signed execution.

**Architecture:** Build the remaining MVP as vertical slices over the existing domain/application core. The backend becomes the source of truth for monitored wallets, triggers, previews, attempts, and history, while the app becomes a route-driven client that hydrates every stage from backend IDs instead of local assumptions.

**Tech Stack:** TypeScript strict mode, NestJS + Fastify, Drizzle ORM, pg-boss-style worker handlers, TanStack Query v5, Expo Router, React Native/Expo web, Vitest.

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `packages/adapters/src/outbound/storage/schema/monitored-wallets.ts` | Durable monitored-wallet registry schema |
| Modify | `packages/adapters/src/outbound/storage/schema/index.ts` | Export monitored-wallet schema |
| Modify | `packages/application/src/ports/index.ts` | Add monitored wallet repository interface |
| Modify | `packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts` | Implement monitored wallet persistence and scan-source queries |
| Create | `packages/adapters/src/outbound/storage/OperationalStorageAdapter.monitoring.test.ts` | TDD for monitored wallet storage behavior |
| Modify | `packages/application/src/dto/index.ts` | Add DTOs needed for detail/result/history route hydration if missing |
| Modify | `packages/application/src/public/index.ts` | Re-export new DTOs for UI/app use |
| Create | `packages/application/src/use-cases/wallet/RegisterMonitoredWallet.ts` | Backend enrollment use case for monitoring |
| Create | `packages/application/src/use-cases/wallet/RegisterMonitoredWallet.test.ts` | TDD for monitoring enrollment use case |
| Modify | `packages/adapters/src/inbound/http/tokens.ts` | Add DI token for monitored wallet repository and any missing ports |
| Modify | `packages/adapters/src/inbound/http/AppModule.ts` | Wire new repository/ports into BFF module |
| Modify | `packages/adapters/src/inbound/jobs/WorkerModule.ts` | Wire real worker dependencies |
| Modify | `packages/adapters/src/inbound/jobs/main.ts` | Worker bootstrap with Fastify-compatible runtime and exported bootstrap for tests |
| Create | `packages/adapters/src/inbound/jobs/main.test.ts` | TDD for worker bootstrap |
| Modify | `packages/adapters/src/inbound/jobs/BreachScanJobHandler.ts` | Real breach scan orchestration |
| Modify | `packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.ts` | Real trigger qualification orchestration |
| Modify | `packages/adapters/src/inbound/jobs/ReconciliationJobHandler.ts` | Real reconciliation orchestration |
| Modify | `packages/adapters/src/inbound/jobs/NotificationDispatchJobHandler.ts` | Real notification dispatch orchestration |
| Create | `packages/adapters/src/inbound/jobs/BreachScanJobHandler.test.ts` | TDD for breach scan job |
| Create | `packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.test.ts` | TDD for trigger qualification job |
| Create | `packages/adapters/src/inbound/jobs/ReconciliationJobHandler.test.ts` | TDD for reconciliation job |
| Create | `packages/adapters/src/inbound/jobs/NotificationDispatchJobHandler.test.ts` | TDD for notification job |
| Modify | `packages/adapters/src/inbound/http/PositionController.ts` | Add or split detail endpoint wiring |
| Create | `packages/adapters/src/inbound/http/PositionController.test.ts` | TDD for summary/detail position endpoints |
| Modify | `packages/adapters/src/inbound/http/AlertController.ts` | Preserve actionable alerts plus preview linkage if needed |
| Modify | `packages/adapters/src/inbound/http/PreviewController.ts` | Add trigger-driven preview creation route |
| Modify | `packages/adapters/src/inbound/http/ExecutionController.ts` | Add backend-backed attempt/result/history retrieval needed by routes |
| Create | `apps/app/src/api/http.test.ts` | TDD for shared BFF client details if expanded |
| Modify | `apps/app/src/api/http.ts` | Shared HTTP fetch helpers for new endpoints |
| Create | `apps/app/src/api/alerts.ts` | Alerts BFF client |
| Create | `apps/app/src/api/alerts.test.ts` | TDD for alerts client |
| Create | `apps/app/src/api/positionDetail.ts` | Position detail BFF client |
| Create | `apps/app/src/api/positionDetail.test.ts` | TDD for detail client |
| Create | `apps/app/src/api/previews.ts` | Preview create/get/refresh BFF client |
| Create | `apps/app/src/api/previews.test.ts` | TDD for preview client |
| Create | `apps/app/src/api/executions.ts` | Attempt/result/history BFF client |
| Create | `apps/app/src/api/executions.test.ts` | TDD for execution/history client |
| Modify | `apps/app/app/connect.tsx` | Enroll connected wallet for monitoring after successful connect |
| Modify | `apps/app/app/(tabs)/positions.tsx` | Navigate to detail route |
| Modify | `apps/app/app/(tabs)/alerts.tsx` | Replace thin export with live route component |
| Modify | `apps/app/app/position/[id].tsx` | Replace thin export with detail route component |
| Modify | `apps/app/app/preview/[triggerId].tsx` | Replace thin export with live preview route component |
| Modify | `apps/app/app/signing/[attemptId].tsx` | Replace thin export with backend-driven signing route |
| Modify | `apps/app/app/execution/[attemptId].tsx` | Replace thin export with backend-driven result route |
| Modify | `apps/app/app/(tabs)/history.tsx` | Replace thin export with backend-driven history route |
| Modify | `apps/app/src/appShellDependencies.test.ts` | Route wiring regression tests for new live routes |
| Modify | `packages/ui/src/screens/AlertsListScreen.tsx` | Support loading/error props and selection UX |
| Modify | `packages/ui/src/screens/PositionDetailScreen.tsx` | Support backend-driven detail state and alert-linked preview CTA |
| Modify | `packages/ui/src/screens/ExecutionPreviewScreen.tsx` | Support loading/error/approve/refresh state driven by route data |
| Modify | `packages/ui/src/screens/SigningStatusScreen.tsx` | Support attempt-loading and explicit status props |
| Modify | `packages/ui/src/screens/ExecutionResultScreen.tsx` | Support backend-driven result state and history navigation |
| Modify | `packages/ui/src/screens/HistoryListScreen.tsx` | Support backend history query state if needed |
| Create | `packages/ui/src/screens/AlertsListScreen.test.tsx` | Behavior tests for alerts states/navigation affordances |
| Create | `packages/ui/src/screens/PositionDetailScreen.test.tsx` | Behavior tests for detail state and preview CTA |
| Create | `packages/ui/src/screens/ExecutionPreviewScreen.test.tsx` | Behavior tests for preview loading/freshness/actions |
| Create | `packages/ui/src/screens/SigningStatusScreen.test.tsx` | Behavior tests for signing states |
| Create | `packages/ui/src/screens/ExecutionResultScreen.test.tsx` | Behavior tests for result/retry/history affordances |

---

## Task 1: Monitored Wallet Registry And Enrollment Path

**Files:**
- Create: `packages/adapters/src/outbound/storage/schema/monitored-wallets.ts`
- Modify: `packages/adapters/src/outbound/storage/schema/index.ts`
- Modify: `packages/application/src/ports/index.ts`
- Modify: `packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts`
- Create: `packages/adapters/src/outbound/storage/OperationalStorageAdapter.monitoring.test.ts`
- Create: `packages/application/src/use-cases/wallet/RegisterMonitoredWallet.ts`
- Create: `packages/application/src/use-cases/wallet/RegisterMonitoredWallet.test.ts`

- [ ] **Step 1: Write the failing monitored-wallet repository tests**

Create `packages/adapters/src/outbound/storage/OperationalStorageAdapter.monitoring.test.ts` with tests proving:
- monitored wallet enrollment is saved once per wallet
- the repository can list all monitored wallets for worker scans
- re-enrollment is idempotent

- [ ] **Step 2: Run the storage monitoring test to verify it fails**

Run: `pnpm vitest run packages/adapters/src/outbound/storage/OperationalStorageAdapter.monitoring.test.ts`
Expected: FAIL because monitored wallet schema/repository methods do not exist

- [ ] **Step 3: Write the failing enrollment use-case test**

Create `packages/application/src/use-cases/wallet/RegisterMonitoredWallet.test.ts` covering:
- successful enrollment of a connected wallet
- idempotent repeat enrollment

- [ ] **Step 4: Run the enrollment use-case test to verify it fails**

Run: `pnpm vitest run packages/application/src/use-cases/wallet/RegisterMonitoredWallet.test.ts`
Expected: FAIL because the use case and repository interface do not exist

- [ ] **Step 5: Implement the monitored wallet schema and repository contract**

Add:
- a `monitored_wallets` table with wallet id and enrolled timestamp
- repository interface in `packages/application/src/ports/index.ts`
- repository methods in `OperationalStorageAdapter` for save/list

- [ ] **Step 6: Implement the enrollment use case**

Create `registerMonitoredWallet()` to persist wallet enrollment through the new repository.

- [ ] **Step 7: Run the targeted tests to verify they pass**

Run:
- `pnpm vitest run packages/adapters/src/outbound/storage/OperationalStorageAdapter.monitoring.test.ts`
- `pnpm vitest run packages/application/src/use-cases/wallet/RegisterMonitoredWallet.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/adapters/src/outbound/storage/schema/monitored-wallets.ts packages/adapters/src/outbound/storage/schema/index.ts packages/application/src/ports/index.ts packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts packages/adapters/src/outbound/storage/OperationalStorageAdapter.monitoring.test.ts packages/application/src/use-cases/wallet/RegisterMonitoredWallet.ts packages/application/src/use-cases/wallet/RegisterMonitoredWallet.test.ts
git commit -m "feat(monitoring): add monitored wallet enrollment registry

Persists wallets enrolled for monitoring so scheduled breach scans have an authoritative source of wallets to process."
```

---

## Task 2: Worker Pipeline For Breach Detection, Qualification, Reconciliation, And Notification

**Files:**
- Modify: `packages/adapters/src/inbound/jobs/BreachScanJobHandler.ts`
- Modify: `packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.ts`
- Modify: `packages/adapters/src/inbound/jobs/ReconciliationJobHandler.ts`
- Modify: `packages/adapters/src/inbound/jobs/NotificationDispatchJobHandler.ts`
- Modify: `packages/adapters/src/inbound/jobs/WorkerModule.ts`
- Modify: `packages/adapters/src/inbound/jobs/main.ts`
- Create: `packages/adapters/src/inbound/jobs/main.test.ts`
- Create: `packages/adapters/src/inbound/jobs/BreachScanJobHandler.test.ts`
- Create: `packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.test.ts`
- Create: `packages/adapters/src/inbound/jobs/ReconciliationJobHandler.test.ts`
- Create: `packages/adapters/src/inbound/jobs/NotificationDispatchJobHandler.test.ts`

- [ ] **Step 1: Write the failing worker bootstrap test**

Create `packages/adapters/src/inbound/jobs/main.test.ts` proving the worker bootstrap uses the correct Nest platform adapter and exported bootstrap path.

- [ ] **Step 2: Run the worker bootstrap test to verify it fails**

Run: `pnpm vitest run packages/adapters/src/inbound/jobs/main.test.ts`
Expected: FAIL because the worker bootstrap is still the thin default form

- [ ] **Step 3: Write the failing breach scan job test**

Create `packages/adapters/src/inbound/jobs/BreachScanJobHandler.test.ts` proving:
- monitored wallets are loaded
- `scanPositionsForBreaches` is invoked per wallet
- resulting observations are handed off for qualification work

- [ ] **Step 4: Run the breach scan test to verify it fails**

Run: `pnpm vitest run packages/adapters/src/inbound/jobs/BreachScanJobHandler.test.ts`
Expected: FAIL because the handler is stubbed

- [ ] **Step 5: Write the failing qualification, reconciliation, and notification job tests**

Create tests that prove:
- qualification persists actionable triggers and suppresses duplicates
- reconciliation updates attempt lifecycle from submission references
- notification dispatch runs only for created actionable triggers

- [ ] **Step 6: Run the job tests to verify they fail**

Run:
- `pnpm vitest run packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.test.ts`
- `pnpm vitest run packages/adapters/src/inbound/jobs/ReconciliationJobHandler.test.ts`
- `pnpm vitest run packages/adapters/src/inbound/jobs/NotificationDispatchJobHandler.test.ts`
Expected: FAIL because handlers are stubbed

- [ ] **Step 7: Implement the worker bootstrap and all four job handlers**

Implementation must:
- wire dependencies from `WorkerModule`
- load monitored wallets for scans
- call existing application use cases for scan/qualify/reconcile
- enqueue or sequence downstream work in the minimal existing architecture
- keep notification dispatch best-effort

- [ ] **Step 8: Run the targeted worker tests to verify they pass**

Run:
- `pnpm vitest run packages/adapters/src/inbound/jobs/main.test.ts`
- `pnpm vitest run packages/adapters/src/inbound/jobs/BreachScanJobHandler.test.ts`
- `pnpm vitest run packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.test.ts`
- `pnpm vitest run packages/adapters/src/inbound/jobs/ReconciliationJobHandler.test.ts`
- `pnpm vitest run packages/adapters/src/inbound/jobs/NotificationDispatchJobHandler.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add packages/adapters/src/inbound/jobs/BreachScanJobHandler.ts packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.ts packages/adapters/src/inbound/jobs/ReconciliationJobHandler.ts packages/adapters/src/inbound/jobs/NotificationDispatchJobHandler.ts packages/adapters/src/inbound/jobs/WorkerModule.ts packages/adapters/src/inbound/jobs/main.ts packages/adapters/src/inbound/jobs/main.test.ts packages/adapters/src/inbound/jobs/BreachScanJobHandler.test.ts packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.test.ts packages/adapters/src/inbound/jobs/ReconciliationJobHandler.test.ts packages/adapters/src/inbound/jobs/NotificationDispatchJobHandler.test.ts
git commit -m "feat(worker): implement monitoring and trigger pipeline jobs

Turns scheduled monitoring, trigger qualification, reconciliation, and notification dispatch into real worker behavior."
```

---

## Task 3: Complete Backend Query And Command Surfaces For Detail, Preview, Execution, And History

**Files:**
- Modify: `packages/adapters/src/inbound/http/tokens.ts`
- Modify: `packages/adapters/src/inbound/http/AppModule.ts`
- Modify: `packages/adapters/src/inbound/http/PositionController.ts`
- Create: `packages/adapters/src/inbound/http/PositionController.test.ts`
- Modify: `packages/adapters/src/inbound/http/AlertController.ts`
- Modify: `packages/adapters/src/inbound/http/PreviewController.ts`
- Modify: `packages/adapters/src/inbound/http/ExecutionController.ts`
- Modify: `packages/application/src/dto/index.ts`
- Modify: `packages/application/src/public/index.ts`

- [ ] **Step 1: Write the failing position detail controller tests**

Create `packages/adapters/src/inbound/http/PositionController.test.ts` proving:
- wallet-scoped position summary remains intact
- position detail endpoint returns bounds, current price, range state, and linked actionable trigger information when present

- [ ] **Step 2: Run the position controller test to verify it fails**

Run: `pnpm vitest run packages/adapters/src/inbound/http/PositionController.test.ts`
Expected: FAIL because the detail endpoint does not exist

- [ ] **Step 3: Write the failing preview/execution controller tests**

Add or extend controller tests proving:
- preview can be created from `triggerId`
- preview can be refreshed from trigger state
- execution lookup returns backend attempt truth
- history lookup remains position-scoped and backend-backed

- [ ] **Step 4: Run the preview/execution controller tests to verify they fail**

Run:
- `pnpm --filter @clmm/adapters test -- --run src/inbound/http/ExecutionController.test.ts`
- `pnpm vitest run packages/adapters/src/inbound/http/PositionController.test.ts`
Expected: FAIL on new missing behaviors

- [ ] **Step 5: Implement backend DTO/controller changes**

Implement the minimal DTO and controller changes needed for:
- position detail hydration
- trigger-driven preview creation/refresh
- execution attempt lookup/result hydration
- history lookup for route consumption

- [ ] **Step 6: Run targeted controller tests to verify they pass**

Run controller tests for position, alert, preview, and execution surfaces.
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/adapters/src/inbound/http/tokens.ts packages/adapters/src/inbound/http/AppModule.ts packages/adapters/src/inbound/http/PositionController.ts packages/adapters/src/inbound/http/PositionController.test.ts packages/adapters/src/inbound/http/AlertController.ts packages/adapters/src/inbound/http/PreviewController.ts packages/adapters/src/inbound/http/ExecutionController.ts packages/application/src/dto/index.ts packages/application/src/public/index.ts
git commit -m "feat(api): complete detail, preview, and execution surfaces

Adds the backend query and command endpoints needed for alert, preview, execution, and history route hydration."
```

---

## Task 4: Add App API Clients For Alerts, Detail, Preview, Execution, And History

**Files:**
- Modify: `apps/app/src/api/http.ts`
- Create: `apps/app/src/api/http.test.ts`
- Create: `apps/app/src/api/alerts.ts`
- Create: `apps/app/src/api/alerts.test.ts`
- Create: `apps/app/src/api/positionDetail.ts`
- Create: `apps/app/src/api/positionDetail.test.ts`
- Create: `apps/app/src/api/previews.ts`
- Create: `apps/app/src/api/previews.test.ts`
- Create: `apps/app/src/api/executions.ts`
- Create: `apps/app/src/api/executions.test.ts`

- [ ] **Step 1: Write failing tests for the new app API clients**

Create focused tests covering:
- alerts fetch by wallet
- position detail fetch by position id
- preview create/get/refresh by trigger/preview id
- execution attempt and history fetch
- shared HTTP helper behavior for controlled failures and JSON parsing

- [ ] **Step 2: Run the new API client tests to verify they fail**

Run the targeted Vitest commands for each new client file.
Expected: FAIL because the client modules do not exist yet

- [ ] **Step 3: Implement the minimal app BFF clients**

Add one file per backend surface and keep all parsing/controlled error handling in the app API layer.

- [ ] **Step 4: Run the targeted app API tests to verify they pass**

Run all new `apps/app/src/api/*.test.ts` files.
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/api/http.ts apps/app/src/api/http.test.ts apps/app/src/api/alerts.ts apps/app/src/api/alerts.test.ts apps/app/src/api/positionDetail.ts apps/app/src/api/positionDetail.test.ts apps/app/src/api/previews.ts apps/app/src/api/previews.test.ts apps/app/src/api/executions.ts apps/app/src/api/executions.test.ts
git commit -m "feat(app): add alert, detail, preview, and execution clients

Adds app-local BFF clients for the remaining backend-backed MVP route surfaces."
```

---

## Task 5: Replace Thin App Routes With Real Backend-Driven Route Components

**Files:**
- Modify: `apps/app/app/connect.tsx`
- Modify: `apps/app/app/(tabs)/positions.tsx`
- Modify: `apps/app/app/(tabs)/alerts.tsx`
- Modify: `apps/app/app/position/[id].tsx`
- Modify: `apps/app/app/preview/[triggerId].tsx`
- Modify: `apps/app/app/signing/[attemptId].tsx`
- Modify: `apps/app/app/execution/[attemptId].tsx`
- Modify: `apps/app/app/(tabs)/history.tsx`
- Modify: `apps/app/src/appShellDependencies.test.ts`

- [ ] **Step 1: Write failing route wiring regression tests**

Extend `apps/app/src/appShellDependencies.test.ts` with route-source guards proving:
- alerts route uses `useQuery` + `fetchAlerts`
- detail route uses route params + `fetchPositionDetail`
- preview route uses route params + preview client
- signing/result/history routes fetch backend state instead of thin re-exporting
- connect route enrolls the wallet for monitoring after successful connection

- [ ] **Step 2: Run the route regression tests to verify they fail**

Run: `pnpm vitest run --config vitest.config.ts src/appShellDependencies.test.ts`
Expected: FAIL because thin routes still exist

- [ ] **Step 3: Implement the route components**

Replace thin exports with route components that:
- query backend state using route params
- navigate using backend IDs
- keep wallet session store limited to wallet/capabilities/session state
- register monitored wallet enrollment after connect success

- [ ] **Step 4: Run the route regression tests to verify they pass**

Run: `pnpm vitest run --config vitest.config.ts src/appShellDependencies.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/app/app/connect.tsx apps/app/app/(tabs)/positions.tsx apps/app/app/(tabs)/alerts.tsx apps/app/app/position/[id].tsx apps/app/app/preview/[triggerId].tsx apps/app/app/signing/[attemptId].tsx apps/app/app/execution/[attemptId].tsx apps/app/app/(tabs)/history.tsx apps/app/src/appShellDependencies.test.ts
git commit -m "feat(app): wire MVP routes to backend state

Replaces thin screen exports with real route components for alerts, detail, preview, signing, result, and history."
```

---

## Task 6: Upgrade UI Screens For Loading, Error, And Action States Across The Flow

**Files:**
- Modify: `packages/ui/src/screens/AlertsListScreen.tsx`
- Create: `packages/ui/src/screens/AlertsListScreen.test.tsx`
- Modify: `packages/ui/src/screens/PositionDetailScreen.tsx`
- Create: `packages/ui/src/screens/PositionDetailScreen.test.tsx`
- Modify: `packages/ui/src/screens/ExecutionPreviewScreen.tsx`
- Create: `packages/ui/src/screens/ExecutionPreviewScreen.test.tsx`
- Modify: `packages/ui/src/screens/SigningStatusScreen.tsx`
- Create: `packages/ui/src/screens/SigningStatusScreen.test.tsx`
- Modify: `packages/ui/src/screens/ExecutionResultScreen.tsx`
- Create: `packages/ui/src/screens/ExecutionResultScreen.test.tsx`

- [ ] **Step 1: Write failing behavior tests for the remaining screens**

Add render/behavior tests proving each screen can distinguish:
- loading
- error
- empty
- actionable data state
- navigation/action affordances relevant to that screen

- [ ] **Step 2: Run the targeted screen tests to verify they fail**

Run the new screen test files individually.
Expected: FAIL because current screens do not support the route-driven loading/error/action contract

- [ ] **Step 3: Implement the minimal screen prop changes and state branches**

Keep `packages/ui` presentational. All data-fetch decisions stay in route components.

- [ ] **Step 4: Run the targeted screen tests to verify they pass**

Run the new screen test files individually.
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/screens/AlertsListScreen.tsx packages/ui/src/screens/AlertsListScreen.test.tsx packages/ui/src/screens/PositionDetailScreen.tsx packages/ui/src/screens/PositionDetailScreen.test.tsx packages/ui/src/screens/ExecutionPreviewScreen.tsx packages/ui/src/screens/ExecutionPreviewScreen.test.tsx packages/ui/src/screens/SigningStatusScreen.tsx packages/ui/src/screens/SigningStatusScreen.test.tsx packages/ui/src/screens/ExecutionResultScreen.tsx packages/ui/src/screens/ExecutionResultScreen.test.tsx
git commit -m "feat(ui): support backend-driven MVP flow screens

Adds loading, error, and action-state support to alerts, detail, preview, signing, and result screens."
```

---

## Task 7: Wire Approve, Sign, Submit, Result, And History End-To-End

**Files:**
- Modify: `apps/app/app/preview/[triggerId].tsx`
- Modify: `apps/app/app/signing/[attemptId].tsx`
- Modify: `apps/app/app/execution/[attemptId].tsx`
- Modify: `apps/app/app/(tabs)/history.tsx`
- Modify: `apps/app/src/platform/browserWallet.ts` or wallet route helpers only if required for signing orchestration
- Modify: any execution client files from Task 4 if needed

- [ ] **Step 1: Write failing end-to-end route tests for approve/sign/result flow**

Add targeted route tests or route-source regression guards proving:
- preview approve triggers backend attempt creation
- signing route hydrates from attempt id
- successful submission navigates to result route
- result route can navigate to history

- [ ] **Step 2: Run the route tests to verify they fail**

Run the targeted route regression tests.
Expected: FAIL because the current app does not yet drive the full approve/sign/result flow

- [ ] **Step 3: Implement the minimal route orchestration for explicit execution**

Implementation must:
- create or fetch backend preview from trigger
- create/advance attempt before signing
- sign with the connected wallet
- submit through backend command endpoint
- hydrate signing/result/history from backend state
- never treat submitted as confirmed without backend reconciliation result

- [ ] **Step 4: Run targeted app tests to verify they pass**

Run app tests covering wallet flow, route wiring, and execution clients.
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/app/app/preview/[triggerId].tsx apps/app/app/signing/[attemptId].tsx apps/app/app/execution/[attemptId].tsx apps/app/app/(tabs)/history.tsx apps/app/src/api/executions.ts apps/app/src/api/previews.ts apps/app/src/platform/browserWallet.ts
git commit -m "feat(app): wire explicit preview-to-result execution flow

Connects backend-backed preview approval, wallet signing, submission, result rendering, and history navigation."
```

---

## Task 8: Best-Effort Notifications And Deep-Link Re-entry

**Files:**
- Modify: `packages/adapters/src/inbound/jobs/NotificationDispatchJobHandler.ts`
- Modify: `apps/app/src/composition/index.ts`
- Modify: `apps/app/src/platform/deepLinks.ts`
- Modify: `apps/app/app/_layout.tsx` or route-level bootstrap only if needed for deep-link hydration
- Modify: relevant app routes to accept deep-link entry context

- [ ] **Step 1: Write the failing notification and deep-link tests**

Add tests proving:
- actionable triggers can dispatch best-effort notifications
- deep links resolve into trigger-preview, execution-result, or history contexts
- degraded notification capability does not break app review flow

- [ ] **Step 2: Run the tests to verify they fail**

Run targeted notification/deep-link tests.
Expected: FAIL because dispatch/re-entry are not wired end-to-end yet

- [ ] **Step 3: Implement best-effort dispatch and route re-entry wiring**

Implementation must:
- dispatch only from real actionable trigger state
- preserve backend IDs in notification payloads/deep links
- hydrate destination routes from backend state on open

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run notification/deep-link tests.
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/inbound/jobs/NotificationDispatchJobHandler.ts apps/app/src/composition/index.ts apps/app/src/platform/deepLinks.ts apps/app/app/_layout.tsx apps/app/app/preview/[triggerId].tsx apps/app/app/execution/[attemptId].tsx apps/app/app/(tabs)/history.tsx
git commit -m "feat(reentry): add notification dispatch and deep-link recovery

Supports best-effort actionable notifications and backend-backed re-entry into preview, result, and history contexts."
```

---

## Task 9: Final MVP Verification

**Files:**
- Modify: none expected unless verification reveals a gap

- [ ] **Step 1: Run all relevant package tests**

Run:
- `pnpm test:application`
- `pnpm test:adapters`
- `pnpm --filter @clmm/app test`
- `pnpm --filter @clmm/ui test`
Expected: PASS

- [ ] **Step 2: Run full typecheck and boundaries**

Run:
- `pnpm typecheck`
- `pnpm boundaries`
Expected: PASS

- [ ] **Step 3: Run app web build**

Run:
- `pnpm --filter @clmm/app build`
Expected: PASS without reintroducing the previous wallet-adapter or Orca WASM bundle failures

- [ ] **Step 4: Start the API and worker**

Run:
- `pnpm dev:api`
- `pnpm dev:worker`
Expected: both services start cleanly

- [ ] **Step 5: Manual end-to-end verification**

Manual steps:
1. Start the web app with `pnpm --filter @clmm/app dev:web`
2. Connect a wallet with a supported Orca position
3. Confirm monitoring enrollment exists for that wallet
4. Force or observe an out-of-range state
5. Confirm backend creates an actionable alert
6. Open the alert or position detail
7. View directional preview and freshness state
8. Approve, sign, and submit explicitly
9. Observe truthful lifecycle result
10. Review durable off-chain history

Expected: the full backend-triggered MVP flow is reachable end-to-end without manual stubbing

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(mvp): complete end-to-end out-of-range execution flow

Finishes the backend-triggered MVP from monitoring and actionable alerts through preview, explicit execution, result state, history, and re-entry."
```

---

## Spec Coverage Matrix

| Spec Area | Task |
|---|---|
| Monitored wallet registry for backend-triggered scanning | Task 1 |
| Worker-driven breach detection and qualification | Task 2 |
| Durable trigger, preview, attempt, and history backend surfaces | Task 3 |
| App BFF clients for all remaining route-backed state | Task 4 |
| Route-driven app flow for alerts/detail/preview/signing/result/history | Task 5 |
| Presentational screens that distinguish loading/error/action states | Task 6 |
| Explicit approve/sign/submit/result flow | Task 7 |
| Best-effort notifications and deep-link recovery | Task 8 |
| End-to-end MVP verification | Task 9 |

# Task Context: Task 7

Title: Bridge plan exits into the signed execution pipeline

## Workspace & Scope Constraints

## WORKSPACE CONSTRAINTS

Your working directory is a dedicated git worktree with the repository's complete history. Run all commands from it. Do NOT cd to or read paths outside this directory — external-directory access is automatically rejected. git log, git diff, etc. work here directly.

.ai-orchestrator.local.json, if one exists, lives only in the main checkout and is intentionally not copied into your worktree — it is operator-machine-specific and not part of your task. Do not search for it or read it outside this directory. Reason about configuration using only .ai-orchestrator.json in your own working directory; treat it as the effective config for your task.

Working Directory: /home/gary/.openclaw/workspace/clmm-superpowers-v2/.ai-worktrees/issue-62
Repository: opsclawd/clmm-v2
Branch: ai/issue-62
Start Commit: a992517c4f418e93c2a98914c26582bf40b2515b

## Task Requirements

**Files:**

- Modify: `packages/domain/src/execution/index.ts`
- Modify: `packages/domain/src/history/index.ts`
- Modify: `packages/application/src/ports/index.ts`
- Modify: `packages/testing/src/fakes/FakeExecutionRepository.ts`
- Modify: `packages/application/src/use-cases/previews/CreateExecutionPreview.ts`
- Modify: `packages/application/src/use-cases/previews/CreateExecutionPreview.test.ts`
- Modify: `packages/application/src/use-cases/execution/RequestWalletSignature.ts`
- Modify: `packages/application/src/use-cases/execution/RequestWalletSignature.test.ts`
- Modify: `packages/application/src/use-cases/execution/SubmitExecutionAttempt.ts`
- Modify: `packages/application/src/use-cases/execution/SubmitExecutionAttempt.test.ts`
- Modify: `packages/application/src/use-cases/execution/ReconcileExecutionAttempt.ts`
- Modify: `packages/application/src/use-cases/execution/ReconcileExecutionAttempt.test.ts`
- Modify: `packages/application/src/use-cases/execution/RecordSignatureDecline.ts`
- Modify: `packages/application/src/use-cases/execution/RecordSignatureDecline.test.ts`
- Modify: `packages/application/src/use-cases/execution/RecordExecutionAbandonment.ts`
- Modify: `packages/application/src/use-cases/execution/RecordExecutionAbandonment.test.ts`
- Create: `packages/application/src/use-cases/plans/CreatePlanExitPreview.ts`
- Create: `packages/application/src/use-cases/plans/CreatePlanExitPreview.test.ts`
- Create: `packages/application/src/use-cases/plans/ApprovePlanExit.ts`
- Create: `packages/application/src/use-cases/plans/ApprovePlanExit.test.ts`
- Modify: `packages/application/src/index.ts`
- Modify: `packages/application/src/public/index.ts`
- Modify: `packages/adapters/src/outbound/storage/schema/previews.ts`
- Modify: `packages/adapters/src/outbound/storage/schema/executions.ts`
- Modify: `packages/adapters/src/outbound/storage/schema/history.ts`
- Modify: `packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts`
- Create: `packages/adapters/src/outbound/storage/PlanExecutionOriginStorage.test.ts`
- Create: `packages/adapters/drizzle/0003_execution_origin.sql`
- Create: `packages/adapters/drizzle/meta/0003_snapshot.json`
- Modify: `packages/adapters/drizzle/meta/_journal.json`
- Modify: `packages/adapters/src/inbound/http/ExecutionController.ts`
- Modify: `packages/adapters/src/inbound/http/ExecutionController.test.ts`
- Modify: `packages/adapters/src/inbound/http/PreviewController.ts`
- Modify: `packages/adapters/src/inbound/jobs/ReconciliationJobHandler.ts`
- Modify: `packages/adapters/src/inbound/jobs/ReconciliationJobHandler.test.ts`
- Modify: `packages/testing/src/scenarios/approvalFlow.ts`
- Modify: `packages/testing/src/scenarios/StalePreviews.test.ts`
- Modify: `packages/testing/src/scenarios/PartialCompletionResume.test.ts`
- Modify: `packages/testing/src/scenarios/InterruptedSessionResume.test.ts`
- Modify: `packages/testing/src/scenarios/BreachToExitScenario.ts`
- Modify: `packages/application/src/use-cases/previews/GetExecutionPreview.ts`
- Modify: `packages/application/src/use-cases/execution/RecordSignatureInterruption.ts`
- Modify: `packages/application/src/use-cases/execution/RecordSignatureInterruption.test.ts`
- Modify: `packages/application/src/use-cases/execution/ResumeExecutionAttempt.ts`
- Modify: `packages/application/src/use-cases/execution/ResumeExecutionAttempt.test.ts`
- Modify: `packages/application/src/use-cases/execution/GetAwaitingSignaturePayload.ts`
- Modify: `packages/application/src/use-cases/execution/GetAwaitingSignaturePayload.test.ts`
- Modify: `packages/application/src/use-cases/execution/GetExecutionHistory.ts`
- Modify: `packages/application/src/use-cases/execution/GetExecutionHistory.test.ts`
- Modify: `packages/application/src/use-cases/execution/GetWalletExecutionHistory.ts`
- Modify: `packages/application/src/use-cases/execution/GetWalletExecutionHistory.test.ts`
- Modify: `packages/application/src/use-cases/execution/GetExecutionAttemptDetail.ts`
- Modify: `packages/application/src/use-cases/execution/GetExecutionAttemptDetail.test.ts`
- Modify: `packages/application/src/dto/index.ts`
- Modify: `packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts`
- Modify: `packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.test.ts`
- Modify: `packages/ui/src/screens/ExecutionPreviewScreen.tsx`
- Modify: `packages/ui/src/screens/HistoryDetailScreen.tsx`
- Modify: `packages/ui/src/screens/HistoryListScreen.tsx`
- Modify: `packages/ui/src/components/HistoryEventRow.tsx`
- Modify: `packages/ui/src/view-models/PreviewViewModel.ts`
- Modify: `packages/ui/src/view-models/PreviewViewModel.test.ts`
- Modify: `packages/ui/src/view-models/HistoryViewModel.ts`
- Modify: `packages/ui/src/view-models/HistoryViewModel.test.ts`
- Modify: `packages/ui/src/index.ts`
- Modify: `apps/app/app/signing/[attemptId].tsx`
- Modify: `apps/app/app/execution/[attemptId].tsx`
- Modify: `apps/app/src/api/executions.ts`
- Modify: `apps/app/src/api/executions.test.ts`
- Modify: `apps/app/src/api/previews.ts`
- Modify: `packages/testing/src/fakes/FakeExecutionHistoryRepository.ts`
- Modify: `packages/domain/src/execution/RetryBoundaryPolicy.test.ts`

**Behavioral invariants:**

- A plan exit receives a distinct `regime-plan` execution origin; breach previews/attempts retain `qualified-breach` plus their exact direction.
- Preview creation re-reads position state and rejects closed, stale, expired, superseded, ownership-mismatched, or materially changed positions before preparing a transaction.
- A plan preview uses the canonical exit intent and the same quote/slippage/route/balance/fee/priority-fee/transaction-freshness safety capabilities as existing execution preparation.
- Approval still requires an explicit user action and wallet signature; no accepted plan can auto-submit.
- One plan creates at most one preview and one execution attempt, including concurrent/replayed requests and restart.
- User decline/interruption/abandonment and preparation/submission/reconciliation failures preserve the actual local outcome for canonical reporting.
- A breach that qualifies before signing supersedes the plan; no stale plan payload is signed.
- Existing lower/upper breach preview, signing, submission, reconciliation, retry, and history behavior remains unchanged.

**Acceptance criteria:**

- [ ] Complete the atomic `ExecutionOrigin` signature migration deferred by Task 2: add a required `origin: ExecutionOrigin` field to domain `ExecutionAttempt` in `packages/domain/src/execution/index.ts`, and replace the required `breachDirection: BreachDirection` field on domain `HistoryEvent` and `ExecutionOutcomeSummary` in `packages/domain/src/history/index.ts` with the required `origin: ExecutionOrigin` field, in this same task.
- [ ] Change `ExecutionRepository` preview/attempt methods to store `ExecutionOrigin`; update `OperationalStorageAdapter` and `FakeExecutionRepository` in this same task so the workspace typecheck remains green.
- [ ] Migrate direction columns to nullable only when `origin_kind = 'regime-plan'`, add plan-origin foreign keys/check constraints, and retain mandatory valid direction for `qualified-breach`.
- [ ] Add tests named `stores a plan exit without fabricating breach direction`, `preserves lower and upper breach origins`, `rejects a plan after position material change`, `rejects a plan superseded by a qualified breach`, `creates only one preview and attempt under replay`, `requires explicit approval and wallet signature`, `records user decline as the canonical non-executed outcome`, `links successful reconciliation to the plan`, and `records failed transaction without re-executing`.
- [ ] Make `CreatePlanExitPreview` and `ApprovePlanExit` thin policy wrappers around shared execution capabilities; do not duplicate Solana adapter logic.
- [ ] Keep exported DTOs discriminated by execution origin so UI/history never labels a plan exit as a lower/upper breach.
- [ ] Update every direct reader/writer of `StoredExecutionAttempt.breachDirection`, domain `HistoryEvent.breachDirection`, and `ExecutionOutcomeSummary.breachDirection` in the same task so the workspace typecheck stays green after the migration: the preview/attempt/history use cases (`GetExecutionPreview`, `RecordSignatureInterruption`, `ResumeExecutionAttempt`, `GetAwaitingSignaturePayload`, `GetExecutionHistory`, `GetWalletExecutionHistory`, `GetExecutionAttemptDetail`), the application DTO/public exports, `OffChainHistoryStorageAdapter`, the execution/preview/history UI surfaces (`ExecutionPreviewScreen`, `HistoryDetailScreen`, `HistoryListScreen`, `HistoryEventRow`, `PreviewViewModel`, `HistoryViewModel`), the app routes and API clients that read execution/preview DTOs (`signing/[attemptId]`, `execution/[attemptId]`, `apps/app/src/api/executions.ts`, `apps/app/src/api/previews.ts`), `FakeExecutionHistoryRepository`, and the domain `RetryBoundaryPolicy.test.ts` fixture. Do not touch Trigger-scoped `breachDirection` consumers (Position summary, Alert, Notification, and Trigger-qualification code) — that field belongs to `Trigger`, not to `ExecutionOrigin`, and is out of scope for this migration.

**Verification:**

```bash
pnpm --filter @clmm/application test -- src/use-cases/previews/CreateExecutionPreview.test.ts src/use-cases/plans/CreatePlanExitPreview.test.ts src/use-cases/plans/ApprovePlanExit.test.ts
pnpm --filter @clmm/adapters test -- src/outbound/storage/PlanExecutionOriginStorage.test.ts
pnpm exec eslint packages/domain/src/execution/index.ts packages/domain/src/history/index.ts packages/application/src/ports/index.ts packages/testing/src/fakes/FakeExecutionRepository.ts packages/application/src/use-cases/previews/CreateExecutionPreview.ts packages/application/src/use-cases/previews/CreateExecutionPreview.test.ts packages/application/src/use-cases/execution/RequestWalletSignature.ts packages/application/src/use-cases/execution/SubmitExecutionAttempt.ts packages/application/src/use-cases/execution/ReconcileExecutionAttempt.ts packages/application/src/use-cases/execution/RecordSignatureDecline.ts packages/application/src/use-cases/execution/RecordExecutionAbandonment.ts packages/application/src/use-cases/plans/CreatePlanExitPreview.ts packages/application/src/use-cases/plans/CreatePlanExitPreview.test.ts packages/application/src/use-cases/plans/ApprovePlanExit.ts packages/application/src/use-cases/plans/ApprovePlanExit.test.ts packages/application/src/index.ts packages/application/src/public/index.ts packages/adapters/src/outbound/storage/schema/previews.ts packages/adapters/src/outbound/storage/schema/executions.ts packages/adapters/src/outbound/storage/schema/history.ts packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts packages/adapters/src/outbound/storage/PlanExecutionOriginStorage.test.ts packages/application/src/use-cases/previews/GetExecutionPreview.ts packages/application/src/use-cases/execution/RecordSignatureInterruption.ts packages/application/src/use-cases/execution/ResumeExecutionAttempt.ts packages/application/src/use-cases/execution/GetAwaitingSignaturePayload.ts packages/application/src/use-cases/execution/GetExecutionHistory.ts packages/application/src/use-cases/execution/GetWalletExecutionHistory.ts packages/application/src/use-cases/execution/GetExecutionAttemptDetail.ts packages/application/src/dto/index.ts packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts packages/ui/src/screens/ExecutionPreviewScreen.tsx packages/ui/src/screens/HistoryDetailScreen.tsx packages/ui/src/screens/HistoryListScreen.tsx packages/ui/src/components/HistoryEventRow.tsx packages/ui/src/view-models/PreviewViewModel.ts packages/ui/src/view-models/HistoryViewModel.ts packages/ui/src/index.ts apps/app/src/api/executions.ts apps/app/src/api/previews.ts packages/testing/src/fakes/FakeExecutionHistoryRepository.ts packages/domain/src/execution/RetryBoundaryPolicy.test.ts
git diff --check -- packages/domain/src/execution/index.ts packages/domain/src/history/index.ts packages/application/src/ports/index.ts packages/testing/src/fakes/FakeExecutionRepository.ts packages/application/src/use-cases/previews/CreateExecutionPreview.ts packages/application/src/use-cases/previews/CreateExecutionPreview.test.ts packages/application/src/use-cases/execution/RequestWalletSignature.ts packages/application/src/use-cases/execution/SubmitExecutionAttempt.ts packages/application/src/use-cases/execution/ReconcileExecutionAttempt.ts packages/application/src/use-cases/execution/RecordSignatureDecline.ts packages/application/src/use-cases/execution/RecordExecutionAbandonment.ts packages/application/src/use-cases/plans/CreatePlanExitPreview.ts packages/application/src/use-cases/plans/CreatePlanExitPreview.test.ts packages/application/src/use-cases/plans/ApprovePlanExit.ts packages/application/src/use-cases/plans/ApprovePlanExit.test.ts packages/application/src/index.ts packages/application/src/public/index.ts packages/adapters/src/outbound/storage/schema/previews.ts packages/adapters/src/outbound/storage/schema/executions.ts packages/adapters/src/outbound/storage/schema/history.ts packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts packages/adapters/src/outbound/storage/PlanExecutionOriginStorage.test.ts packages/adapters/drizzle/0003_execution_origin.sql packages/adapters/drizzle/meta/0003_snapshot.json packages/adapters/drizzle/meta/_journal.json packages/application/src/use-cases/previews/GetExecutionPreview.ts packages/application/src/use-cases/execution/RecordSignatureInterruption.ts packages/application/src/use-cases/execution/ResumeExecutionAttempt.ts packages/application/src/use-cases/execution/GetAwaitingSignaturePayload.ts packages/application/src/use-cases/execution/GetExecutionHistory.ts packages/application/src/use-cases/execution/GetWalletExecutionHistory.ts packages/application/src/use-cases/execution/GetExecutionAttemptDetail.ts packages/application/src/dto/index.ts packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts packages/ui/src/screens/ExecutionPreviewScreen.tsx packages/ui/src/screens/HistoryDetailScreen.tsx packages/ui/src/screens/HistoryListScreen.tsx packages/ui/src/components/HistoryEventRow.tsx packages/ui/src/view-models/PreviewViewModel.ts packages/ui/src/view-models/HistoryViewModel.ts packages/ui/src/index.ts apps/app/src/api/executions.ts apps/app/src/api/previews.ts packages/testing/src/fakes/FakeExecutionHistoryRepository.ts packages/domain/src/execution/RetryBoundaryPolicy.test.ts
```

Expected: both execution origins persist and execute truthfully; every existing focused breach test remains green.

## Repository Targets

### Expected Files

- packages/domain/src/execution/index.ts
- packages/domain/src/history/index.ts
- packages/application/src/ports/index.ts
- packages/testing/src/fakes/FakeExecutionRepository.ts
- packages/application/src/use-cases/previews/CreateExecutionPreview.ts
- packages/application/src/use-cases/previews/CreateExecutionPreview.test.ts
- packages/application/src/use-cases/previews/GetExecutionPreview.test.ts
- packages/application/src/use-cases/previews/RefreshExecutionPreview.ts
- packages/application/src/use-cases/previews/RefreshExecutionPreview.test.ts
- packages/application/src/use-cases/execution/RequestWalletSignature.ts
- packages/application/src/use-cases/execution/RequestWalletSignature.test.ts
- packages/application/src/use-cases/execution/SubmitExecutionAttempt.ts
- packages/application/src/use-cases/execution/SubmitExecutionAttempt.test.ts
- packages/application/src/use-cases/execution/ReconcileExecutionAttempt.ts
- packages/application/src/use-cases/execution/ReconcileExecutionAttempt.test.ts
- packages/application/src/use-cases/execution/RecordSignatureDecline.ts
- packages/application/src/use-cases/execution/RecordSignatureDecline.test.ts
- packages/application/src/use-cases/execution/RecordExecutionAbandonment.ts
- packages/application/src/use-cases/execution/RecordExecutionAbandonment.test.ts
- packages/application/src/use-cases/plans/CreatePlanExitPreview.ts
- packages/application/src/use-cases/plans/CreatePlanExitPreview.test.ts
- packages/application/src/use-cases/plans/ApprovePlanExit.ts
- packages/application/src/use-cases/plans/ApprovePlanExit.test.ts
- packages/application/src/index.ts
- packages/application/src/public/index.ts
- packages/adapters/src/outbound/storage/schema/previews.ts
- packages/adapters/src/outbound/storage/schema/executions.ts
- packages/adapters/src/outbound/storage/schema/history.ts
- packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts
- packages/adapters/src/outbound/storage/PlanExecutionOriginStorage.test.ts
- packages/adapters/drizzle/0004_execution_origin.sql
- packages/adapters/drizzle/meta/0004_snapshot.json
- packages/adapters/drizzle/meta/\_journal.json
- packages/adapters/src/inbound/http/ExecutionController.ts
- packages/adapters/src/inbound/http/ExecutionController.test.ts
- packages/adapters/src/inbound/http/PreviewController.ts
- packages/adapters/src/inbound/jobs/ReconciliationJobHandler.ts
- packages/adapters/src/inbound/jobs/ReconciliationJobHandler.test.ts
- packages/testing/src/scenarios/approvalFlow.ts
- packages/testing/src/scenarios/StalePreviews.test.ts
- packages/testing/src/scenarios/PartialCompletionResume.test.ts
- packages/testing/src/scenarios/InterruptedSessionResume.test.ts
- packages/testing/src/scenarios/BreachToExitScenario.ts
- packages/application/src/use-cases/previews/GetExecutionPreview.ts
- packages/application/src/use-cases/execution/RecordSignatureInterruption.ts
- packages/application/src/use-cases/execution/RecordSignatureInterruption.test.ts
- packages/application/src/use-cases/execution/ResumeExecutionAttempt.ts
- packages/application/src/use-cases/execution/ResumeExecutionAttempt.test.ts
- packages/application/src/use-cases/execution/GetAwaitingSignaturePayload.ts
- packages/application/src/use-cases/execution/GetAwaitingSignaturePayload.test.ts
- packages/application/src/use-cases/execution/GetExecutionHistory.ts
- packages/application/src/use-cases/execution/GetExecutionHistory.test.ts
- packages/application/src/use-cases/execution/GetWalletExecutionHistory.ts
- packages/application/src/use-cases/execution/GetWalletExecutionHistory.test.ts
- packages/application/src/use-cases/execution/GetExecutionAttemptDetail.ts
- packages/application/src/use-cases/execution/GetExecutionAttemptDetail.test.ts
- packages/application/src/dto/index.ts
- packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts
- packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.test.ts
- packages/ui/src/screens/ExecutionPreviewScreen.tsx
- packages/ui/src/screens/HistoryDetailScreen.tsx
- packages/ui/src/screens/HistoryListScreen.tsx
- packages/ui/src/components/HistoryEventRow.tsx
- packages/ui/src/view-models/PreviewViewModel.ts
- packages/ui/src/view-models/PreviewViewModel.test.ts
- packages/ui/src/view-models/HistoryViewModel.ts
- packages/ui/src/view-models/HistoryViewModel.test.ts
- packages/ui/src/index.ts
- apps/app/app/signing/[attemptId].tsx
- apps/app/app/execution/[attemptId].tsx
- apps/app/src/api/executions.ts
- apps/app/src/api/executions.test.ts
- apps/app/src/api/previews.ts
- packages/testing/src/fakes/FakeExecutionHistoryRepository.ts
- packages/domain/src/execution/RetryBoundaryPolicy.test.ts

## Validation Commands

```bash
pnpm --filter @clmm/application test -- src/use-cases/previews/CreateExecutionPreview.test.ts src/use-cases/plans/CreatePlanExitPreview.test.ts src/use-cases/plans/ApprovePlanExit.test.ts
pnpm --filter @clmm/adapters test -- src/outbound/storage/PlanExecutionOriginStorage.test.ts
pnpm exec eslint packages/domain/src/execution/index.ts packages/domain/src/history/index.ts packages/application/src/ports/index.ts packages/testing/src/fakes/FakeExecutionRepository.ts packages/application/src/use-cases/previews/CreateExecutionPreview.ts packages/application/src/use-cases/previews/CreateExecutionPreview.test.ts packages/application/src/use-cases/execution/RequestWalletSignature.ts packages/application/src/use-cases/execution/RequestWalletSignature.test.ts packages/application/src/use-cases/execution/SubmitExecutionAttempt.ts packages/application/src/use-cases/execution/SubmitExecutionAttempt.test.ts packages/application/src/use-cases/execution/ReconcileExecutionAttempt.ts packages/application/src/use-cases/execution/ReconcileExecutionAttempt.test.ts packages/application/src/use-cases/execution/RecordSignatureDecline.ts packages/application/src/use-cases/execution/RecordSignatureDecline.test.ts packages/application/src/use-cases/execution/RecordExecutionAbandonment.ts packages/application/src/use-cases/execution/RecordExecutionAbandonment.test.ts packages/application/src/use-cases/plans/CreatePlanExitPreview.ts packages/application/src/use-cases/plans/CreatePlanExitPreview.test.ts packages/application/src/use-cases/plans/ApprovePlanExit.ts packages/application/src/use-cases/plans/ApprovePlanExit.test.ts packages/application/src/index.ts packages/application/src/public/index.ts packages/adapters/src/outbound/storage/schema/previews.ts packages/adapters/src/outbound/storage/schema/executions.ts packages/adapters/src/outbound/storage/schema/history.ts packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts packages/adapters/src/outbound/storage/PlanExecutionOriginStorage.test.ts packages/application/src/use-cases/previews/GetExecutionPreview.ts packages/application/src/use-cases/execution/RecordSignatureInterruption.ts packages/application/src/use-cases/execution/RecordSignatureInterruption.test.ts packages/application/src/use-cases/execution/ResumeExecutionAttempt.ts packages/application/src/use-cases/execution/ResumeExecutionAttempt.test.ts packages/application/src/use-cases/execution/GetAwaitingSignaturePayload.ts packages/application/src/use-cases/execution/GetAwaitingSignaturePayload.test.ts packages/application/src/use-cases/execution/GetExecutionHistory.ts packages/application/src/use-cases/execution/GetExecutionHistory.test.ts packages/application/src/use-cases/execution/GetWalletExecutionHistory.ts packages/application/src/use-cases/execution/GetWalletExecutionHistory.test.ts packages/application/src/use-cases/execution/GetExecutionAttemptDetail.ts packages/application/src/use-cases/execution/GetExecutionAttemptDetail.test.ts packages/application/src/dto/index.ts packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.test.ts packages/ui/src/screens/ExecutionPreviewScreen.tsx packages/ui/src/screens/HistoryDetailScreen.tsx packages/ui/src/screens/HistoryListScreen.tsx packages/ui/src/components/HistoryEventRow.tsx packages/ui/src/view-models/PreviewViewModel.ts packages/ui/src/view-models/PreviewViewModel.test.ts packages/ui/src/view-models/HistoryViewModel.ts packages/ui/src/view-models/HistoryViewModel.test.ts packages/ui/src/index.ts apps/app/app/signing/[attemptId].tsx apps/app/app/execution/[attemptId].tsx apps/app/src/api/executions.ts apps/app/src/api/executions.test.ts apps/app/src/api/previews.ts packages/testing/src/fakes/FakeExecutionHistoryRepository.ts packages/domain/src/execution/RetryBoundaryPolicy.test.ts
git diff --check -- packages/domain/src/execution/index.ts packages/domain/src/history/index.ts packages/application/src/ports/index.ts packages/testing/src/fakes/FakeExecutionRepository.ts packages/application/src/use-cases/previews/CreateExecutionPreview.ts packages/application/src/use-cases/previews/CreateExecutionPreview.test.ts packages/application/src/use-cases/execution/RequestWalletSignature.ts packages/application/src/use-cases/execution/RequestWalletSignature.test.ts packages/application/src/use-cases/execution/SubmitExecutionAttempt.ts packages/application/src/use-cases/execution/SubmitExecutionAttempt.test.ts packages/application/src/use-cases/execution/ReconcileExecutionAttempt.ts packages/application/src/use-cases/execution/ReconcileExecutionAttempt.test.ts packages/application/src/use-cases/execution/RecordSignatureDecline.ts packages/application/src/use-cases/execution/RecordSignatureDecline.test.ts packages/application/src/use-cases/execution/RecordExecutionAbandonment.ts packages/application/src/use-cases/execution/RecordExecutionAbandonment.test.ts packages/application/src/use-cases/plans/CreatePlanExitPreview.ts packages/application/src/use-cases/plans/CreatePlanExitPreview.test.ts packages/application/src/use-cases/plans/ApprovePlanExit.ts packages/application/src/use-cases/plans/ApprovePlanExit.test.ts packages/application/src/index.ts packages/application/src/public/index.ts packages/adapters/src/outbound/storage/schema/previews.ts packages/adapters/src/outbound/storage/schema/executions.ts packages/adapters/src/outbound/storage/schema/history.ts packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts packages/adapters/src/outbound/storage/PlanExecutionOriginStorage.test.ts packages/adapters/drizzle/0004_execution_origin.sql packages/adapters/drizzle/meta/0004_snapshot.json packages/adapters/drizzle/meta/_journal.json packages/application/src/use-cases/previews/GetExecutionPreview.ts packages/application/src/use-cases/execution/RecordSignatureInterruption.ts packages/application/src/use-cases/execution/RecordSignatureInterruption.test.ts packages/application/src/use-cases/execution/ResumeExecutionAttempt.ts packages/application/src/use-cases/execution/ResumeExecutionAttempt.test.ts packages/application/src/use-cases/execution/GetAwaitingSignaturePayload.ts packages/application/src/use-cases/execution/GetAwaitingSignaturePayload.test.ts packages/application/src/use-cases/execution/GetExecutionHistory.ts packages/application/src/use-cases/execution/GetExecutionHistory.test.ts packages/application/src/use-cases/execution/GetWalletExecutionHistory.ts packages/application/src/use-cases/execution/GetWalletExecutionHistory.test.ts packages/application/src/use-cases/execution/GetExecutionAttemptDetail.ts packages/application/src/use-cases/execution/GetExecutionAttemptDetail.test.ts packages/application/src/dto/index.ts packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.test.ts packages/ui/src/screens/ExecutionPreviewScreen.tsx packages/ui/src/screens/HistoryDetailScreen.tsx packages/ui/src/screens/HistoryListScreen.tsx packages/ui/src/components/HistoryEventRow.tsx packages/ui/src/view-models/PreviewViewModel.ts packages/ui/src/view-models/PreviewViewModel.test.ts packages/ui/src/view-models/HistoryViewModel.ts packages/ui/src/view-models/HistoryViewModel.test.ts packages/ui/src/index.ts apps/app/app/signing/[attemptId].tsx apps/app/app/execution/[attemptId].tsx apps/app/src/api/executions.ts apps/app/src/api/executions.test.ts apps/app/src/api/previews.ts packages/testing/src/fakes/FakeExecutionHistoryRepository.ts packages/domain/src/execution/RetryBoundaryPolicy.test.ts
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **plan exit never fabricates breach**: A Regime plan attempt persists a regime-plan origin and no synthetic lower/upper breach. (Test: `stores a plan exit without fabricating breach direction`)
- **material change blocks signing**: Closed, stale, superseded, ownership-mismatched, or materially changed positions cannot reach signing. (Test: `rejects a plan after position material change`)
- **explicit approval remains mandatory**: No accepted plan can prepare, sign, or submit without the user's approval and wallet signature. (Test: `requires explicit approval and wallet signature`)
- **execution replay cannot duplicate attempt**: Concurrent or repeated requests for one plan produce at most one preview and one attempt. (Test: `creates only one preview and attempt under replay`)

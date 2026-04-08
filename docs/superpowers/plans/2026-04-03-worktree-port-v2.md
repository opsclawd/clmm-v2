# Donor Port Plan v2: mvp-out-of-range-flow -> superpowers-v2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the MWA-compatible signing workflow, preview creation, navigation fixes, and wallet-scoped history from the `mvp-out-of-range-flow` donor worktree into `superpowers-v2`, without regressing the v2 pg-boss/AdaptersModule/prepared-payloads architecture.

**Architecture:** `superpowers-v2` is the only target branch. The donor worktree at `.worktrees/mvp-out-of-range-flow` is a reference, not a branch to finish. The port decomposes into 9 ordered tasks: foundation fixes first (preview creation, navigation, http client), then application-layer use cases, then BFF endpoints, then frontend signing route rewrite, then native wallet support, then validation hardening. Each task produces a working commit.

**Tech Stack:** TypeScript strict mode, NestJS, Expo Router, React Native, TanStack Query v5, Zustand v4, Drizzle, pg-boss, @solana/kit.

---

## Prior Plan Evaluation

Two plans already exist. Here is what each gets right, what each misses, and where this plan diverges.

### Minimax Plan (cherry-pick-mvp-signing-workflow.md)

**Strengths:**
- Correct feature inventory of what to port
- Provides concrete code snippets for each phase
- Good rollback plan per phase

**Weaknesses:**
- Doesn't address the fundamental `ApproveExecution` vs `RequestWalletSignature` architecture conflict. The donor's async/resumable model is strictly superior for MWA, but the plan treats the signing route rewrite as a drop-in replacement without acknowledging the backend flow must change too.
- Ignores the `http.ts` gap: superpowers-v2's `fetchJson` can only do GET. Every POST in the API clients uses raw `fetch` with duplicated error handling. The donor fixes this.
- Ignores the `ReconcileExecutionAttempt` idempotency guard needed for pg-boss retry safety.
- Ignores the `browserWallet.ts` `@solana/web3.js` removal question.
- Doesn't flag that `OperationalStorageAdapter.getAttempt` needs new fields (`walletId`, `signingExpiresAt`) regardless of which payload storage model wins.

### GPT-5.4 Plan (2026-04-03-worktree-port.md)

**Strengths:**
- Correctly identifies "Evaluate Before Porting" as a category
- Task 5 as an explicit decision gate for signing payload exposure is wise
- Strong "Do Not Do" list
- Better file-level task breakdown

**Weaknesses:**
- Too cautious on `RequestWalletSignature`. The code evidence shows the donor version is strictly superior: it validates preview freshness, persists the unsigned payload, uses typed errors, and doesn't require `WalletSigningPort` as a dependency. The superpowers-v2 version is a synchronous monolith that breaks on MWA app switch. This isn't an "evaluate" -- it's a "port".
- Task 5 hedges on the signing payload endpoint when the evidence is clear: without `GET /executions/:attemptId/signing-payload`, the MWA flow has no way to retrieve a persisted payload after returning from the wallet app. The `prepare` endpoint in superpowers-v2 returns the payload inline (fire-and-forget), which is incompatible with async signing.
- Doesn't address `http.ts` POST support.
- Doesn't address `ReconcileExecutionAttempt` idempotency.
- Doesn't address `browserWallet.ts` simplification.

### This Plan's Position

1. **The signing flow architecture must change.** The superpowers-v2 `ApproveExecution` use case and the `prepare` endpoint are fundamentally incompatible with MWA. The donor's async model (approve -> persist payload -> retrieve payload -> sign externally -> submit) is the correct architecture. This plan treats this as a requirement, not a decision gate.

2. **Keep superpowers-v2's `prepared_payloads` table** but adapt the flow to use it properly. The donor stores payloads as base64 text on the attempts row; superpowers-v2 stores them as bytea in a dedicated table with versioning. The dedicated table is the better design -- but the flow around it needs the donor's async semantics.

3. **Port `ReconcileExecutionAttempt` idempotency guard.** pg-boss retries jobs. Without the terminal-state guard, reconciliation makes redundant network calls on every retry. This is a production correctness issue.

4. **Simplify `browserWallet.ts`.** The donor removes `@solana/web3.js` dependency from browser wallet signing by operating on raw bytes instead of `VersionedTransaction` objects. Since AGENTS.md says "@solana/web3.js v1 is a pinned peer dep for MWA types ONLY -- never use its Connection or PublicKey class in logic", the donor's approach is architecturally correct.

5. **Fix `http.ts` first.** Many later tasks need POST support in `fetchJson`. Fix the foundation before building on it.

---

## Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Signing flow model | Donor's async/resumable | MWA requires payload persistence + deferred signing |
| Payload storage | Keep `prepared_payloads` table (superpowers-v2) | Better than inline columns: binary storage, versioning, explicit lifecycle |
| `ApproveExecution` use case | Replace with donor's `RequestWalletSignature` semantics | The monolithic approve-sign-submit pipeline breaks on MWA app switch |
| `browserWallet.ts` | Port donor's raw-bytes approach | Removes banned `@solana/web3.js` usage per AGENTS.md |
| `http.ts` | Port donor's POST support | Required foundation for all POST API client functions |
| `ReconcileExecutionAttempt` | Port donor's idempotency guard | Required for pg-boss retry safety |
| Donor worker/queue code | Ignore completely | superpowers-v2 already has correct pg-boss architecture |
| Donor storage schema | Ignore (keep `prepared_payloads` table) | superpowers-v2 schema is the better design |
| Donor Drizzle migrations | Ignore | Branch-local, not trustworthy for target migration history |

---

## File Structure

### Files to Create

| File | Responsibility |
|------|---------------|
| `packages/application/src/use-cases/execution/GetAwaitingSignaturePayload.ts` | Retrieve persisted unsigned payload for resumable signing |
| `packages/application/src/use-cases/execution/GetAwaitingSignaturePayload.test.ts` | 5-case coverage: found, not-found, wrong-state, missing-payload, expired |
| `packages/application/src/use-cases/execution/GetWalletExecutionHistory.ts` | Wallet-scoped history query |
| `packages/application/src/use-cases/execution/GetWalletExecutionHistory.test.ts` | Normal, empty, cross-wallet isolation |
| `packages/application/src/use-cases/execution/RecordSignatureInterruption.ts` | Non-terminal interruption recording (keeps `awaiting-signature`) |
| `packages/application/src/use-cases/execution/RecordSignatureInterruption.test.ts` | Interrupted, not-found, already-terminal |

### Files to Modify

| File | Changes |
|------|---------|
| `apps/app/src/api/http.ts` | Add POST support to `fetchJson`, structured error extraction |
| `apps/app/src/api/executions.ts` | Add signing-payload fetch, decline, interruption, wallet history; add DTO validation |
| `apps/app/src/api/previews.ts` | Add `createPreview`; add DTO validation |
| `apps/app/src/api/alerts.ts` | Add per-item DTO validation |
| `apps/app/app/(tabs)/alerts.tsx` | Preserve `triggerId` in navigation |
| `apps/app/app/preview/[triggerId].tsx` | Use `createPreview` mutation instead of refresh-as-create |
| `apps/app/app/signing/[attemptId].tsx` | Full rewrite: async signing, dual-wallet, decline/interruption |
| `apps/app/app/execution/[attemptId].tsx` | Add loading/error props |
| `apps/app/src/platform/nativeWallet.ts` | Add `signNativeTransaction` |
| `apps/app/src/platform/browserWallet.ts` | Remove `@solana/web3.js` dependency, operate on raw bytes |
| `apps/app/src/platform/index.ts` | Export `signNativeTransaction` |
| `packages/adapters/src/inbound/http/PreviewController.ts` | Add `POST /previews/:triggerId` |
| `packages/adapters/src/inbound/http/ExecutionController.ts` | Add signing-payload, wallet-history, decline, interruption endpoints; thin down approve/submit |
| `packages/application/src/dto/index.ts` | Add `ExecutionApprovalDto`, `ExecutionSigningPayloadDto` |
| `packages/application/src/use-cases/execution/RequestWalletSignature.ts` | Rewrite: persist payload, validate freshness, return immediately |
| `packages/application/src/use-cases/execution/SubmitExecutionAttempt.ts` | Add expiration guard before submission |
| `packages/application/src/use-cases/execution/ReconcileExecutionAttempt.ts` | Add terminal-state idempotency guard |
| `packages/application/src/index.ts` | Export new use cases |
| `packages/application/src/public/index.ts` | Export new DTOs |
| `packages/ui/src/screens/SigningStatusScreen.tsx` | Add `statusLoading`, `statusError`, `statusNotice`, `onDecline`, `onViewResult` props |
| `packages/ui/src/screens/ExecutionPreviewScreen.tsx` | Add `previewLoading`, `previewError` props |
| `packages/ui/src/screens/ExecutionResultScreen.tsx` | Add `resultLoading`, `resultError` props |
| `packages/ui/src/screens/AlertsListScreen.tsx` | Add `alertsLoading`, `alertsError` props |

### Files to Delete

| File | Reason |
|------|--------|
| `packages/application/src/use-cases/execution/ApproveExecution.ts` | Replaced by rewritten `RequestWalletSignature` |
| `packages/application/src/use-cases/execution/ApproveExecution.test.ts` | Same |
| `apps/app/src/api/history.ts` | Replaced by wallet-scoped history in `executions.ts` |

### Files to Ignore (donor-only, do not port)

| Donor file | Reason |
|------------|--------|
| `packages/adapters/src/inbound/jobs/*` | superpowers-v2 pg-boss architecture is correct |
| `packages/adapters/src/outbound/storage/schema/executions.ts` | Keep `prepared_payloads` table design |
| `packages/adapters/drizzle/0002_*` | Donor migration metadata is branch-local |
| `packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts` | Adapt minimally; don't adopt donor's inline payload columns |

---

## Implementation Tasks

### Task 1: Fix `http.ts` POST Support

This is a foundation task. superpowers-v2's `fetchJson` only supports GET. The donor's version accepts `RequestInit` for POST/PUT/etc. Many later tasks depend on this.

**Files:**
- Modify: `apps/app/src/api/http.ts`

- [ ] **Step 1: Read the current `http.ts`**

Read `apps/app/src/api/http.ts` to understand the current `fetchJson` signature and error handling.

- [ ] **Step 2: Update `fetchJson` to accept `RequestInit`**

Change the signature from `fetchJson(path: string)` to `fetchJson(path: string, init?: RequestInit)`. Pass `init` through to `fetch`. Add structured error extraction that parses JSON error responses for a `message` field (reference: donor's `extractErrorDetail` pattern).

```typescript
export async function fetchJson(path: string, init?: RequestInit): Promise<unknown> {
  const url = `${getBaseUrl()}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const detail = await extractErrorDetail(response);
    throw new Error(detail);
  }

  try {
    return await response.json();
  } catch {
    throw new Error('Response body was not valid JSON');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function extractErrorDetail(response: Response): Promise<string> {
  const fallback = `HTTP ${response.status}: ${response.statusText}`;
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && typeof body.message === 'string') {
      return body.message;
    }
    return fallback;
  } catch {
    return fallback;
  }
}
```

- [ ] **Step 3: Verify existing API clients still compile**

Run: `pnpm typecheck`
Expected: No regressions. The `init` parameter is optional, so existing GET calls are unchanged.

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/api/http.ts
git commit -m "fix: add POST support and structured error extraction to fetchJson"
```

---

### Task 2: Add Preview Creation Endpoint and Client

The current superpowers-v2 branch has no `POST /previews/:triggerId` endpoint. The preview route hacks around this by calling `refreshPreview` on initial load. The donor adds a proper create endpoint.

**Files:**
- Modify: `packages/adapters/src/inbound/http/PreviewController.ts`
- Modify: `apps/app/src/api/previews.ts`
- Modify: `apps/app/app/preview/[triggerId].tsx`

- [ ] **Step 1: Read the current PreviewController**

Read `packages/adapters/src/inbound/http/PreviewController.ts` to understand the existing endpoints and constructor injection.

- [ ] **Step 2: Add `POST /previews/:triggerId` to PreviewController**

Add a `createPreview` method that looks up the trigger, calls the `createExecutionPreview` use case, and returns the preview DTO. Place this method BEFORE the `refreshPreview` method to ensure NestJS route matching doesn't conflict (`:triggerId` vs `:triggerId/refresh`).

```typescript
@Post(':triggerId')
async createPreview(@Param('triggerId') triggerId: string) {
  const trigger = await this.triggerRepo.getTrigger(triggerId as ExitTriggerId);
  if (!trigger) {
    throw new NotFoundException(`Trigger not found: ${triggerId}`);
  }

  const result = await createExecutionPreview({
    positionId: trigger.positionId,
    breachDirection: trigger.breachDirection,
    swapQuotePort: this.swapQuotePort,
    executionRepo: this.executionRepo,
    clock: this.clock,
    ids: this.ids,
  });

  return {
    preview: toPreviewDto(result.previewId, trigger.positionId, trigger.breachDirection, result.preview),
  };
}
```

Add the `createExecutionPreview` import from `@clmm/application`.

- [ ] **Step 3: Add `createPreview` to the API client**

In `apps/app/src/api/previews.ts`, add:

```typescript
export async function createPreview(triggerId: string): Promise<ExecutionPreviewDto> {
  const payload = await fetchJson(`/previews/${triggerId}`, { method: 'POST' });
  if (!isRecord(payload) || !isRecord(payload.preview)) {
    throw new Error('Invalid create-preview response');
  }
  return payload.preview as ExecutionPreviewDto;
}
```

Import `fetchJson` (now supports POST from Task 1) and add the `isRecord` helper if not already present.

- [ ] **Step 4: Update the preview route to use `createPreview` mutation**

In `apps/app/app/preview/[triggerId].tsx`, replace the `useQuery` + `refreshPreview` pattern with a `useMutation` + `createPreview` pattern:

```typescript
const { mutateAsync, data: preview, isPending, error } = useMutation({
  mutationFn: createPreview,
  retry: 0,
});

useEffect(() => {
  if (triggerId == null) return;
  void mutateAsync(triggerId);
}, [triggerId, mutateAsync]);
```

Pass `previewLoading={isPending}` and `previewError={error instanceof Error ? error.message : null}` to `ExecutionPreviewScreen` (these props are added in Task 8).

- [ ] **Step 5: Verify typecheck passes**

Run: `pnpm typecheck`

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/src/inbound/http/PreviewController.ts apps/app/src/api/previews.ts apps/app/app/preview/\\[triggerId\\].tsx
git commit -m "feat: add explicit preview creation endpoint and client"
```

---

### Task 3: Fix Navigation -- Preserve triggerId Through Alert Flow

The superpowers-v2 alerts route drops `triggerId` when navigating to position detail, breaking the preview entry point.

**Files:**
- Modify: `apps/app/app/(tabs)/alerts.tsx`
- Modify: `apps/app/app/position/[id].tsx` (if needed)

- [ ] **Step 1: Read the current alerts route**

Read `apps/app/app/(tabs)/alerts.tsx` to see the `onSelectAlert` handler.

- [ ] **Step 2: Fix the alert selection navigation**

Change from:
```typescript
onSelectAlert={(triggerId, positionId) => router.push(`/position/${positionId}`)}
```
To:
```typescript
onSelectAlert={(triggerId, positionId) => {
  router.push({ pathname: '/position/[id]', params: { id: positionId, triggerId } });
}}
```

- [ ] **Step 3: Verify the position detail route accepts triggerId**

Read `apps/app/app/position/[id].tsx`. Verify it reads `triggerId` from `useLocalSearchParams` and passes it to the screen or uses it for preview navigation. If not, add:

```typescript
const params = useLocalSearchParams<{ id?: string | string[]; triggerId?: string }>();
```

And ensure `triggerId` is passed through to the preview navigation callback.

- [ ] **Step 4: Commit**

```bash
git add apps/app/app/\\(tabs\\)/alerts.tsx apps/app/app/position/\\[id\\].tsx
git commit -m "fix: preserve triggerId through alert navigation to position detail"
```

---

### Task 4: Add Application Use Cases (GetWalletExecutionHistory, RecordSignatureInterruption, GetAwaitingSignaturePayload)

These three use cases exist in the donor but not in superpowers-v2. They are prerequisites for the BFF endpoints and frontend.

**Files:**
- Create: `packages/application/src/use-cases/execution/GetWalletExecutionHistory.ts`
- Create: `packages/application/src/use-cases/execution/GetWalletExecutionHistory.test.ts`
- Create: `packages/application/src/use-cases/execution/RecordSignatureInterruption.ts`
- Create: `packages/application/src/use-cases/execution/RecordSignatureInterruption.test.ts`
- Create: `packages/application/src/use-cases/execution/GetAwaitingSignaturePayload.ts`
- Create: `packages/application/src/use-cases/execution/GetAwaitingSignaturePayload.test.ts`
- Modify: `packages/application/src/dto/index.ts`
- Modify: `packages/application/src/index.ts`
- Modify: `packages/application/src/public/index.ts`

- [ ] **Step 1: Read the donor versions of all three use cases**

Read these donor files for reference:
- `.worktrees/mvp-out-of-range-flow/packages/application/src/use-cases/execution/GetWalletExecutionHistory.ts`
- `.worktrees/mvp-out-of-range-flow/packages/application/src/use-cases/execution/RecordSignatureInterruption.ts`
- `.worktrees/mvp-out-of-range-flow/packages/application/src/use-cases/execution/GetAwaitingSignaturePayload.ts`

Also read the test files for each.

- [ ] **Step 2: Read the current application DTO file and index exports**

Read:
- `packages/application/src/dto/index.ts`
- `packages/application/src/index.ts`
- `packages/application/src/public/index.ts`

Understand what's already exported and the existing naming patterns.

- [ ] **Step 3: Add new DTOs**

Add to `packages/application/src/dto/index.ts`:

```typescript
export type ExecutionApprovalDto = {
  readonly attemptId: string;
  readonly lifecycleState: ExecutionLifecycleState;
  readonly breachDirection: BreachDirection;
};

export type ExecutionSigningPayloadDto = {
  readonly attemptId: string;
  readonly serializedPayload: string;
  readonly lifecycleState: ExecutionLifecycleState;
  readonly signingExpiresAt?: ClockTimestamp;
};
```

- [ ] **Step 4: Write `GetWalletExecutionHistory` use case**

Re-implement from donor. This is a simple thin query facade:

```typescript
import type { WalletId } from '@clmm/domain';
import type { ExecutionHistoryRepository } from '../../ports/index.js';
import type { HistoryEvent } from '@clmm/domain';

export type GetWalletExecutionHistoryInput = {
  readonly walletId: WalletId;
  readonly historyRepo: ExecutionHistoryRepository;
};

export type GetWalletExecutionHistoryResult = {
  readonly history: readonly HistoryEvent[];
};

export async function getWalletExecutionHistory(
  input: GetWalletExecutionHistoryInput,
): Promise<GetWalletExecutionHistoryResult> {
  const history = await input.historyRepo.getWalletHistory(input.walletId);
  return { history };
}
```

**Note:** This requires `getWalletHistory(walletId: WalletId)` on the `ExecutionHistoryRepository` port. Verify it exists; if not, add it to the port interface.

- [ ] **Step 5: Write `GetWalletExecutionHistory` tests**

Copy and adapt from donor test file. Cover: normal wallet history, empty result, cross-wallet isolation.

- [ ] **Step 6: Write `RecordSignatureInterruption` use case**

Re-implement from donor. Key behavior: records a `signature-interrupted` history event but does NOT change the attempt's lifecycle state (keeps `awaiting-signature`). This is the distinction from `RecordSignatureDecline` which transitions to `abandoned`.

```typescript
export type RecordSignatureInterruptionResult =
  | { readonly kind: 'interrupted' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'already-terminal'; readonly state: string };

export async function recordSignatureInterruption(
  input: RecordSignatureInterruptionInput,
): Promise<RecordSignatureInterruptionResult> {
  const attempt = await input.executionRepo.getAttempt(input.attemptId);
  if (!attempt) return { kind: 'not-found' };

  if (attempt.lifecycleState.kind !== 'awaiting-signature') {
    return { kind: 'already-terminal', state: attempt.lifecycleState.kind };
  }

  // Do NOT change lifecycle state -- interruption is observational, not a state transition
  await input.historyRepo.appendEvent({
    eventId: input.ids.generate(),
    positionId: attempt.positionId,
    kind: 'signature-interrupted',
    occurredAt: input.clock.now(),
    breachDirection: attempt.breachDirection,
    payload: { attemptId: input.attemptId },
  });

  return { kind: 'interrupted' };
}
```

- [ ] **Step 7: Write `RecordSignatureInterruption` tests**

Cover: successful interruption (state preserved), not-found, already-terminal (wrong state). Verify the signing payload is NOT cleared after interruption.

- [ ] **Step 8: Write `GetAwaitingSignaturePayload` use case**

Re-implement from donor, adapting for superpowers-v2's `prepared_payloads` table. The use case reads the payload from the repository (which in superpowers-v2 uses `getPreparedPayload` instead of `getAttemptSigningPayload`). If the signing window has expired, it proactively transitions the attempt to `expired`.

```typescript
export type GetAwaitingSignaturePayloadResult =
  | { readonly kind: 'found'; readonly serializedPayload: Uint8Array; readonly signingExpiresAt?: ClockTimestamp }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'not-signable'; readonly currentState: string }
  | { readonly kind: 'missing-payload' }
  | { readonly kind: 'expired' };
```

**Adaptation note:** The donor calls `executionRepo.getAttemptSigningPayload()`. In superpowers-v2, this should call the existing `getPreparedPayload(attemptId)` method which returns `{ unsignedPayload: Uint8Array, payloadVersion: string, expiresAt: number }`. Use `expiresAt` for the expiration check.

- [ ] **Step 9: Write `GetAwaitingSignaturePayload` tests**

5 cases: found (happy path), not-found, wrong state (not-signable), missing payload (attempt exists but no prepared payload), expired (with verification that attempt transitions to expired state and history event is logged).

- [ ] **Step 10: Update exports**

Add all three new use cases to `packages/application/src/index.ts` and the new DTOs to `packages/application/src/public/index.ts`.

- [ ] **Step 11: Run tests**

Run: `pnpm test:application`
Expected: All existing tests pass plus the 3 new test files.

- [ ] **Step 12: Commit**

```bash
git add packages/application/
git commit -m "feat: add wallet history, signature interruption, and signing payload retrieval use cases"
```

---

### Task 5: Rewrite `RequestWalletSignature` to Async/Resumable Model

The current superpowers-v2 `RequestWalletSignature` calls `signingPort.requestSignature()` synchronously and returns the signed payload. This breaks on MWA. Replace it with the donor's async model: persist the unsigned payload, return immediately with `awaiting-signature` state.

**Files:**
- Modify: `packages/application/src/use-cases/execution/RequestWalletSignature.ts`
- Modify: `packages/application/src/use-cases/execution/RequestWalletSignature.test.ts`
- Delete: `packages/application/src/use-cases/execution/ApproveExecution.ts`
- Delete: `packages/application/src/use-cases/execution/ApproveExecution.test.ts`
- Modify: `packages/application/src/index.ts` (remove ApproveExecution export)

- [ ] **Step 1: Read the current superpowers-v2 `RequestWalletSignature.ts` and `ApproveExecution.ts`**

Understand the current flow and what depends on `ApproveExecution`.

- [ ] **Step 2: Read the donor `RequestWalletSignature.ts`**

Read `.worktrees/mvp-out-of-range-flow/packages/application/src/use-cases/execution/RequestWalletSignature.ts` for the target behavior.

- [ ] **Step 3: Rewrite `RequestWalletSignature`**

Key changes from the current version:
1. Remove `WalletSigningPort` from the input type -- signing is no longer inline
2. Remove `positionId` and `breachDirection` params -- derive from the preview record
3. Add preview freshness validation: throw `PreviewApprovalNotAllowedError` if preview is not fresh
4. After calling `preparationPort.prepareExecution()`, persist the payload using the existing `savePreparedPayload` method (superpowers-v2 already has this)
5. Return `{ attemptId, lifecycleState: { kind: 'awaiting-signature' }, breachDirection }` immediately

```typescript
export class PreviewNotFoundError extends Error {
  constructor(previewId: string) {
    super(`Preview not found: ${previewId}`);
    this.name = 'PreviewNotFoundError';
  }
}

export class PreviewApprovalNotAllowedError extends Error {
  constructor(reason: string) {
    super(`Preview approval not allowed: ${reason}`);
    this.name = 'PreviewApprovalNotAllowedError';
  }
}

export type RequestWalletSignatureInput = {
  readonly previewId: string;
  readonly walletId: WalletId;
  readonly executionRepo: ExecutionRepository;
  readonly prepPort: ExecutionPreparationPort;
  readonly historyRepo: ExecutionHistoryRepository;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
};

export type RequestWalletSignatureResult = {
  readonly attemptId: string;
  readonly lifecycleState: { readonly kind: 'awaiting-signature' };
  readonly breachDirection: BreachDirection;
};
```

The body:
1. Fetch preview record from repo. If not found, throw `PreviewNotFoundError`.
2. Check `preview.freshness.kind !== 'fresh'`. If not fresh, throw `PreviewApprovalNotAllowedError`.
3. Generate attemptId.
4. Build execution plan from domain.
5. Call `prepPort.prepareExecution()` to get serialized unsigned payload.
6. Save attempt with `awaiting-signature` state (include `walletId` if the schema supports it, or add `previewId` linkage).
7. Save prepared payload via `executionRepo.savePreparedPayload({ attemptId, unsignedPayload, payloadVersion, expiresAt })`.
8. Append `signature-requested` history event.
9. Return `{ attemptId, lifecycleState, breachDirection }`.

- [ ] **Step 4: Update tests**

Rewrite `RequestWalletSignature.test.ts` to cover:
- Happy path: preview is fresh, payload persisted, attempt saved, history event logged
- Preview not found: throws `PreviewNotFoundError`
- Preview not fresh: throws `PreviewApprovalNotAllowedError`
- Verify `WalletSigningPort` is NOT called (async model)

- [ ] **Step 5: Delete `ApproveExecution.ts` and `ApproveExecution.test.ts`**

These are replaced by the rewritten `RequestWalletSignature`.

- [ ] **Step 6: Update `index.ts` exports**

Remove `ApproveExecution` export. Ensure `RequestWalletSignature`, `PreviewNotFoundError`, and `PreviewApprovalNotAllowedError` are exported.

- [ ] **Step 7: Run tests**

Run: `pnpm test:application`

- [ ] **Step 8: Commit**

```bash
git add packages/application/
git commit -m "feat: rewrite RequestWalletSignature to async/resumable model for MWA compatibility"
```

---

### Task 6: Harden SubmitExecutionAttempt and ReconcileExecutionAttempt

Port two important safety improvements from the donor.

**Files:**
- Modify: `packages/application/src/use-cases/execution/SubmitExecutionAttempt.ts`
- Modify: `packages/application/src/use-cases/execution/SubmitExecutionAttempt.test.ts`
- Modify: `packages/application/src/use-cases/execution/ReconcileExecutionAttempt.ts`
- Modify: `packages/application/src/use-cases/execution/ReconcileExecutionAttempt.test.ts`

- [ ] **Step 1: Read current versions of both files and their tests**

Read all 4 files in superpowers-v2 and the 2 donor implementation files.

- [ ] **Step 2: Add expiration guard to `SubmitExecutionAttempt`**

Before calling `submissionPort.submitExecution()`, check if the signing window has expired:

```typescript
// Check for expired signing window
if (attempt.signingExpiresAt != null) {
  const now = input.clock.now();
  if (now > attempt.signingExpiresAt) {
    await input.executionRepo.updateAttemptState(input.attemptId, { kind: 'expired' });
    await input.historyRepo.appendEvent({
      eventId: input.ids.generate(),
      positionId: attempt.positionId,
      kind: 'preview-expired',
      occurredAt: now,
      breachDirection: attempt.breachDirection,
      payload: { attemptId: input.attemptId },
    });
    return { kind: 'expired' as const };
  }
}
```

Add `'expired'` to the result union type. This requires `signingExpiresAt` on the attempt record. If the current `StoredExecutionAttempt` type doesn't include it, it needs to be added (check whether the `prepared_payloads` table `expires_at` column can serve this purpose via a join or if the attempt record needs the field).

- [ ] **Step 3: Add expiration guard tests**

Add test cases for:
- Submit with expired signing window -> returns `{ kind: 'expired' }`, attempt transitioned, history event logged
- Submit with valid signing window -> proceeds normally

- [ ] **Step 4: Add idempotency guard to `ReconcileExecutionAttempt`**

Before calling `submissionPort.reconcileExecution()`, check if the attempt is already in a terminal state:

```typescript
// Idempotency guard: don't re-reconcile terminal attempts
const terminalStates = ['confirmed', 'partial', 'abandoned'] as const;
if (terminalStates.some(s => s === attempt.lifecycleState.kind)) {
  return {
    kind: attempt.lifecycleState.kind as 'confirmed' | 'partial',
    completedSteps: attempt.completedSteps ?? [],
    transactionReferences: attempt.transactionReferences ?? [],
  };
}
```

- [ ] **Step 5: Add idempotency guard tests**

Test that reconciling an already-confirmed attempt returns the stored result without calling the submission port. Test same for `partial` state.

- [ ] **Step 6: Run tests**

Run: `pnpm test:application`

- [ ] **Step 7: Commit**

```bash
git add packages/application/src/use-cases/execution/
git commit -m "fix: add expiration guard to submit and idempotency guard to reconcile"
```

---

### Task 7: Add BFF Endpoints (Signing Payload, Wallet History, Decline, Interruption)

Wire the new application use cases to BFF HTTP endpoints.

**Files:**
- Modify: `packages/adapters/src/inbound/http/ExecutionController.ts`
- Modify: `packages/adapters/src/inbound/http/ExecutionController.test.ts` (if exists)

- [ ] **Step 1: Read the current ExecutionController**

Read `packages/adapters/src/inbound/http/ExecutionController.ts` to understand the existing endpoints, constructor injection, and helper functions.

- [ ] **Step 2: Add `GET :attemptId/signing-payload` endpoint**

```typescript
@Get(':attemptId/signing-payload')
async getSigningPayload(@Param('attemptId') attemptId: string) {
  const result = await getAwaitingSignaturePayload({
    attemptId,
    executionRepo: this.executionRepo,
    historyRepo: this.historyRepo,
    clock: this.clock,
    ids: this.ids,
  });

  switch (result.kind) {
    case 'not-found':
      throw new NotFoundException(`Attempt not found: ${attemptId}`);
    case 'not-signable':
      throw new ConflictException(`Attempt ${attemptId} is not in a signable state (current: ${result.currentState})`);
    case 'missing-payload':
      throw new ConflictException(`Attempt ${attemptId} has no signing payload`);
    case 'expired':
      throw new ConflictException(`Attempt ${attemptId} expired before signing`);
    case 'found':
      return {
        signingPayload: {
          attemptId,
          serializedPayload: Buffer.from(result.serializedPayload).toString('base64'),
          lifecycleState: { kind: 'awaiting-signature' },
          signingExpiresAt: result.signingExpiresAt,
        } satisfies ExecutionSigningPayloadDto,
      };
  }
}
```

**Important:** This endpoint must be declared BEFORE the `@Get(':attemptId')` route in the controller class, otherwise NestJS will match `signing-payload` as an `:attemptId` parameter.

- [ ] **Step 3: Add `GET history/wallet/:walletId` endpoint**

```typescript
@Get('history/wallet/:walletId')
async getWalletExecutionHistory(@Param('walletId') walletId: string) {
  const result = await getWalletExecutionHistory({
    walletId: walletId as WalletId,
    historyRepo: this.historyRepo,
  });

  return {
    history: result.history.map((event) => ({
      eventId: event.eventId,
      positionId: event.positionId,
      kind: event.kind,
      occurredAt: event.occurredAt,
      breachDirection: event.breachDirection,
      payload: event.payload,
    })),
  };
}
```

**Important:** This endpoint must be declared BEFORE the `@Get('history/:positionId')` route, or NestJS will match `wallet` as a `:positionId`.

- [ ] **Step 4: Add `POST :attemptId/decline-signature` endpoint**

```typescript
@Post(':attemptId/decline-signature')
async declineSignature(
  @Param('attemptId') attemptId: string,
  @Body() body: { breachDirection?: 'lower-bound-breach' | 'upper-bound-breach' },
) {
  const result = await recordSignatureDecline({
    attemptId,
    executionRepo: this.executionRepo,
    historyRepo: this.historyRepo,
    clock: this.clock,
    ids: this.ids,
  });

  if (result.kind === 'not-found') throw new NotFoundException(`Attempt not found: ${attemptId}`);
  if (result.kind === 'already-terminal') {
    throw new ConflictException(`Attempt ${attemptId} is already in state: ${result.state}`);
  }

  return { declined: true, state: result.kind };
}
```

- [ ] **Step 5: Add `POST :attemptId/interrupt-signature` endpoint**

```typescript
@Post(':attemptId/interrupt-signature')
async interruptSignature(
  @Param('attemptId') attemptId: string,
  @Body() body: { breachDirection?: 'lower-bound-breach' | 'upper-bound-breach' },
) {
  const result = await recordSignatureInterruption({
    attemptId,
    executionRepo: this.executionRepo,
    historyRepo: this.historyRepo,
    clock: this.clock,
    ids: this.ids,
  });

  if (result.kind === 'not-found') throw new NotFoundException(`Attempt not found: ${attemptId}`);
  if (result.kind === 'already-terminal') {
    throw new ConflictException(`Attempt ${attemptId} is already in state: ${result.state}`);
  }

  return { interrupted: true, state: result.kind };
}
```

- [ ] **Step 6: Thin down the `approveExecution` endpoint**

The current `approveExecution` method has inline orchestration (manual attempt creation, history event appending). Rewrite it to delegate to the rewritten `RequestWalletSignature` use case:

```typescript
@Post('approve')
async approveExecution(@Body() body: { previewId: string; walletId: string }) {
  try {
    const result = await requestWalletSignature({
      previewId: body.previewId,
      walletId: body.walletId as WalletId,
      executionRepo: this.executionRepo,
      prepPort: this.preparationPort,
      historyRepo: this.historyRepo,
      clock: this.clock,
      ids: this.ids,
    });

    return {
      approval: {
        attemptId: result.attemptId,
        lifecycleState: result.lifecycleState,
        breachDirection: result.breachDirection,
      } satisfies ExecutionApprovalDto,
    };
  } catch (error) {
    if (error instanceof PreviewNotFoundError) {
      throw new NotFoundException(error.message);
    }
    if (error instanceof PreviewApprovalNotAllowedError) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }
}
```

Note: this changes the request body from `{ previewId, triggerId, breachDirection? }` to `{ previewId, walletId }`. The triggerId is no longer needed because the preview record contains the position and direction. The walletId is needed for attempt ownership.

- [ ] **Step 7: Update imports**

Add imports for: `getAwaitingSignaturePayload`, `getWalletExecutionHistory`, `recordSignatureDecline`, `recordSignatureInterruption`, `requestWalletSignature`, `PreviewNotFoundError`, `PreviewApprovalNotAllowedError`, `ExecutionApprovalDto`, `ExecutionSigningPayloadDto`.

- [ ] **Step 8: Verify typecheck**

Run: `pnpm typecheck`

- [ ] **Step 9: Run adapter tests**

Run: `pnpm test:adapters`

- [ ] **Step 10: Commit**

```bash
git add packages/adapters/src/inbound/http/ExecutionController.ts
git commit -m "feat: add signing-payload, wallet-history, decline, and interruption endpoints"
```

---

### Task 8: Add Loading/Error Props to UI Screens

The donor branch adds `loading`, `error`, and empty-state trifecta to all major screens. Port this.

**Files:**
- Modify: `packages/ui/src/screens/SigningStatusScreen.tsx`
- Modify: `packages/ui/src/screens/ExecutionPreviewScreen.tsx`
- Modify: `packages/ui/src/screens/ExecutionResultScreen.tsx`
- Modify: `packages/ui/src/screens/AlertsListScreen.tsx`

- [ ] **Step 1: Read all four screen files**

Read the current superpowers-v2 versions of all four screens.

- [ ] **Step 2: Update `SigningStatusScreen.tsx`**

Add to the Props type:
```typescript
statusLoading?: boolean;
statusError?: string | null;
statusNotice?: string | null;
onDecline?: () => void;
onViewResult?: () => void;
```

Add rendering:
- If `statusLoading`, show loading indicator
- If `statusError`, show error message
- If `statusNotice`, show notice banner (e.g., "Signature declined" in a green banner)
- Add "Decline Signing" button when `onDecline` is provided AND `lifecycleState.kind === 'awaiting-signature'`
- Add "View Execution Result" button when `onViewResult` is provided AND state is terminal (`submitted`, `confirmed`, `failed`, `partial`)

- [ ] **Step 3: Update `ExecutionPreviewScreen.tsx`**

Add to Props:
```typescript
previewLoading?: boolean;
previewError?: string | null;
```

Add rendering: loading state, error state ("Could not load exit preview"), empty state ("No preview available").

- [ ] **Step 4: Update `ExecutionResultScreen.tsx`**

Add to Props:
```typescript
resultLoading?: boolean;
resultError?: string | null;
```

Add rendering: loading state, error state ("Could not load execution result"), empty state.

- [ ] **Step 5: Update `AlertsListScreen.tsx`**

Add to Props:
```typescript
alertsLoading?: boolean;
alertsError?: string | null;
```

Add rendering: loading state ("Loading actionable alerts"), error state ("Could not load alerts").

- [ ] **Step 6: Run typecheck**

Run: `pnpm typecheck`

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/screens/
git commit -m "feat: add loading and error state handling to all major screens"
```

---

### Task 9: Add API Client Functions and DTO Validation

Port the donor's comprehensive API client functions and DTO validation guards.

**Files:**
- Modify: `apps/app/src/api/executions.ts`
- Modify: `apps/app/src/api/previews.ts`
- Modify: `apps/app/src/api/alerts.ts`

- [ ] **Step 1: Read the donor API client files for reference**

Read:
- `.worktrees/mvp-out-of-range-flow/apps/app/src/api/executions.ts`
- `.worktrees/mvp-out-of-range-flow/apps/app/src/api/alerts.ts`

- [ ] **Step 2: Read the current superpowers-v2 API client files**

Read:
- `apps/app/src/api/executions.ts`
- `apps/app/src/api/alerts.ts`

- [ ] **Step 3: Add DTO validation helpers to `executions.ts`**

Add `isExecutionAttemptDto`, `isExecutionApprovalDto`, `isExecutionSigningPayloadDto`, `isHistoryEventDto` guard functions. These validate the structure of server responses at runtime, preventing silent type mismatches.

- [ ] **Step 4: Add new API client functions to `executions.ts`**

Add these functions (using `fetchJson` with POST support from Task 1):

```typescript
export async function approveExecutionPreview(input: {
  previewId: string;
  walletId: string;
}): Promise<ExecutionApprovalDto> {
  const payload = await fetchJson('/executions/approve', {
    method: 'POST',
    body: JSON.stringify({ previewId: input.previewId, walletId: input.walletId }),
  });
  // validate with isExecutionApprovalDto
  // ...
}

export async function fetchExecutionSigningPayload(attemptId: string): Promise<ExecutionSigningPayloadDto> {
  const payload = await fetchJson(`/executions/${attemptId}/signing-payload`);
  // validate with isExecutionSigningPayloadDto
  // ...
}

export async function recordSignatureDecline(attemptId: string): Promise<{ declined: boolean }> {
  const payload = await fetchJson(`/executions/${attemptId}/decline-signature`, { method: 'POST' });
  // ...
}

export async function recordSignatureInterruption(attemptId: string): Promise<{ interrupted: boolean }> {
  const payload = await fetchJson(`/executions/${attemptId}/interrupt-signature`, { method: 'POST' });
  // ...
}

export async function fetchWalletExecutionHistory(walletId: string): Promise<HistoryEventDto[]> {
  const payload = await fetchJson(`/executions/history/wallet/${walletId}`);
  // validate with isHistoryEventDto per item
  // ...
}
```

- [ ] **Step 5: Update `approveExecution` in `executions.ts`**

Change the existing approve function to use the new endpoint contract (body: `{ previewId, walletId }` instead of raw fetch with `{ previewId, triggerId }`). Use `fetchJson` instead of raw `fetch`.

- [ ] **Step 6: Add per-item validation to `alerts.ts`**

Add `isActionableAlertDto` guard that validates `triggerId`, `positionId`, `triggeredAt`, `breachDirection`, and optional `previewId` on each alert item.

- [ ] **Step 7: Run typecheck**

Run: `pnpm typecheck`

- [ ] **Step 8: Commit**

```bash
git add apps/app/src/api/
git commit -m "feat: add signing payload, decline, interruption, and wallet history API clients with DTO validation"
```

---

### Task 10: Simplify `browserWallet.ts` and Add `signNativeTransaction`

Port the donor's dual-wallet signing capability. The donor removes `@solana/web3.js` from browser wallet signing (operating on raw bytes) and adds MWA transaction signing.

**Files:**
- Modify: `apps/app/src/platform/browserWallet.ts`
- Modify: `apps/app/src/platform/nativeWallet.ts`
- Modify: `apps/app/src/platform/index.ts`

- [ ] **Step 1: Read current `browserWallet.ts` and donor version**

Read both:
- `apps/app/src/platform/browserWallet.ts`
- `.worktrees/mvp-out-of-range-flow/apps/app/src/platform/browserWallet.ts`

- [ ] **Step 2: Simplify `browserWallet.ts`**

Remove the `@solana/web3.js` import and `VersionedTransaction` deserialization. Change `signTransactionWithBrowserWallet` to accept `serializedPayload: string` (base64) and return `string` (base64):

```typescript
export async function signBrowserTransaction(params: {
  browserWindow: Window;
  serializedPayload: string;
}): Promise<string> {
  const provider = findPhantomProvider(params.browserWindow);
  if (!provider?.signTransaction) {
    throw new Error('Browser wallet does not support transaction signing');
  }

  const payloadBytes = decodeBase64Payload(params.serializedPayload);
  const signed = await provider.signTransaction(payloadBytes);
  return encodeBase64Payload(normalizeSignedResult(signed));
}
```

Add `decodeBase64Payload`, `encodeBase64Payload`, and `normalizeSignedResult` helpers. The `BrowserWalletProvider.signTransaction` signature changes from `(transaction: VersionedTransaction)` to `(payload: Uint8Array)`.

- [ ] **Step 3: Add `signNativeTransaction` to `nativeWallet.ts`**

Re-implement from donor:

```typescript
export async function signNativeTransaction(params: {
  serializedPayload: string;
  walletId: string;
  cluster?: string;
}): Promise<string> {
  return transact(async (wallet) => {
    const signingWallet = wallet as unknown as NativeSigningWallet; // boundary: MWA types
    const authorization = await signingWallet.authorize({
      identity: APP_IDENTITY,
      chain: (params.cluster ?? 'solana:mainnet') as Chain,
    });

    const account = authorization.accounts[0];
    if (!account || account.address !== params.walletId) {
      throw new Error('Native wallet did not return the requested authorized account');
    }

    const signed = await signingWallet.signTransactions({
      payloads: [params.serializedPayload],
    });

    const signedPayload = signed.signed_payloads[0];
    if (typeof signedPayload !== 'string' || signedPayload.length === 0) {
      throw new Error('Native wallet did not return a signed payload');
    }

    return signedPayload;
  });
}
```

Add `NativeSigningWallet` type with `authorize` and `signTransactions` methods.

- [ ] **Step 4: Update `index.ts` exports**

Export `signNativeTransaction` and the renamed `signBrowserTransaction`.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/platform/
git commit -m "feat: add native wallet signing and remove @solana/web3.js from browser wallet"
```

---

### Task 11: Rewrite Signing Route

This is the most complex task. Replace the current self-contained signing route with the donor's async model that supports both browser and native wallets, plus decline/interruption recording.

**Files:**
- Modify: `apps/app/app/signing/[attemptId].tsx`

- [ ] **Step 1: Read the current signing route and donor version**

Read both:
- `apps/app/app/signing/[attemptId].tsx`
- `.worktrees/mvp-out-of-range-flow/apps/app/app/signing/[attemptId].tsx`

- [ ] **Step 2: Rewrite the signing route**

Key architectural changes:
1. **Remove local signing state machine** (`idle` | `preparing` | `signing` | `submitting` | `error`). Use `useMutation` for signing and decline instead.
2. **Read `connectionKind` from `walletSessionStore`** to dispatch to browser or native signing.
3. **Fetch signing payload via API** instead of calling `prepareExecution` inline.
4. **Add decline mutation** that calls `recordSignatureDecline` API.
5. **Add interruption recording** when wallet signing is cancelled or interrupted.
6. **Pass loading/error/notice to screen** instead of managing presentation in the route.

Structure:

```typescript
export default function SigningRoute() {
  const { attemptId } = useLocalSearchParams<{ attemptId: string }>();
  const router = useRouter();
  const walletAddress = walletSessionStore.getState().walletAddress;
  const connectionKind = walletSessionStore.getState().connectionKind;

  // Query: fetch attempt details
  const executionQuery = useQuery({
    queryKey: ['execution', attemptId],
    queryFn: () => fetchExecution(attemptId!),
    enabled: attemptId != null,
  });

  // Query: fetch signing payload (only when awaiting-signature)
  const signingPayloadQuery = useQuery({
    queryKey: ['signing-payload', attemptId],
    queryFn: () => fetchExecutionSigningPayload(attemptId!),
    enabled: attemptId != null && executionQuery.data?.lifecycleState.kind === 'awaiting-signature',
  });

  // Mutation: sign + submit
  const signMutation = useMutation({
    mutationFn: async () => {
      const payload = signingPayloadQuery.data;
      if (!payload) throw new Error('No signing payload available');

      let signedPayload: string;
      if (connectionKind === 'native') {
        signedPayload = await signNativeTransaction({
          serializedPayload: payload.serializedPayload,
          walletId: walletAddress!,
        });
      } else {
        signedPayload = await signBrowserTransaction({
          browserWindow: window,
          serializedPayload: payload.serializedPayload,
        });
      }

      return submitExecution({ attemptId: attemptId!, signedPayload });
    },
    onSuccess: () => {
      router.replace(`/execution/${attemptId}`);
    },
    onError: (error) => {
      const outcome = mapWalletErrorToOutcome(error);
      if (outcome === 'cancelled') {
        void recordSignatureDecline(attemptId!);
      } else if (outcome === 'interrupted') {
        void recordSignatureInterruption(attemptId!);
      }
    },
  });

  // Mutation: explicit decline
  const declineMutation = useMutation({
    mutationFn: () => recordSignatureDecline(attemptId!),
    onSuccess: () => router.replace(`/execution/${attemptId}`),
  });

  // Auto-redirect on terminal states
  useEffect(() => {
    const state = executionQuery.data?.lifecycleState.kind;
    if (state === 'confirmed' || state === 'failed' || state === 'partial' || state === 'abandoned') {
      router.replace(`/execution/${attemptId}`);
    }
  }, [executionQuery.data?.lifecycleState.kind]);

  return (
    <SigningStatusScreen
      execution={executionQuery.data ?? null}
      statusLoading={signMutation.isPending || declineMutation.isPending}
      statusError={signMutation.error?.message ?? null}
      statusNotice={declineMutation.isSuccess ? 'Signing declined' : null}
      onSign={() => signMutation.mutate()}
      onDecline={() => declineMutation.mutate()}
      onViewResult={() => router.push(`/execution/${attemptId}`)}
    />
  );
}
```

Add `mapWalletErrorToOutcome` helper that distinguishes between user cancellation (wallet rejected), interruption (app switch / timeout), and genuine errors.

- [ ] **Step 3: Update the execution route to pass loading/error**

In `apps/app/app/execution/[attemptId].tsx`, pass `resultLoading` and `resultError` to `ExecutionResultScreen`.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`

- [ ] **Step 5: Commit**

```bash
git add apps/app/app/signing/\\[attemptId\\].tsx apps/app/app/execution/\\[attemptId\\].tsx
git commit -m "feat: rewrite signing route with async model, dual-wallet support, and decline/interruption"
```

---

### Task 12: Wire Wallet-Scoped History and Clean Up Dead Code

Replace the current history tab's position-scoped call with wallet-scoped history, and remove dead code.

**Files:**
- Modify: `apps/app/app/(tabs)/history.tsx`
- Delete: `apps/app/src/api/history.ts`

- [ ] **Step 1: Read the current history tab route**

Read `apps/app/app/(tabs)/history.tsx` to understand the current wiring.

- [ ] **Step 2: Switch to wallet-scoped history**

Replace the `fetchExecutionHistory(positionId)` call with `fetchWalletExecutionHistory(walletId)` from the updated `executions.ts` API client. Get `walletId` from `walletSessionStore`.

- [ ] **Step 3: Delete `apps/app/src/api/history.ts`**

This file is now redundant -- its functionality is in `executions.ts`.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`

- [ ] **Step 5: Commit**

```bash
git add apps/app/app/\\(tabs\\)/history.tsx && git rm apps/app/src/api/history.ts
git commit -m "feat: switch history tab to wallet-scoped data and remove dead history API client"
```

---

### Task 13: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
pnpm test
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Run boundary enforcement**

```bash
pnpm boundaries
```

Verify no banned imports were introduced (especially `@solana/web3.js` in non-MWA-type code).

- [ ] **Step 4: Manual flow verification**

Verify the route sequence:
1. Connect wallet (native on mobile, browser on web)
2. Alerts list loads with loading/error states
3. Select alert -> position detail with triggerId preserved
4. View Exit Preview -> preview creates via POST (not refresh hack)
5. Approve -> signing screen shows
6. Sign with browser or native wallet
7. Decline option visible and functional
8. Submit -> execution result screen with loading/error states
9. History tab shows wallet-scoped data

- [ ] **Step 5: Verify no donor architecture leaked in**

Grep for banned patterns:
```bash
pnpm boundaries
```

Confirm:
- No in-memory queue code
- No donor Drizzle migrations
- No `@solana/web3.js` usage outside the pinned MWA type boundary
- `DirectionalExitPolicyService` remains the sole source of directional mapping
- `prepared_payloads` table is intact (not replaced by inline columns)

---

## Success Criteria

The port is complete when all of the following are true on `superpowers-v2`:

1. Preview entry uses explicit `POST /previews/:triggerId` (not refresh hack)
2. Alert navigation preserves `triggerId` through to position detail
3. History tab is wallet-scoped via `GET /executions/history/wallet/:walletId`
4. `RequestWalletSignature` persists unsigned payload and returns immediately (async model)
5. `GET /executions/:attemptId/signing-payload` retrieves the persisted payload
6. Signing route dispatches to browser or native wallet based on `connectionKind`
7. Signing screen has explicit Decline button and records decline/interruption
8. `SubmitExecutionAttempt` refuses expired signing windows
9. `ReconcileExecutionAttempt` is idempotent for terminal states
10. `browserWallet.ts` does not import `@solana/web3.js`
11. All screens have loading/error/empty state handling
12. `pnpm test`, `pnpm typecheck`, and `pnpm boundaries` pass
13. No worker, queue, or storage regressions from donor architecture

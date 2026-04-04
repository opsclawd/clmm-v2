# Cherry-Pick Plan: mvp-out-of-range-flow → superpowers-v2

**Date:** 2026-04-03
**Source:** `mvp-out-of-range-flow` worktree (branch: `mvp-out-of-range-flow`)
**Target:** `superpowers-v2` branch
**Goal:** Port complete signing workflow features from v1 design branch into v2 design branch

---

## Executive Summary

The `mvp-out-of-range-flow` worktree implements a more complete signing workflow than `superpowers-v2`, but uses an in-memory queue architecture that the v2 design explicitly replaced with real pg-boss. Rather than finishing the stale worktree, this plan extracts the client-side signing workflow completeness and ports it into `superpowers-v2`.

**Key features to port:**
- Native wallet (MWA) signing support for mobile
- Signature decline/interrupt recording
- Separate signing payload endpoint
- Wallet-scoped execution history
- Create preview from trigger (lazy pattern)
- Full DTO validation in API clients
- Trigger ID preservation in navigation

---

## Comparison: What Each Branch Has

### Backend (BFF + Worker)

| Feature | mvp-out-of-range-flow | superpowers-v2 |
|---------|----------------------|----------------|
| pg-boss integration | ❌ In-memory queue | ✅ Real pg-boss with `PgBossProvider` + `WorkerLifecycle` |
| AdaptersModule | ❌ Empty | ✅ Fully wired |
| Observability | ❌ None | ✅ Full `ObservabilityPort` instrumentation |
| Create preview endpoint | ✅ `POST /previews/:triggerId` | ❌ Missing |
| Get signing payload endpoint | ✅ `GET /executions/:attemptId/signing-payload` | ❌ Missing |
| Wallet execution history | ✅ `GET /executions/history/wallet/:walletId` | ❌ Missing |
| Decline signature endpoint | ✅ `POST /:attemptId/decline-signature` | ❌ Missing |
| Interrupt signature endpoint | ✅ `POST /:attemptId/interrupt-signature` | ❌ Missing |
| Payload versioning | ❌ Columns on `execution_attempts` | ✅ Separate `prepared_payloads` table |
| Transient error handling | ❌ None | ✅ Graceful degradation |

### Frontend (App + UI)

| Feature | mvp-out-of-range-flow | superpowers-v2 |
|---------|----------------------|----------------|
| Native wallet signing | ✅ `signNativeTransaction()` | ❌ Missing (only `connectNativeWallet`) |
| Browser wallet signing | ✅ Full | ✅ Full |
| Decline/interrupt recording | ✅ Mutations implemented | ❌ Not wired |
| Alerts navigation | ✅ Preserves `triggerId` | ❌ **Bug: drops triggerId** |
| Create preview pattern | ✅ Lazy mutation on mount | ❌ Uses `refreshPreview` as query |
| DTO validation in API clients | ✅ Extensive guards | ❌ Minimal |
| Status notices in signing | ✅ `statusNotice`, `statusError` | ❌ Not implemented |
| Decline button in UI | ✅ Implemented | ❌ Not implemented |

---

## Implementation Phases

### Phase 1: BFF Endpoints

**Complexity:** Medium | **Risk:** Low

#### 1.1 Add `POST /previews/:triggerId` (create preview)

**File:** `packages/adapters/src/inbound/http/PreviewController.ts`

**Add method after `getPreview`:**
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

**Requires:** Import `createExecutionPreview` from `@clmm/application`.

---

#### 1.2 Add `GET /executions/:attemptId/signing-payload`

**File:** `packages/adapters/src/inbound/http/ExecutionController.ts`

**Add method before `getExecution`:**
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

  if (result.kind === 'not-found') {
    throw new NotFoundException(`Attempt not found: ${attemptId}`);
  }
  if (result.kind === 'not-signable') {
    throw new ConflictException(
      `Attempt ${attemptId} cannot provide signing payload from state ${result.currentState}`,
    );
  }
  if (result.kind === 'missing-payload') {
    throw new ConflictException(
      `Attempt ${attemptId} is awaiting signature but its signing payload is missing`,
    );
  }
  if (result.kind === 'expired') {
    throw new ConflictException(
      `Attempt ${attemptId} expired before signing. Refresh preview and create a new attempt.`,
    );
  }

  return { signingPayload: toSigningPayloadDto(result) };
}
```

**Requires:**
- Import `getAwaitingSignaturePayload` from `@clmm/application`
- Import `ExecutionSigningPayloadDto` from `@clmm/application`
- Add `toSigningPayloadDto` helper function
- Add DTO to `packages/application/src/dto/index.ts`

---

#### 1.3 Add `GET /executions/history/wallet/:walletId`

**File:** `packages/adapters/src/inbound/http/ExecutionController.ts`

**Add method after `getExecutionHistory`:**
```typescript
@Get('history/wallet/:walletId')
async getWalletExecutionHistory(@Param('walletId') walletId: string) {
  const result = await getWalletExecutionHistory({
    walletId: walletId as WalletId,
    historyRepo: this.historyRepo,
  });

  return {
    history: result.history.map((event) => toHistoryEventDto(event)),
  };
}
```

**Requires:**
- Import `getWalletExecutionHistory` from `@clmm/application`
- Import `WalletExecutionHistoryEventDto` from `@clmm/application` (or define equivalent)
- Ensure `toHistoryEventDto` handles wallet-scoped events

---

#### 1.4 Add `POST /:attemptId/decline-signature`

**File:** `packages/adapters/src/inbound/http/ExecutionController.ts`

**Add method after `abandonExecution`:**
```typescript
@Post(':attemptId/decline-signature')
async declineSignature(
  @Param('attemptId') attemptId: string,
  @Body() body: { breachDirection?: 'lower-bound-breach' | 'upper-bound-breach' },
) {
  const attempt = await this.executionRepo.getAttempt(attemptId);
  if (!attempt) throw new NotFoundException(`Attempt not found: ${attemptId}`);

  this.resolveAttemptDirection(attempt, body?.breachDirection);

  const result = await recordSignatureDecline({
    attemptId,
    executionRepo: this.executionRepo,
    historyRepo: this.historyRepo,
    clock: this.clock,
    ids: this.ids,
  });

  if (result.kind === 'not-found') throw new NotFoundException(`Attempt not found: ${attemptId}`);
  if (result.kind === 'already-terminal') {
    throw new ConflictException(
      `Attempt ${attemptId} cannot record signature decline from state ${result.state}`,
    );
  }

  return { declined: true, state: result.kind };
}
```

**Requires:**
- Import `recordSignatureDecline` from `@clmm/application`
- Verify use case exists in `packages/application/src/use-cases/execution/`

---

#### 1.5 Add `POST /:attemptId/interrupt-signature`

**File:** `packages/adapters/src/inbound/http/ExecutionController.ts`

**Add method after `declineSignature`:**
```typescript
@Post(':attemptId/interrupt-signature')
async interruptSignature(
  @Param('attemptId') attemptId: string,
  @Body() body: { breachDirection?: 'lower-bound-breach' | 'upper-bound-breach' },
) {
  const attempt = await this.executionRepo.getAttempt(attemptId);
  if (!attempt) throw new NotFoundException(`Attempt not found: ${attemptId}`);

  this.resolveAttemptDirection(attempt, body?.breachDirection);

  const result = await recordSignatureInterruptionUseCase({
    attemptId,
    executionRepo: this.executionRepo,
    historyRepo: this.historyRepo,
    clock: this.clock,
    ids: this.ids,
  });

  if (result.kind === 'not-found') throw new NotFoundException(`Attempt not found: ${attemptId}`);
  if (result.kind === 'already-terminal') {
    throw new ConflictException(
      `Attempt ${attemptId} cannot record signature interruption from state ${result.state}`,
    );
  }

  return { interrupted: true, state: result.kind };
}
```

**Requires:**
- Import `recordSignatureInterruption` (as `recordSignatureInterruptionUseCase`) from `@clmm/application`
- Verify use case exists in `packages/application/src/use-cases/execution/`

---

### Phase 2: App API Clients

**Complexity:** Medium | **Risk:** Low

#### 2.1 Extend `apps/app/src/api/executions.ts`

Add these functions from `mvp-out-of-range-flow/apps/app/src/api/executions.ts`:

| Function | Lines | Purpose |
|----------|-------|---------|
| `fetchExecutionSigningPayload` | 215-238 | Get serialized payload for signing |
| `recordSignatureDecline` | 276-302 | Record user declined to sign |
| `recordSignatureInterruption` | 305-331 | Record signing was interrupted |
| `fetchWalletExecutionHistory` | 348-359 | Get all history events for a wallet |

**Also copy the DTO validation helpers:**
- `conflictDetailError()` — parses HTTP 409 for conflict details
- `isExecutionAttemptDto()` — validates execution response
- `isExecutionApprovalDto()` — validates approval response
- `isExecutionSigningPayloadDto()` — validates signing payload response
- `isHistoryEventDto()` — validates history event response

---

#### 2.2 Extend `apps/app/src/api/previews.ts`

Add `createPreview` function:
```typescript
export function createPreview(triggerId: string): Promise<ExecutionPreviewDto> {
  return parsePreviewResponse(
    fetchJson(`/previews/${triggerId}`, { method: 'POST' }),
    'Could not create execution preview',
  );
}
```

**Requires:** The `parsePreviewResponse` helper and DTO validation from the source file.

---

### Phase 3: Native Wallet Support

**Complexity:** Low | **Risk:** Low

#### 3.1 Complete `apps/app/src/platform/nativeWallet.ts`

Replace current stub with full implementation:

```typescript
export async function signNativeTransaction(params: {
  serializedPayload: string;
  walletId: string;
  cluster?: string;
}): Promise<string> {
  return transact(async (wallet) => {
    const signingWallet = wallet as unknown as NativeSigningWallet;
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

**Requires:** Add `NativeSigningWallet` type and `signTransactions` call pattern.

---

#### 3.2 Update `apps/app/src/platform/index.ts`

Export `signNativeTransaction`:
```typescript
export { connectNativeWallet, signNativeTransaction } from './nativeWallet';
```

---

### Phase 4: Signing Route Wiring

**Complexity:** High | **Risk:** Medium

#### 4.1 Rewrite `apps/app/app/signing/[attemptId].tsx`

Replace current implementation with the version from `mvp-out-of-range-flow` (lines 45-219), which includes:

- `connectionKind` from wallet session store to distinguish `browser` vs `native`
- Conditional signing based on connection kind:
  - Browser: `signBrowserTransaction()`
  - Native: `signNativeTransaction()`
- `recordSignatureDecline` mutation with success notice
- `recordSignatureInterruption` mutation with success notice
- Stale payload refresh via `fetchExecutionSigningPayload` refetch
- Status notice display
- Decline button wired to `declineMutation`
- View result navigation

**Key changes from current superpowers-v2:**
- Adds `connectionKind` check from `walletSessionStore`
- Adds `signNativeTransaction` import and call
- Adds `recordSignatureDecline` / `recordSignatureInterruption` imports and mutations
- Changes signing flow from 2-step (prepare → submit) to 3-step (get payload → sign → submit)

---

#### 4.2 Update `packages/ui/src/screens/SigningStatusScreen.tsx`

Add these props to the `Props` type:

```typescript
type Props = {
  // ... existing props
  statusLoading?: boolean;
  statusError?: string;
  statusNotice?: string;
  onDecline?: () => void;
  onViewResult?: () => void;
};
```

Add UI elements:
- Status notice banner (success/green)
- Status error display (already exists as `signingError`)
- Decline button (when `onDecline` provided and `lifecycleState.kind === 'awaiting-signature'`)
- View Result button (when `onViewResult` provided and terminal state)

---

### Phase 5: Navigation Bug Fix

**Complexity:** Low | **Risk:** Low (pure bug fix)

#### 5.1 Fix `apps/app/app/(tabs)/alerts.tsx`

**Change from:**
```typescript
onSelectAlert={(triggerId, positionId) =>
  router.push(`/position/${positionId}`)
}
```

**Change to:**
```typescript
onSelectAlert={(triggerId, positionId) => {
  router.push({ pathname: '/position/[id]', params: { id: positionId, triggerId } });
}}
```

---

#### 5.2 Update `apps/app/app/position/[id].tsx`

Accept `triggerId` in params and pass through:
```typescript
const params = useLocalSearchParams<{ id?: string | string[]; triggerId?: string }>();
const triggerId = params.triggerId;

// Pass triggerId through to screen for preview navigation
<PositionDetailScreen
  {...}
  onViewPreview={(nextTriggerId) => router.push(`/preview/${nextTriggerId}`)}
/>
```

The `PositionDetailScreen` already accepts `triggerId` in its `position` prop and uses it for `onViewPreview`. Verify the param is being passed correctly.

---

### Phase 6: Preview Route

**Complexity:** Low | **Risk:** Low

#### 6.1 Update `apps/app/app/preview/[triggerId].tsx`

Replace query-with-side-effect pattern with proper mutation:

**Change from:**
```typescript
// Create a fresh preview by refreshing from the trigger
const previewQuery = useQuery({
  queryKey: ['preview', triggerId],
  queryFn: () => refreshPreview(triggerId!),
  enabled: triggerId != null && triggerId.length > 0,
});
```

**Change to (from mvp-out-of-range-flow):**
```typescript
const { mutateAsync, data, isPending, error } = useMutation({
  mutationFn: createPreview,
  retry: 0,
});

useEffect(() => {
  if (triggerId == null) return;
  void mutateAsync(triggerId);
}, [triggerId, mutateAsync]);

// Pass to screen
<ExecutionPreviewScreen
  previewLoading={isPending || approvalMutation.isPending}
  previewError={error instanceof Error ? error.message : null}
/>
```

---

## Files to Modify

### packages/adapters (BFF)

| File | Changes |
|------|---------|
| `src/inbound/http/PreviewController.ts` | Add `POST :triggerId` create method |
| `src/inbound/http/ExecutionController.ts` | Add 5 new endpoints |
| `src/inbound/http/tokens.ts` | Add new DI tokens if needed |

### packages/application (DTOs + Use Cases)

| File | Changes |
|------|---------|
| `src/dto/index.ts` | Add `ExecutionSigningPayloadDto`, `WalletExecutionHistoryEventDto` if missing |
| `src/ports/index.ts` | Verify `MonitoredWalletRepository` exists |
| `src/use-cases/execution/` | Verify `recordSignatureDecline`, `recordSignatureInterruption` exist |

### apps/app (API Clients + Routes)

| File | Changes |
|------|---------|
| `src/api/executions.ts` | Add 4 functions with DTO validation |
| `src/api/previews.ts` | Add `createPreview()` |
| `src/platform/nativeWallet.ts` | Complete `signNativeTransaction()` |
| `src/platform/index.ts` | Export `signNativeTransaction` |
| `app/signing/[attemptId].tsx` | Full rewrite with native + browser, decline/interrupt |
| `app/(tabs)/alerts.tsx` | Fix triggerId preservation in navigation |
| `app/position/[id].tsx` | Accept triggerId in params |
| `app/preview/[triggerId].tsx` | Use createPreview mutation pattern |

### packages/ui (Screens)

| File | Changes |
|------|---------|
| `src/screens/SigningStatusScreen.tsx` | Add status props, decline button, view result button |

---

## Effort Estimate

| Phase | Files | Complexity | Notes |
|-------|-------|------------|-------|
| 1: BFF Endpoints | 1-2 | Medium | Straightforward additions; verify use cases exist |
| 2: API Clients | 2 | Medium | Copy with validation; DTO type alignment |
| 3: Native Wallet | 1 | Low | Straightforward implementation |
| 4: Signing Route | 2 | High | Most complex; multi-flow state management |
| 5: Navigation Bug | 2 | Low | Simple fix |
| 6: Preview Route | 1 | Low | Simple mutation pattern change |
| **Total** | **~12** | | |

---

## Verification

After each phase:

1. **Phase 1:** `pnpm typecheck` + `pnpm test:adapters` pass
2. **Phase 2:** API client tests pass (if any exist)
3. **Phase 3:** Native wallet signing compiles without errors
4. **Phase 4:** Full signing flow test (manual on device)
5. **Phase 5:** Alerts → Position → Preview navigation works
6. **Phase 6:** Preview creates correctly on mount

**Manual verification checklist:**
1. Connect wallet (native on mobile, browser on web)
2. See supported position
3. Worker detects out-of-range (or insert test trigger)
4. Alert appears with correct direction
5. Tap alert → position detail with triggerId
6. Tap "View Exit Preview" → preview loads
7. Tap "Approve" → signing screen
8. Sign with native/browser wallet
9. Decline option visible and functional
10. Submit → result screen shows confirmed/failed

---

## Dependencies

- Phase 1 requires `createExecutionPreview`, `getWalletExecutionHistory`, `recordSignatureDecline`, `recordSignatureInterruption`, `getAwaitingSignaturePayload` use cases
- Phase 4 requires Phase 3 (native wallet) and Phase 1 (endpoints)
- Phase 5 is independent
- Phase 6 is independent but related to Phase 1

---

## Rollback Plan

If any phase introduces issues:

1. **BFF endpoints:** Revert controller changes; endpoints are additive
2. **API clients:** Revert to previous thin implementations
3. **Native wallet:** Revert to stub function
4. **Signing route:** Keep `prepareExecution` approach from superpowers-v2 as fallback
5. **Navigation fix:** This is a pure bug fix; always apply
6. **Preview route:** Can fall back to `refreshPreview` query pattern

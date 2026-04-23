---
title: Signing payload pipeline omits payloadVersion, submit rejects with 409
date: 2026-04-23
category: integration-issues
module: execution
problem_type: integration_issue
component: service_object
symptoms:
  - Execution stuck at awaiting-signature after user signs in Phantom wallet
  - POST /executions/:attemptId/submit returns 409 "has a prepared payload; payloadVersion is required"
  - Signing page shows no error after wallet confirmation
root_cause: missing_workflow_step
resolution_type: code_fix
severity: critical
tags: [signing, payload-version, phantom, execution-pipeline, silent-failure]
---

# Signing payload pipeline omits payloadVersion, submit rejects with 409

## Problem

After a user signs a transaction in Phantom wallet, the execution stays stuck at `awaiting-signature` indefinitely. The submit endpoint rejects the request with 409 because `payloadVersion` is required but never sent, and the error is silently swallowed by the UI.

## Symptoms

- User signs in Phantom, Phantom closes, page remains unchanged at "Awaiting Signature"
- `GET /executions/:attemptId` returns `lifecycleState.kind: "awaiting-signature"` permanently
- Server logs show 409: "Attempt has a prepared payload; payloadVersion is required"
- No error is visible to the user

## What Didn't Work

- Initially assumed the wallet signing itself was failing — but Phantom returns successfully
- Checking only the execution endpoint data — the 409 from submit was invisible because `signingState` never mapped to `'error'`

## Solution

The fix threads `payloadVersion` through the entire signing pipeline:

1. **`GetAwaitingSignaturePayload.ts`**: Added `payloadVersion` to the `'found'` result, sourced from `preparedPayload.payloadVersion`
2. **`ExecutionSigningPayloadDto`**: Added `payloadVersion: string` field
3. **`ExecutionController.getSigningPayload`**: Included `payloadVersion` in the HTTP response
4. **`isExecutionSigningPayloadDto`**: Added `typeof value['payloadVersion'] === 'string'` validation
5. **`signing/[attemptId].tsx`**: Passed `signingPayload.payloadVersion` to `submitExecution(attemptId, signedPayload, payloadVersion)`
6. **`signing/[attemptId].tsx`**: Mapped `signMutation.isError` to `signingState: 'error'` so submit failures surface in the UI

Key code change in the signing page:

```typescript
// Before: version not sent
await submitExecution(attemptId, signedPayload);

// After: version threaded through
await submitExecution(attemptId, signedPayload, signingPayload.payloadVersion);
```

And the signingState fix:

```typescript
// Before: error state invisible
signingState={signMutation.isPending ? 'signing' : 'idle'}

// After: error surfaces through existing error banner
signingState={signMutation.isError ? 'error' : signMutation.isPending ? 'signing' : 'idle'}
```

## Why This Works

The server's submit endpoint requires `payloadVersion` as a consistency check against the prepared payload. The use case (`GetAwaitingSignaturePayload`) had access to `preparedPayload.payloadVersion` but excluded it from the result type, so the version was never returned to the client and never sent back. The fix ensures the version travels the full round-trip: server stores it → server returns it → client sends it back.

The `signingState` fix addresses the secondary issue: even when the 409 was returned, the error was caught by the mutation but never displayed because `SigningStatusScreen` only renders `signingError` when `signingState === 'error'`.

## Prevention

- **Regression test on the client call site**: Added test in `executions.test.ts` asserting `submitExecution('a', 'b', 'v1')` includes `payloadVersion: 'v1'` in the request body. Since `payloadVersion` is optional on the function signature, a future refactor could drop it silently — this test catches that.
- **DTO validator test**: Added test asserting `fetchExecutionSigningPayload` rejects payloads missing `payloadVersion`.
- **Pattern to watch**: When a server endpoint requires a field that originates from an earlier endpoint response, verify the full round-trip in both the DTO and the client call site. Optional parameters on client functions are easy to silently drop.

## Related Issues

- PR #22: The fix for this bug
- PR #23: The adjacent UI rendering trap (statusError invisible when lifecycleState is present)
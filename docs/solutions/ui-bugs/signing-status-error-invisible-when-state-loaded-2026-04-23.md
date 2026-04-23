---
title: SigningStatusScreen drops statusError when lifecycleState is present
date: 2026-04-23
category: ui-bugs
module: execution
problem_type: ui_bug
component: frontend_stimulus
symptoms:
  - Errors from signing payload fetch, approval, or execution queries are invisible after initial load
  - Signing page shows no feedback when operations fail after lifecycle state loads
  - signMutation errors are invisible because signingState never maps to 'error'
root_cause: logic_error
resolution_type: code_fix
severity: high
tags: [signing, error-display, ui-logic, silent-failure]
---

# SigningStatusScreen drops statusError when lifecycleState is present

## Problem

`SigningStatusScreen` has a rendering trap where `statusError` (which surfaces errors from approval, execution queries, signing payload fetch, and submit mutations) only renders in a full-screen error state when `lifecycleState` is absent. In the common case — execution data has loaded, then an error occurs — the error is silently dropped.

Additionally, `signingState` in the signing page was never mapped to `'error'` when `signMutation.isError` was true, so the dedicated signing error UI path was unreachable after a submit failure.

## Symptoms

- After signing payload fetch fails with a stale/expired payload, no error is shown
- After submit returns 409 (e.g., missing payloadVersion), the page stays at "Awaiting Signature" with no feedback
- `approveMutation` errors are invisible once the approval has succeeded and the signing page loads
- The `statusError` prop is set but never rendered because `lifecycleState` is present

## What Didn't Work

- Fixing only the `signingState` mapping (PR #22) — this fixed the submit-409 path but left other error sources (query errors, approval errors) invisible
- Assuming that because `statusError` was set in the signing route, it would be displayed — the conditional rendering gate `if (!lifecycleState && statusError)` blocked it

## Solution

Two changes:

1. **`SigningStatusScreen.tsx`**: Added an inline error banner in the main content area that renders `statusError` whenever it is set, regardless of `lifecycleState`. Styled consistently with the existing `statusNotice` warning banner but using the danger color scheme.

```tsx
{statusError ? (
  <View style={{
    marginBottom: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: `${colors.danger}20`,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.danger,
  }}>
    <Text style={{
      color: colors.danger,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
    }}>
      {statusError}
    </Text>
  </View>
) : null}
```

2. **`signing/[attemptId].tsx`**: Mapped `signMutation.isError` to `signingState: 'error'`:

```tsx
signingState={signMutation.isError ? 'error' : signMutation.isPending ? 'signing' : 'idle'}
```

## Why This Works

The original `SigningStatusScreen` has three render paths:

1. Loading spinner (when `statusLoading && !lifecycleState`)
2. Full-screen error (when `!lifecycleState && statusError`) — **this gate blocks errors**
3. Main content area (when `lifecycleState` exists)

Path 2 only triggers when `lifecycleState` hasn't loaded yet. Once the execution data loads, all error sources are set on props that are never rendered. The inline banner in path 3 ensures errors are visible regardless of data state.

The `signingState` fix is complementary — it makes the dedicated signing error UI (with "Try Again" button) reachable after submit failures.

## Prevention

- **Test coverage**: Added tests asserting that `statusError` renders when `lifecycleState` is present, and that it doesn't render when `statusError` is null.
- **Pattern to watch**: When a component has early-return render paths that gate on data presence, verify that error/success props are also rendered in the late-return paths. This "gate swallowing errors" pattern is easy to miss in review.

## Related Issues

- PR #22: The payloadVersion fix that surfaced this adjacent UI issue
- PR #23: This fix
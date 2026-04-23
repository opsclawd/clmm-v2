---
title: Pending submissions orphaned without background reconciliation
date: 2026-04-23
category: integration-issues
module: execution
problem_type: integration_issue
component: background_job
symptoms:
  - Execution attempts stuck in submitted state after transaction sent to chain
  - No background job enqueued when inline reconciliation returns pending
  - Attempts never transition to confirmed or failed without manual intervention
root_cause: missing_workflow_step
resolution_type: code_fix
severity: high
tags: [reconciliation, pg-boss, background-jobs, execution-pipeline]
---

# Pending submissions orphaned without background reconciliation

## Problem

When `submitExecution`'s inline reconciliation returns no final state (transaction still confirming on-chain), the attempt sits in `submitted` state with nothing to drive it to `confirmed` or `failed`. The existing `ReconciliationJobHandler` in the worker process can do this work, but nothing enqueues the job.

## Symptoms

- After signing and submitting, the execution page shows "pending" with no progress
- The attempt remains in `submitted` lifecycle state indefinitely
- The worker's `ReconciliationJobHandler` exists but is never triggered for this path
- Returns `{ result: 'pending' }` from the submit endpoint but no follow-up occurs

## What Didn't Work

- Assuming the worker's periodic reconciliation scan would catch these — there is no periodic scan; jobs must be explicitly enqueued
- Hoping the user would refresh — polling only helps if the reconciliation runs server-side

## Solution

When inline reconciliation returns `finalState: null`, the BFF now enqueues a `reconcile-execution` job via pg-boss:

```typescript
if (!reconciliation.finalState) {
  await this.reconciliationJobPort.enqueue(attemptId);
  return { result: 'pending' as const };
}
```

Architecture: the BFF acts as a **producer** to the worker's pg-boss queue. This requires a separate pg-boss instance in the API process (the worker has its own for job processing). A `PgBossLifecycle` provider manages start/stop and queue creation:

```typescript
const reconciliationJobPort = {
  async enqueue(attemptId: string): Promise<void> {
    await boss.send(ReconciliationJobHandler.JOB_NAME, { attemptId });
  },
};

@Injectable()
class PgBossLifecycle implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await boss.start();
    await boss.createQueue(ReconciliationJobHandler.JOB_NAME);
  }
  async onModuleDestroy(): Promise<void> {
    await boss.stop();
  }
}
```

## Why This Works

pg-boss uses a shared PostgreSQL table as its queue. Multiple instances can write to the same table — the API process sends jobs, and the worker process picks them up. `createQueue` is idempotent, so both processes calling it is safe. The existing `ReconciliationJobHandler` already knows how to process these jobs; it just needs someone to enqueue them.

## Prevention

- **Unit test**: Added test asserting `reconciliationJobPort.attemptIds` is called with the attempt ID when inline reconciliation returns pending, and is empty when reconciliation completes inline.
- **Known gap**: No integration test verifying `boss.send()` inserts into the pg-boss job table and that the worker processes it. This should be a follow-up.
- **Architecture note**: The dual pg-boss instance (one in API, one in worker) is acceptable but adds a persistent DB connection per API process. A future optimization could replace the full pg-boss instance with a lightweight enqueue-only port that writes directly to the job table.

## Related Issues

- PR #24: This fix
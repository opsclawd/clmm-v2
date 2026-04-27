---
title: "Submitted Attempt Sweep Job"
date: "2026-04-23"
category: integration-issues
module: execution
problem_type: integration_issue
component: background_job
severity: high
symptoms:
  - "Execution stuck in submitted state after reconciliation enqueue fails"
  - "Orphaned attempts after worker process crash"
root_cause: missing_workflow_step
resolution_type: code_fix
tags: [pg-boss, sweep-job, reconciliation, orphaned-attempts]
---

# Submitted Attempt Sweep Job

## Problem

When a user signs and submits an execution, the inline `reconcileExecution()` call may return `{ finalState: null }` — meaning on-chain confirmation isn't available yet. The controller enqueues a reconciliation job via `reconciliationJobPort.enqueue()`, but two edge cases can leave the attempt stuck in `submitted` state permanently:

1. **Reconciliation enqueue fails**: If `boss.send()` throws during the enqueue in `ExecutionController.submitExecution`, the HTTP request would 500. On retry, the user hits a 409 (lifecycle already `submitted`), and the attempt is orphaned.
2. **Process crash**: If the worker crashes after saving `submitted` state but before the reconciliation job runs, no one drives the attempt to terminal state.

## Solution

Added a `SubmittedAttemptSweepHandler` scheduled job that runs every 2 minutes and:
- Queries all attempts in `submitted` lifecycle state via `ExecutionRepository.listSubmittedAttempts()`
- Enqueues a `reconcile-execution` job for each one
- Logs errors per-attempt but continues processing remaining attempts

Key design decisions:
- **No deduplication needed**: pg-boss is idempotent for same-name jobs with the same data within a deduplication window. Re-enqueuing an already-pending reconciliation job is safe.
- **Silent enqueue failure is acceptable**: The sweep job's primary purpose is to catch orphaned attempts. If it fails to enqueue, the next sweep in 2 minutes will retry.
- **Try/catch around controller enqueue**: `ExecutionController.submitExecution` now wraps `reconciliationJobPort.enqueue()` in try/catch (silent failure — the sweep job is the fallback).

## Files

- `packages/application/src/ports/index.ts` — Added `listSubmittedAttempts()` to `ExecutionRepository` port and `ReconciliationJobPort` interface
- `packages/application/src/public/index.ts` — Exported `ReconciliationJobPort`
- `packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts` — SQL implementation of `listSubmittedAttempts()`
- `packages/adapters/src/inbound/jobs/SubmittedAttemptSweepHandler.ts` — New sweep handler
- `packages/adapters/src/inbound/jobs/SubmittedAttemptSweepHandler.test.ts` — Tests
- `packages/adapters/src/inbound/jobs/WorkerModule.ts` — Registered handler
- `packages/adapters/src/inbound/jobs/WorkerLifecycle.ts` — Scheduled every `*/2 * * * *`
- `packages/adapters/src/inbound/http/ExecutionController.ts` — Try/catch around enqueue
- `packages/adapters/src/inbound/http/AppModule.ts` — pg-boss dual-instance pattern, `reconciliationJobPort` provider
- `packages/adapters/src/inbound/http/tokens.ts` — `RECONCILIATION_JOB_PORT` token

## Pattern: pg-boss Dual Instance

The BFF (AppModule) creates its own pg-boss instance for enqueuing; the worker (WorkerModule) has its own for processing. Both call `createQueue()` which is idempotent. This avoids coupling API and worker lifecycles — the API can enqueue without depending on the worker being up.
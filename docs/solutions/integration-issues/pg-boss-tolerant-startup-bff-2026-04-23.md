---
title: pg-boss tolerant startup prevents BFF crash on Postgres connection failure
date: 2026-04-23
category: integration-issues
module: execution
problem_type: availability_regression
component: bff
symptoms:
  - BFF process crashes on startup when pg-boss can't connect to Postgres
  - /health, /positions, /alerts return 502 after BFF restart under Postgres blip
  - Sweep job on worker process picks up orphans but BFF is unreachable
root_cause: startup_coupling
resolution_type: tolerant_start
severity: high
tags: [pg-boss, bff, availability, startup, resilience]
---

# pg-boss tolerant startup prevents BFF crash on Postgres connection failure

## Problem

`PgBossLifecycle.onModuleInit` in the BFF's `AppModule` awaited `boss.start()` and `boss.createQueue()`. If pg-boss couldn't connect to Postgres at startup (transient blip, schema lock contention, advisory-lock race on deploy), the entire BFF crashed — including `/health`, `/positions`, `/alerts`, and every other route unrelated to reconciliation.

This was an availability regression introduced by PR #25 that coupled BFF HTTP availability to pg-boss startup success.

## Solution

Replaced the blocking `await boss.start()` with a fire-and-forget tolerant-start pattern:

```typescript
async onModuleInit(): Promise<void> {
  this.startPromise = this.boss.start()
    .then(async () => {
      await this.boss.createQueue(ReconciliationJobHandler.JOB_NAME);
    })
    .catch((error: unknown) => {
      this.observability.log('warn', 'pg-boss startup failed; BFF will serve HTTP but enqueue will fail until restart. Sweep job on worker catches orphans.', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
}
```

### Why tolerant-start, not lazy-start

Lazy-start introduces concurrency risk (multiple enqueues racing to start) and adds `ensureStarted()` indirection to every enqueue call path. Tolerant-start is simpler: `onModuleInit` fires and forgets the start promise. If it fails, we log and continue.

### Why one-shot, not retry-with-backoff

- The sweep job is already the backstop — re-implementing retry in `PgBossLifecycle` duplicates durability logic
- pg-boss internals may already retry connection attempts
- Retry/backoff logic has its own failure modes (stuck loops, alert noise)
- Restart recovers: if ops see persistent "pg-boss startup failed" warn logs, they restart the BFF

### Startup window

During the brief window between `onModuleInit` returning and `startPromise` resolving, any `boss.send()` call throws. The `try/catch` in `ExecutionController.submitExecution` (commit 3 of this PR) now logs a structured warn on this failure. The sweep job on the **worker** process (separate pg-boss instance, unaffected by BFF startup state) catches orphaned attempts within its 2-minute cycle.

## Prevention

- Extracted `PgBossLifecycle` to a standalone file with DI, making it unit-testable without booting NestJS
- 6 tests covering: immediate resolve on failure, warn logging, happy-path createQueue, createQueue failure, in-flight start await on destroy, safe destroy when both start and stop reject
- Pattern to watch: any lifecycle hook that awaits an external service start in `onModuleInit` should use tolerant-start, not blocking await

## Related Issues

- PR #25: Introduced the `PgBossLifecycle` with blocking await (the regression)
- PR #26: signingState lifecycle gate (unrelated but same review cycle)
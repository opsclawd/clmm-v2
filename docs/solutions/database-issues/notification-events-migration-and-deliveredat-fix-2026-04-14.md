---
title: Notification events migration and deliveredAt fix
date: 2026-04-14
category: database-issues
module: notifications
problem_type: database_issue
component: database
severity: medium
tags:
  - notifications
  - drizzle
  - migration
  - journal
  - telemetry
  - delivered-at
symptoms:
  - Existing databases could not write `notification_events` because the table migration was missing.
  - Delivery timing was recorded from `clock.now()` instead of the adapter-provided `deliveredAt` value.
root_cause: missing_workflow_step
resolution_type: migration
related_components:
  - background_job
---

# Notification events migration and deliveredAt fix

## Problem
PR #11 introduced a durable notification write path, but the database schema and the telemetry path were not updated together. That left existing databases without `notification_events`, and it let the job handler overwrite an adapter-provided delivery timestamp with its own clock reading.

## Symptoms
- `sendActionableAlert()` could fail on databases that had not yet been migrated.
- Notification delivery metrics could drift from the provider's actual completion time.

## What Didn't Work
- Rewiring `NOTIFICATION_PORT` to the durable adapter without a matching Drizzle migration left the live write path ahead of the database.
- Recording delivery timing with `clock.now()` measured handler time, not provider delivery time.

## Solution
- Add the missing migration and journal entry. The project later consolidated migrations into a single baseline (`0000_bitter_riptide`); the `notification_events` schema lives in `packages/adapters/src/outbound/storage/schema/notification-events.ts`.
  - `packages/adapters/drizzle/0000_bitter_riptide.sql` (consolidated baseline)
  - `packages/adapters/drizzle/meta/_journal.json`
- Preserve the adapter's timestamp in `NotificationDispatchJobHandler`:

```ts
if (result.deliveredAt !== null) {
  this.observability.recordDeliveryTiming({
    triggerId: data.triggerId,
    dispatchedAt: startedAt,
    deliveredAt: result.deliveredAt,
    durationMs: result.deliveredAt - startedAt,
    channel: 'push',
  });
}
```

- Add regression tests for both the schema gap and the timestamp propagation.

## Why This Works
The migration guarantees `notification_events` exists before the adapter writes to it. Using `result.deliveredAt` keeps telemetry aligned with the adapter's canonical delivery timestamp instead of inventing a new one in the job handler.

## Prevention
- Pair new write-path tables with a Drizzle migration and journal entry in the same change.
- Treat adapter-returned timestamps as authoritative when downstream telemetry depends on them.
- Add regression tests for existing-database writes and for timestamp propagation through job handlers.

## Related Issues
- PR #11: `feat(adapters): persist notification intent durably`
- `docs/superpowers/specs/2026-04-13-notification-durable-intent-design.md`
- `docs/superpowers/plans/2026-04-13-notification-durable-intent.md`
- `docs/superpowers/specs/2026-04-14-clmm-v2-workers-migration-design.md`

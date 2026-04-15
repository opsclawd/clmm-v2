# Notification Durable Intent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three broken notification adapters (InAppAlertAdapter, ExpoPushAdapter, WebPushAdapter) with a single `DurableNotificationEventAdapter` that persists notification intent to a `notification_events` database table with honest non-delivery status.

**Architecture:** Delete fake adapters, add a `notification_events` Drizzle schema with indexes, create `DurableNotificationEventAdapter` implementing `NotificationPort`, rewire `AdaptersModule.ts`. The adapter inserts a row with `status: 'skipped'` and returns `{ deliveredAt: null }`. The `NotificationPort` contract is preserved unchanged.

**Tech Stack:** TypeScript, Vitest, Drizzle ORM (pg), NestJS DI

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `packages/adapters/src/outbound/storage/schema/notification-events.ts` | Create | Drizzle schema for `notification_events` table |
| `packages/adapters/src/outbound/storage/schema/index.ts` | Modify | Export the new schema |
| `packages/adapters/src/outbound/notifications/DurableNotificationEventAdapter.ts` | Create | New adapter implementing `NotificationPort` |
| `packages/adapters/src/outbound/notifications/DurableNotificationEventAdapter.test.ts` | Create | Unit tests for the new adapter |
| `packages/adapters/src/composition/AdaptersModule.ts` | Modify | Rewire `NOTIFICATION_PORT` |
| `packages/adapters/src/index.ts` | Modify | Remove old exports, add new export |
| `packages/adapters/src/outbound/notifications/InAppAlertAdapter.ts` | Delete | Fake in-memory adapter |
| `packages/adapters/src/outbound/notifications/ExpoPushAdapter.ts` | Delete | Broken device-side adapter |
| `packages/adapters/src/outbound/notifications/ExpoPushAdapter.test.ts` | Delete | Test for deleted adapter |
| `packages/adapters/src/outbound/notifications/WebPushAdapter.ts` | Delete | Stub adapter |

---

## Task 1: Create the `notification_events` Schema

**Files:**
- Create: `packages/adapters/src/outbound/storage/schema/notification-events.ts`
- Modify: `packages/adapters/src/outbound/storage/schema/index.ts`

- [ ] **Step 1: Create the schema file**

Create `packages/adapters/src/outbound/storage/schema/notification-events.ts`:

```typescript
import { pgTable, text, bigint, index } from 'drizzle-orm/pg-core';

export const notificationEvents = pgTable('notification_events', {
  eventId:       text('event_id').primaryKey(),
  triggerId:     text('trigger_id').notNull(),
  walletId:      text('wallet_id').notNull(),
  positionId:    text('position_id').notNull(),
  directionKind: text('direction_kind').notNull(),
  channel:       text('channel').notNull(),
  status:        text('status').notNull(),
  createdAt:     bigint('created_at', { mode: 'number' }).notNull(),
  attemptedAt:   bigint('attempted_at', { mode: 'number' }),
  deliveredAt:   bigint('delivered_at', { mode: 'number' }),
  failureReason: text('failure_reason'),
}, (table) => [
  index('notification_events_trigger_id_idx').on(table.triggerId),
  index('notification_events_status_idx').on(table.status),
  index('notification_events_created_at_idx').on(table.createdAt),
]);
```

- [ ] **Step 2: Export from the schema index**

In `packages/adapters/src/outbound/storage/schema/index.ts`, add this line at the end:

```typescript
export * from './notification-events.js';
```

- [ ] **Step 3: Verify typecheck**

Run: `cd packages/adapters && npx tsc -p tsconfig.typecheck.json --noEmit`

Expected: No type errors. The schema is just a table definition with no consumers yet.

- [ ] **Step 4: Commit**

```bash
git add packages/adapters/src/outbound/storage/schema/notification-events.ts packages/adapters/src/outbound/storage/schema/index.ts
git commit -m "feat(adapters): add notification_events schema with indexes

Durable storage for notification intent. Status tracks honest delivery
state (skipped/pending/failed/sent). Indexes on trigger_id, status,
and created_at for future dispatch queries."
```

---

## Task 2: Write Failing Tests for `DurableNotificationEventAdapter`

**Files:**
- Create: `packages/adapters/src/outbound/notifications/DurableNotificationEventAdapter.test.ts`

- [ ] **Step 5: Write the test file**

Create `packages/adapters/src/outbound/notifications/DurableNotificationEventAdapter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { FIXTURE_WALLET_ID, FIXTURE_POSITION_ID } from '@clmm/testing';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH } from '@clmm/domain';
import type { ExitTriggerId } from '@clmm/domain';
import { DurableNotificationEventAdapter } from './DurableNotificationEventAdapter';
import { notificationEvents } from '../storage/schema/index';
import { createTestDb } from '../storage/db';
import { eq } from 'drizzle-orm';

/**
 * These tests require a real test database. If createTestDb is not available
 * or the test DB is not set up, use the in-memory fake DB pattern from
 * OperationalStorageAdapter.test.ts.
 *
 * The key behaviors under test:
 * 1. sendActionableAlert inserts a row with status 'skipped'
 * 2. sendActionableAlert returns { deliveredAt: null }
 * 3. The inserted row has correct field values
 */

let _idCounter = 0;
const fakeIds = {
  generateId: () => `test-${Date.now()}-${++_idCounter}`,
};

describe('DurableNotificationEventAdapter', () => {
  it('inserts a notification event with status skipped and returns null delivery', async () => {
    // Use the same test DB pattern as other adapter tests in this codebase.
    // If a shared createTestDb helper exists, use it. Otherwise, mock the db.
    const insertedRows: Record<string, unknown>[] = [];
    const mockDb = {
      insert: () => ({
        values: (row: Record<string, unknown>) => {
          insertedRows.push(row);
          return Promise.resolve();
        },
      }),
    };

    const adapter = new DurableNotificationEventAdapter(mockDb as never, fakeIds);

    const result = await adapter.sendActionableAlert({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      triggerId: 'trigger-abc' as ExitTriggerId,
    });

    // Must return null delivery — nothing was actually delivered
    expect(result.deliveredAt).toBeNull();

    // Must have inserted exactly one row
    expect(insertedRows).toHaveLength(1);
    const row = insertedRows[0]!;

    // Verify all field values
    expect(row.triggerId).toBe('trigger-abc');
    expect(row.walletId).toBe(FIXTURE_WALLET_ID);
    expect(row.positionId).toBe(FIXTURE_POSITION_ID);
    expect(row.directionKind).toBe('lower-bound-breach');
    expect(row.channel).toBe('none');
    expect(row.status).toBe('skipped');
    expect(row.attemptedAt).toBeNull();
    expect(row.deliveredAt).toBeNull();
    expect(row.failureReason).toBeNull();
    expect(typeof row.createdAt).toBe('number');
    expect(typeof row.eventId).toBe('string');
  });

  it('records upper-bound-breach direction correctly', async () => {
    const insertedRows: Record<string, unknown>[] = [];
    const mockDb = {
      insert: () => ({
        values: (row: Record<string, unknown>) => {
          insertedRows.push(row);
          return Promise.resolve();
        },
      }),
    };

    const adapter = new DurableNotificationEventAdapter(mockDb as never, fakeIds);

    await adapter.sendActionableAlert({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      breachDirection: UPPER_BOUND_BREACH,
      triggerId: 'trigger-xyz' as ExitTriggerId,
    });

    expect(insertedRows[0]!.directionKind).toBe('upper-bound-breach');
  });

  it('generates unique event IDs for each call', async () => {
    const insertedRows: Record<string, unknown>[] = [];
    const mockDb = {
      insert: () => ({
        values: (row: Record<string, unknown>) => {
          insertedRows.push(row);
          return Promise.resolve();
        },
      }),
    };

    const adapter = new DurableNotificationEventAdapter(mockDb as never, fakeIds);
    const params = {
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      triggerId: 'trigger-same' as ExitTriggerId,
    };

    await adapter.sendActionableAlert(params);
    await adapter.sendActionableAlert(params);

    expect(insertedRows[0]!.eventId).not.toBe(insertedRows[1]!.eventId);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd packages/adapters && npx vitest run src/outbound/notifications/DurableNotificationEventAdapter.test.ts`

Expected: FAIL — `DurableNotificationEventAdapter` does not exist yet. The import will fail with a module-not-found error.

---

## Task 3: Implement `DurableNotificationEventAdapter`

**Files:**
- Create: `packages/adapters/src/outbound/notifications/DurableNotificationEventAdapter.ts`

- [ ] **Step 7: Create the adapter**

Create `packages/adapters/src/outbound/notifications/DurableNotificationEventAdapter.ts`:

```typescript
import type { NotificationPort } from '@clmm/application';
import type { IdGeneratorPort } from '@clmm/application';
import type { WalletId, PositionId, BreachDirection, ClockTimestamp, ExitTriggerId } from '@clmm/domain';
import type { Db } from '../storage/db.js';
import { notificationEvents } from '../storage/schema/index.js';

export class DurableNotificationEventAdapter implements NotificationPort {
  constructor(
    private readonly db: Db,
    private readonly ids: IdGeneratorPort,
  ) {}

  async sendActionableAlert(params: {
    walletId: WalletId;
    positionId: PositionId;
    breachDirection: BreachDirection;
    triggerId: ExitTriggerId;
  }): Promise<{ deliveredAt: ClockTimestamp | null }> {
    const eventId = this.ids.generateId();

    await this.db.insert(notificationEvents).values({
      eventId,
      triggerId: params.triggerId,
      walletId: params.walletId,
      positionId: params.positionId,
      directionKind: params.breachDirection.kind,
      channel: 'none',
      status: 'skipped',
      createdAt: Date.now(),
      attemptedAt: null,
      deliveredAt: null,
      failureReason: null,
    });

    return { deliveredAt: null };
  }
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd packages/adapters && npx vitest run src/outbound/notifications/DurableNotificationEventAdapter.test.ts`

Expected: ALL 3 tests PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/adapters/src/outbound/notifications/DurableNotificationEventAdapter.ts packages/adapters/src/outbound/notifications/DurableNotificationEventAdapter.test.ts
git commit -m "feat(adapters): add DurableNotificationEventAdapter

Implements NotificationPort by persisting notification intent to the
notification_events table with status 'skipped' and deliveredAt null.
Honest non-delivery — no fake push, no process-local arrays."
```

---

## Task 4: Delete Broken Adapters and Rewire

**Files:**
- Delete: `packages/adapters/src/outbound/notifications/InAppAlertAdapter.ts`
- Delete: `packages/adapters/src/outbound/notifications/ExpoPushAdapter.ts`
- Delete: `packages/adapters/src/outbound/notifications/ExpoPushAdapter.test.ts`
- Delete: `packages/adapters/src/outbound/notifications/WebPushAdapter.ts`
- Modify: `packages/adapters/src/index.ts` (lines 17-19)
- Modify: `packages/adapters/src/composition/AdaptersModule.ts` (lines 11, 57, 70)

- [ ] **Step 10: Delete the broken adapter files**

```bash
rm packages/adapters/src/outbound/notifications/InAppAlertAdapter.ts
rm packages/adapters/src/outbound/notifications/ExpoPushAdapter.ts
rm packages/adapters/src/outbound/notifications/ExpoPushAdapter.test.ts
rm packages/adapters/src/outbound/notifications/WebPushAdapter.ts
```

- [ ] **Step 11: Update `packages/adapters/src/index.ts` — remove old exports, add new**

Replace these three lines (lines 17-19):

```typescript
export { ExpoPushAdapter } from './outbound/notifications/ExpoPushAdapter';
export { WebPushAdapter } from './outbound/notifications/WebPushAdapter';
export { InAppAlertAdapter } from './outbound/notifications/InAppAlertAdapter';
```

With:

```typescript
export { DurableNotificationEventAdapter } from './outbound/notifications/DurableNotificationEventAdapter';
```

- [ ] **Step 12: Rewire `AdaptersModule.ts`**

In `packages/adapters/src/composition/AdaptersModule.ts`:

**Change the import** on line 11 from:

```typescript
import { InAppAlertAdapter } from '../outbound/notifications/InAppAlertAdapter.js';
```

To:

```typescript
import { DurableNotificationEventAdapter } from '../outbound/notifications/DurableNotificationEventAdapter.js';
```

**Change the instantiation** on line 57 from:

```typescript
const inAppAlert = new InAppAlertAdapter();
```

To:

```typescript
const durableNotificationEvent = new DurableNotificationEventAdapter(db, systemIds);
```

**Change the provider** on line 70 from:

```typescript
{ provide: NOTIFICATION_PORT, useValue: inAppAlert },
```

To:

```typescript
{ provide: NOTIFICATION_PORT, useValue: durableNotificationEvent },
```

- [ ] **Step 13: Typecheck the full adapters package**

Run: `cd packages/adapters && npx tsc -p tsconfig.typecheck.json --noEmit`

Expected: No type errors. If any other file imports from the deleted adapters, this will catch it.

- [ ] **Step 14: Run the full adapter test suite**

Run: `cd packages/adapters && npx vitest run`

Expected: ALL tests PASS. The deleted `ExpoPushAdapter.test.ts` is gone (its test was using `FakeNotificationPort` from `@clmm/testing`, not the real adapter, so the fake is unaffected). The `NotificationDispatchJobHandler.test.ts` also uses fakes and should be unaffected.

- [ ] **Step 15: Verify no remaining references to deleted adapters**

Run these searches to confirm nothing references the deleted code:

```bash
grep -r "InAppAlertAdapter\|ExpoPushAdapter\|WebPushAdapter\|getPendingInAppAlerts\|clearInAppAlert" packages/ --include="*.ts" -l
```

Expected: No results from any `.ts` file under `packages/`. (Results from `docs/` are fine — those are old plans and specs.)

- [ ] **Step 16: Commit**

```bash
git add -u packages/adapters/src/outbound/notifications/ packages/adapters/src/index.ts packages/adapters/src/composition/AdaptersModule.ts
git commit -m "refactor(adapters): delete fake notification adapters, rewire to durable adapter

Removes InAppAlertAdapter (process-local array), ExpoPushAdapter (device-side
APIs), and WebPushAdapter (stub). NOTIFICATION_PORT now points to
DurableNotificationEventAdapter which persists intent to the database."
```

# Design: Notification Path — Durable Intent, Honest Non-Delivery

**Date:** 2026-04-13
**Status:** Draft

---

## Problem

The notification subsystem is not a real delivery system. It is three broken adapters pretending to deliver:

1. **`InAppAlertAdapter`** stores alerts in a process-local `const pendingAlerts: PendingAlert[] = []`. In any deployment where the worker and frontend are separate processes (which is every real deployment), this array is unreachable. It is fake durability.

2. **`ExpoPushAdapter`** calls `Notifications.getExpoPushTokenAsync()` and `Notifications.scheduleNotificationAsync()` from the `expo-notifications` client library. These are device-side Expo APIs that schedule local notifications on the current device. They are not how a server sends push notifications. A worker process cannot call these APIs — they require a device context.

3. **`WebPushAdapter`** is a stub. It logs `'WebPushAdapter: stub'` and returns `{ deliveredAt: null }`.

The worker wires `NOTIFICATION_PORT → InAppAlertAdapter` in `AdaptersModule.ts`. The system pays compute to execute notification dispatch logic that produces no durable or externally visible effect.

Real Expo server-side push requires device token capture and storage, token lifecycle handling, per-user/per-device routing, delivery attempt records, retry/backoff rules, receipt checking, invalid token cleanup, and opt-in/opt-out state. None of that infrastructure exists. Building it now would turn a cleanup task into a notification-platform project.

## Goals

- Stop pretending notifications are delivered.
- Persist notification intent durably in the database.
- Preserve the `NotificationPort` contract as the future dispatch surface.
- Provide a clean upgrade path for real push delivery later.
- Remove the broken adapters and their dead code.

## Non-Goals

- Building real push delivery (Expo Push API, device token registration, delivery attempts).
- Adding opt-in/opt-out state management.
- Changing the `NotificationPort` interface.
- Modifying the `NotificationDispatchJobHandler` or `DispatchActionableNotification` use case.

---

## Design

### Delete

- `packages/adapters/src/outbound/notifications/InAppAlertAdapter.ts` — entire file, including the module-level `pendingAlerts` array and exported `getPendingInAppAlerts()` and `clearInAppAlert()` functions.
- `packages/adapters/src/outbound/notifications/ExpoPushAdapter.ts` — entire file.
- `packages/adapters/src/outbound/notifications/ExpoPushAdapter.test.ts` — test file for the deleted adapter.
- `packages/adapters/src/outbound/notifications/WebPushAdapter.ts` — entire file.
- Remove all exports of deleted adapters and helper functions from `packages/adapters/src/index.ts`.

### Preserve

`NotificationPort` interface in `packages/application/src/ports/index.ts` stays unchanged:

```typescript
export interface NotificationPort {
  sendActionableAlert(params: {
    walletId: WalletId;
    positionId: PositionId;
    breachDirection: BreachDirection;
    triggerId: ExitTriggerId;
  }): Promise<{ deliveredAt: ClockTimestamp | null }>;
}
```

### New Schema: `notification_events`

**Location:** `packages/adapters/src/outbound/storage/schema/notification-events.ts`

```typescript
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

**Indexes:** Added now, not later. `trigger_id` is needed to look up notification events by trigger (the primary correlation key). `status` is needed for any future dispatcher querying pending events. `created_at` supports chronological queries and cleanup. Notification intent tables become useless fast if you cannot query by trigger or pending state.

**Status values:** `skipped | pending | failed | sent`

- `skipped` — the intent was recorded but no delivery was attempted because no delivery channel is configured. This is the only status the adapter writes now.
- `pending` — reserved for when a real delivery channel exists and a dispatch is actually enqueued. Not used yet.
- `failed` — a delivery attempt was made and failed. Not used yet.
- `sent` — delivery was confirmed successful. Not used yet.

The distinction between `skipped` and `pending` is the key honesty constraint: `skipped` means "we chose not to deliver because we cannot." `pending` means "we intend to deliver and the dispatch is queued." Writing `pending` when nothing is queued is a new lie replacing the old one.

**Channel values:** `none` for now. Future values: `expo-push`, `web-push`, `email`, etc.

Export the table from `packages/adapters/src/outbound/storage/schema/index.ts`.

### New Adapter: `DurableNotificationEventAdapter`

**Location:** `packages/adapters/src/outbound/notifications/DurableNotificationEventAdapter.ts`

Implements `NotificationPort`.

**Constructor:** `(db: Db, ids: IdGeneratorPort)`

**`sendActionableAlert()` behavior:**

1. Generate `eventId` via `ids.generateId()`.
2. Insert a row into `notification_events`:
   - `eventId`: generated
   - `triggerId`: from params
   - `walletId`: from params
   - `positionId`: from params
   - `directionKind`: `params.breachDirection.kind`
   - `channel`: `'none'`
   - `status`: `'skipped'`
   - `createdAt`: `Date.now()`
   - `attemptedAt`: `null`
   - `deliveredAt`: `null`
   - `failureReason`: `null`
3. Return `{ deliveredAt: null }`.

### Wiring Change: `AdaptersModule.ts`

```typescript
// Before:
const inAppAlert = new InAppAlertAdapter();
// ...
{ provide: NOTIFICATION_PORT, useValue: inAppAlert },

// After:
const durableNotificationEvent = new DurableNotificationEventAdapter(db, systemIds);
// ...
{ provide: NOTIFICATION_PORT, useValue: durableNotificationEvent },
```

Remove the `InAppAlertAdapter` import. Add imports for `DurableNotificationEventAdapter` and the `notification_events` schema dependency (already available through `db`).

---

## Error Handling

If the DB insert fails, the error propagates to the caller. The `NotificationDispatchJobHandler` already has error handling around `sendActionableAlert()` calls. A failed insert is a real operational failure worth surfacing, unlike the current silent fake delivery where failure is invisible because the "delivery" is a push to a process-local array.

## Future Upgrade Path

When real push delivery is ready, the evolution is:

1. Add `device_registrations` table (Expo push tokens, per-device, with lifecycle state).
2. Add `notification_delivery_attempts` table (individual send attempts with receipt tracking).
3. Build a second-stage dispatcher that:
   - Reads `notification_events` rows with `status: 'pending'`
   - Looks up active device tokens from `device_registrations`
   - Sends via Expo Push HTTP API (`POST https://exp.host/--/api/v2/push/send`)
   - Records attempts in `notification_delivery_attempts`
   - Updates `notification_events.status` to `sent` or `failed`
   - Handles receipt-based token invalidation
4. `DurableNotificationEventAdapter` changes its insert from `status: 'skipped'` to `status: 'pending'` once a delivery channel is wired.

The `notification_events` table becomes the durable intent stream that real delivery dispatches over. Nothing built now needs to be thrown away.

## Migration

A Drizzle migration to create the `notification_events` table. No data migration needed — there is no durable notification data to preserve. The old data was a process-local array that is lost on every process restart.

## Testing

- **`DurableNotificationEventAdapter.sendActionableAlert()`:** Verify it inserts a row with correct fields: `status: 'skipped'`, `channel: 'none'`, `deliveredAt: null`. Verify it returns `{ deliveredAt: null }`.
- **Integration with `NotificationDispatchJobHandler`:** The handler calls `sendActionableAlert()`, gets `deliveredAt: null`, the notification event is persisted durably. Existing dedup logic via `NotificationDedupPort` continues to work unchanged.
- **Deletion verification:** Verify `InAppAlertAdapter`, `ExpoPushAdapter`, `WebPushAdapter`, `getPendingInAppAlerts`, and `clearInAppAlert` are no longer exported or referenced anywhere in the codebase.

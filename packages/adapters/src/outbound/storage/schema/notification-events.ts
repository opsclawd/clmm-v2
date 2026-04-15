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
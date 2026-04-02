import { pgTable, text, bigint } from 'drizzle-orm/pg-core';

export const notificationDedup = pgTable('notification_dedup', {
  triggerId: text('trigger_id').primaryKey(),
  dispatchedAt: bigint('dispatched_at', { mode: 'number' }).notNull(),
});

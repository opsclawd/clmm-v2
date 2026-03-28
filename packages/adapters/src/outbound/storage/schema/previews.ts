import { sql } from 'drizzle-orm';
import { pgTable, text, bigint, jsonb, check } from 'drizzle-orm/pg-core';

export const executionPreviews = pgTable('execution_previews', {
  previewId: text('preview_id').primaryKey(),
  positionId: text('position_id').notNull(),
  directionKind: text('direction_kind').notNull(),
  planJson: jsonb('plan_json').notNull(),
  freshnessKind: text('freshness_kind').notNull(), // 'fresh' | 'stale' | 'expired'
  freshnessExpiresAt: bigint('freshness_expires_at', { mode: 'number' }),
  estimatedAt: bigint('estimated_at', { mode: 'number' }).notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
}, (table) => [
  check(
    'execution_previews_direction_kind_check',
    sql`${table.directionKind} in ('lower-bound-breach', 'upper-bound-breach')`,
  ),
]);

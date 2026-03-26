import { pgTable, text, bigint, jsonb } from 'drizzle-orm/pg-core';

export const executionPreviews = pgTable('execution_previews', {
  previewId: text('preview_id').primaryKey(),
  positionId: text('position_id').notNull(),
  planJson: jsonb('plan_json').notNull(),
  freshnessKind: text('freshness_kind').notNull(), // 'fresh' | 'stale' | 'expired'
  freshnessExpiresAt: bigint('freshness_expires_at', { mode: 'number' }),
  estimatedAt: bigint('estimated_at', { mode: 'number' }).notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});
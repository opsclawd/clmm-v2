import { sql } from 'drizzle-orm';
import { pgTable, text, bigint, jsonb, check } from 'drizzle-orm/pg-core';

export const executionPreviews = pgTable(
  'execution_previews',
  {
    previewId: text('preview_id').primaryKey(),
    positionId: text('position_id').notNull(),
    originKind: text('origin_kind').notNull(), // 'qualified-breach' | 'regime-plan'
    directionKind: text('direction_kind'), // required only for qualified-breach origin
    planId: text('plan_id'), // regime-plan origin only
    canonicalHash: text('canonical_hash'), // regime-plan origin only
    canonicalExitIntent: text('canonical_exit_intent'), // regime-plan origin only
    planJson: jsonb('plan_json').notNull(),
    freshnessKind: text('freshness_kind').notNull(), // 'fresh' | 'stale' | 'expired'
    freshnessExpiresAt: bigint('freshness_expires_at', { mode: 'number' }),
    estimatedAt: bigint('estimated_at', { mode: 'number' }).notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    check(
      'execution_previews_origin_kind_check',
      sql`${table.originKind} in ('qualified-breach', 'regime-plan')`,
    ),
    check(
      'execution_previews_direction_kind_check',
      sql`(${table.originKind} = 'qualified-breach' and ${table.directionKind} in ('lower-bound-breach', 'upper-bound-breach')) or (${table.originKind} = 'regime-plan' and ${table.directionKind} is null)`,
    ),
    check(
      'execution_previews_regime_fields_check',
      sql`(${table.originKind} = 'regime-plan' and ${table.planId} is not null and ${table.canonicalHash} is not null and ${table.canonicalExitIntent} is not null) or (${table.originKind} = 'qualified-breach' and ${table.planId} is null and ${table.canonicalHash} is null and ${table.canonicalExitIntent} is null)`,
    ),
  ],
);

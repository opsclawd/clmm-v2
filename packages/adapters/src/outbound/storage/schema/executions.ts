import { sql } from 'drizzle-orm';
import { pgTable, text, bigint, jsonb, check } from 'drizzle-orm/pg-core';

export const executionAttempts = pgTable(
  'execution_attempts',
  {
    attemptId: text('attempt_id').primaryKey(),
    previewId: text('preview_id'),
    episodeId: text('episode_id'),
    positionId: text('position_id').notNull(),
    originKind: text('origin_kind').notNull(), // 'qualified-breach' | 'regime-plan'
    directionKind: text('direction_kind'), // required only for qualified-breach origin
    planId: text('plan_id'), // regime-plan origin only
    canonicalHash: text('canonical_hash'), // regime-plan origin only
    canonicalExitIntent: text('canonical_exit_intent'), // regime-plan origin only
    lifecycleStateKind: text('lifecycle_state_kind').notNull(),
    completedStepsJson: jsonb('completed_steps_json').notNull().default([]),
    transactionRefsJson: jsonb('transaction_refs_json').notNull().default([]),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    check(
      'execution_attempts_origin_kind_check',
      sql`${table.originKind} in ('qualified-breach', 'regime-plan')`,
    ),
    check(
      'execution_attempts_direction_kind_check',
      sql`(${table.originKind} = 'qualified-breach' and ${table.directionKind} in ('lower-bound-breach', 'upper-bound-breach')) or (${table.originKind} = 'regime-plan' and ${table.directionKind} is null)`,
    ),
    check(
      'execution_attempts_regime_fields_check',
      sql`(${table.originKind} = 'regime-plan' and ${table.planId} is not null and ${table.canonicalHash} is not null and ${table.canonicalExitIntent} is not null) or (${table.originKind} = 'qualified-breach' and ${table.planId} is null and ${table.canonicalHash} is null and ${table.canonicalExitIntent} is null)`,
    ),
  ],
);

export const executionSessions = pgTable('execution_sessions', {
  sessionId: text('session_id').primaryKey(),
  attemptId: text('attempt_id').notNull(),
  walletId: text('wallet_id').notNull(),
  positionId: text('position_id').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});

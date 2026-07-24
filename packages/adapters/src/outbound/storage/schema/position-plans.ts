import { sql } from 'drizzle-orm';
import { pgTable, text, bigint, jsonb, check, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const positionPlans = pgTable(
  'position_plans',
  {
    planId: text('plan_id').primaryKey(),
    canonicalHash: text('canonical_hash').notNull(),
    positionId: text('position_id').notNull(),
    walletId: text('wallet_id').notNull(),
    requestedAt: bigint('requested_at', { mode: 'number' }).notNull(),
    respondedAt: bigint('responded_at', { mode: 'number' }),
    asOfAt: bigint('as_of_at', { mode: 'number' }),
    expiresAt: bigint('expires_at', { mode: 'number' }),
    actionKind: text('action_kind').notNull(),
    actionReasons: jsonb('action_reasons').notNull().default([]),
    snapshotFingerprint: text('snapshot_fingerprint'),
    lifecycleKind: text('lifecycle_kind').notNull(),
    decisionKind: text('decision_kind'),
    attemptId: text('attempt_id'),
    canonicalResultJson: jsonb('canonical_result_json'),
    resultIdempotencyKey: text('result_idempotency_key'),
    deliveryAttempts: bigint('delivery_attempts', { mode: 'number' }).notNull().default(0),
    nextAttemptAt: bigint('next_attempt_at', { mode: 'number' }),
    lastErrorClass: text('last_error_class'),
    deliveredAt: bigint('delivered_at', { mode: 'number' }),
  },
  (table) => [
    check(
      'position_plans_action_kind_check',
      sql`${table.actionKind} in ('HOLD', 'STAND_DOWN', 'REQUEST_EXIT_CLMM')`,
    ),
    check(
      'position_plans_lifecycle_kind_check',
      sql`${table.lifecycleKind} in ('requested', 'advisory-ready', 'exit-previewed', 'awaiting-signature', 'submitted', 'result-pending', 'reported', 'report-failed', 'conflict', 'superseded')`,
    ),
    check(
      'position_plans_decision_kind_check',
      sql`${table.decisionKind} is null or ${table.decisionKind} in ('acknowledged', 'stand-down', 'expired', 'position-changed', 'rejected', 'executed', 'failed')`,
    ),
    check('position_plans_delivery_attempts_min_check', sql`${table.deliveryAttempts} >= 0`),
    uniqueIndex('position_plans_replay_identity_idx').on(table.planId, table.canonicalHash),
    uniqueIndex('position_plans_attempt_id_idx').on(table.attemptId),
    index('position_plans_position_id_idx').on(table.positionId),
    index('position_plans_delivery_due_idx').on(table.nextAttemptAt),
  ],
);

export const planResultOutbox = pgTable(
  'plan_result_outbox',
  {
    resultId: text('result_id').primaryKey(),
    planId: text('plan_id').notNull(),
    canonicalResultJson: jsonb('canonical_result_json').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    attemptCount: bigint('attempt_count', { mode: 'number' }).notNull().default(0),
    nextAttemptAt: bigint('next_attempt_at', { mode: 'number' }).notNull(),
    lastErrorClass: text('last_error_class'),
    deliveredAt: bigint('delivered_at', { mode: 'number' }),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    uniqueIndex('plan_result_outbox_idempotency_key_idx').on(table.idempotencyKey),
    check('plan_result_outbox_attempt_count_min_check', sql`${table.attemptCount} >= 0`),
    index('plan_result_outbox_due_idx')
      .on(table.nextAttemptAt)
      .where(sql`${table.deliveredAt} is null`),
  ],
);

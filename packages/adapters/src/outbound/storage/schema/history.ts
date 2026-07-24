import { sql } from 'drizzle-orm';
import { pgTable, text, bigint, jsonb, check } from 'drizzle-orm/pg-core';

// Off-chain operational event log — NOT an on-chain receipt or attestation
export const historyEvents = pgTable(
  'history_events',
  {
    eventId: text('event_id').primaryKey(),
    positionId: text('position_id').notNull(),
    eventType: text('event_type').notNull(),
    originKind: text('origin_kind').notNull(), // 'qualified-breach' | 'regime-plan'
    directionKind: text('direction_kind'), // breach direction — required only for qualified-breach origin
    planId: text('plan_id'), // regime-plan origin only
    canonicalHash: text('canonical_hash'), // regime-plan origin only
    canonicalExitIntent: text('canonical_exit_intent'), // regime-plan origin only
    occurredAt: bigint('occurred_at', { mode: 'number' }).notNull(),
    lifecycleStateKind: text('lifecycle_state_kind'),
    transactionRefJson: jsonb('transaction_ref_json'),
    // Explicitly no: receipt_data, attestation, proof, claim_id, canonical_cert
  },
  (table) => [
    check(
      'history_events_origin_kind_check',
      sql`${table.originKind} in ('qualified-breach', 'regime-plan')`,
    ),
    check(
      'history_events_direction_kind_check',
      sql`(${table.originKind} = 'qualified-breach' and ${table.directionKind} in ('lower-bound-breach', 'upper-bound-breach')) or (${table.originKind} = 'regime-plan' and ${table.directionKind} is null)`,
    ),
  ],
);

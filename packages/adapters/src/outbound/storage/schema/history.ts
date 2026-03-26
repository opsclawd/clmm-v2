import { pgTable, text, bigint, jsonb } from 'drizzle-orm/pg-core';

// Off-chain operational event log — NOT an on-chain receipt or attestation
export const historyEvents = pgTable('history_events', {
  eventId: text('event_id').primaryKey(),
  positionId: text('position_id').notNull(),
  eventType: text('event_type').notNull(),
  directionKind: text('direction_kind').notNull(), // breach direction always preserved
  occurredAt: bigint('occurred_at', { mode: 'number' }).notNull(),
  lifecycleStateKind: text('lifecycle_state_kind'),
  transactionRefJson: jsonb('transaction_ref_json'),
  // Explicitly no: receipt_data, attestation, proof, claim_id, canonical_cert
});
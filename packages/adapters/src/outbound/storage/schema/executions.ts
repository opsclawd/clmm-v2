import { pgTable, text, bigint, jsonb } from 'drizzle-orm/pg-core';

export const executionAttempts = pgTable('execution_attempts', {
  attemptId: text('attempt_id').primaryKey(),
  positionId: text('position_id').notNull(),
  lifecycleStateKind: text('lifecycle_state_kind').notNull(),
  completedStepsJson: jsonb('completed_steps_json').notNull().default([]),
  transactionRefsJson: jsonb('transaction_refs_json').notNull().default([]),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

export const executionSessions = pgTable('execution_sessions', {
  sessionId: text('session_id').primaryKey(),
  attemptId: text('attempt_id').notNull(),
  walletId: text('wallet_id').notNull(),
  positionId: text('position_id').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});
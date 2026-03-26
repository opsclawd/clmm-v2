import { pgTable, text, boolean, bigint } from 'drizzle-orm/pg-core';

export const breachEpisodes = pgTable('breach_episodes', {
  episodeId: text('episode_id').primaryKey(),
  positionId: text('position_id').notNull(),
  directionKind: text('direction_kind').notNull(), // 'lower-bound-breach' | 'upper-bound-breach'
  startedAt: bigint('started_at', { mode: 'number' }).notNull(),
  lastObservedAt: bigint('last_observed_at', { mode: 'number' }).notNull(),
  activeTriggerId: text('active_trigger_id'),
});

export const exitTriggers = pgTable('exit_triggers', {
  triggerId: text('trigger_id').primaryKey(),
  positionId: text('position_id').notNull(),
  episodeId: text('episode_id').notNull(),
  directionKind: text('direction_kind').notNull(),
  triggeredAt: bigint('triggered_at', { mode: 'number' }).notNull(),
  confirmationEvaluatedAt: bigint('confirmation_evaluated_at', { mode: 'number' }).notNull(),
  confirmationPassed: boolean('confirmation_passed').notNull().default(true),
});
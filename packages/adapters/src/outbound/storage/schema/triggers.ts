import { sql } from 'drizzle-orm';
import { pgTable, text, boolean, bigint, integer, check, uniqueIndex } from 'drizzle-orm/pg-core';

export const breachEpisodes = pgTable('breach_episodes', {
  episodeId: text('episode_id').primaryKey(),
  positionId: text('position_id').notNull(),
  directionKind: text('direction_kind').notNull(), // 'lower-bound-breach' | 'upper-bound-breach'
  status: text('status').notNull().default('open'), // 'open' | 'closed'
  consecutiveCount: integer('consecutive_count').notNull().default(1),
  startedAt: bigint('started_at', { mode: 'number' }).notNull(),
  lastObservedAt: bigint('last_observed_at', { mode: 'number' }).notNull(),
  triggerId: text('trigger_id'),
  closedAt: bigint('closed_at', { mode: 'number' }),
  closeReason: text('close_reason'),
}, (table) => [
  check(
    'breach_episodes_direction_kind_check',
    sql`${table.directionKind} in ('lower-bound-breach', 'upper-bound-breach')`,
  ),
  check(
    'breach_episodes_status_check',
    sql`${table.status} in ('open', 'closed')`,
  ),
  check(
    'breach_episodes_consecutive_count_min_check',
    sql`${table.consecutiveCount} >= 1`,
  ),
  check(
    'breach_episodes_close_reason_check',
    sql`${table.closeReason} is null or ${table.closeReason} in ('position-recovered', 'direction-reversed')`,
  ),
  check(
    'breach_episodes_closed_fields_consistency_check',
    sql`(
      (${table.status} = 'open' and ${table.closedAt} is null and ${table.closeReason} is null)
      or
      (${table.status} = 'closed' and ${table.closedAt} is not null and ${table.closeReason} is not null)
    )`,
  ),
  uniqueIndex('breach_episodes_one_open_episode_per_position_idx')
    .on(table.positionId)
    .where(sql`${table.status} = 'open'`),
]);

export const exitTriggers = pgTable('exit_triggers', {
  triggerId: text('trigger_id').primaryKey(),
  positionId: text('position_id').notNull(),
  episodeId: text('episode_id').notNull().unique(),
  directionKind: text('direction_kind').notNull(),
  triggeredAt: bigint('triggered_at', { mode: 'number' }).notNull(),
  confirmationEvaluatedAt: bigint('confirmation_evaluated_at', { mode: 'number' }).notNull(),
  confirmationPassed: boolean('confirmation_passed').notNull().default(true),
}, (table) => [
  check(
    'exit_triggers_direction_kind_check',
    sql`${table.directionKind} in ('lower-bound-breach', 'upper-bound-breach')`,
  ),
]);

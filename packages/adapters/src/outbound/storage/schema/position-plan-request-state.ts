import { sql } from 'drizzle-orm';
import { pgTable, text, bigint, check, index } from 'drizzle-orm/pg-core';

export const positionPlanRequestState = pgTable(
  'position_plan_request_state',
  {
    positionId: text('position_id').primaryKey(),
    leaseToken: text('lease_token'),
    leaseUntil: bigint('lease_until', { mode: 'number' }),
    lastAttemptAt: bigint('last_attempt_at', { mode: 'number' }),
    lastRangeState: text('last_range_state'),
    lastBreachQualifiedAt: bigint('last_breach_qualified_at', { mode: 'number' }),
    lastClosedCandleAt: bigint('last_closed_candle_at', { mode: 'number' }),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    check(
      'position_plan_request_state_last_range_state_check',
      sql`${table.lastRangeState} is null or ${table.lastRangeState} in ('in-range', 'below-range', 'above-range')`,
    ),
    check(
      'position_plan_request_state_lease_until_check',
      sql`${table.leaseUntil} is null or ${table.leaseUntil} >= 0`,
    ),
    check(
      'position_plan_request_state_last_attempt_at_check',
      sql`${table.lastAttemptAt} is null or ${table.lastAttemptAt} >= 0`,
    ),
    check(
      'position_plan_request_state_last_breach_qualified_at_check',
      sql`${table.lastBreachQualifiedAt} is null or ${table.lastBreachQualifiedAt} >= 0`,
    ),
    check(
      'position_plan_request_state_last_closed_candle_at_check',
      sql`${table.lastClosedCandleAt} is null or ${table.lastClosedCandleAt} >= 0`,
    ),
    check('position_plan_request_state_updated_at_check', sql`${table.updatedAt} >= 0`),
    index('position_plan_request_state_lease_until_idx').on(table.leaseUntil),
  ],
);

import { pgTable, text, bigint, unique } from 'drizzle-orm/pg-core';

export const walletPositionOwnership = pgTable('wallet_position_ownership', {
  walletId: text('wallet_id').notNull(),
  positionId: text('position_id').notNull(),
  firstSeenAt: bigint('first_seen_at', { mode: 'number' }).notNull(),
  lastSeenAt: bigint('last_seen_at', { mode: 'number' }).notNull(),
}, (table) => [
  unique('wallet_position_ownership_wallet_position_unique').on(table.walletId, table.positionId),
]);

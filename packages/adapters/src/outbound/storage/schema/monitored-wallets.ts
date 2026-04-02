import { pgTable, text, bigint, boolean } from 'drizzle-orm/pg-core';

export const monitoredWallets = pgTable('monitored_wallets', {
  walletId: text('wallet_id').primaryKey(),
  enrolledAt: bigint('enrolled_at', { mode: 'number' }).notNull(),
  lastScannedAt: bigint('last_scanned_at', { mode: 'number' }),
  active: boolean('active').notNull().default(true),
});

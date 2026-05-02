import { pgTable, text, bigint } from 'drizzle-orm/pg-core';

export const walletChallenges = pgTable('wallet_challenges', {
  walletId: text('wallet_id').primaryKey(),
  nonce: text('nonce').notNull(),
  expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
  issuedAt: bigint('issued_at', { mode: 'number' }).notNull(),
});
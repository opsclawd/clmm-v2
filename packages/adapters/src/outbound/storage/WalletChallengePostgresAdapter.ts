import { and, eq } from 'drizzle-orm';
import type { Db } from './db.js';
import { walletChallenges, monitoredWallets } from './schema/index.js';
import type {
  WalletChallengeRepository,
  WalletChallengeRow,
  ConsumeAndEnrollResult,
} from '@clmm/application';
import type { WalletId, ClockTimestamp } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';

export class WalletChallengePostgresAdapter implements WalletChallengeRepository {
  constructor(private readonly db: Db) {}

  async issue(params: {
    walletId: WalletId;
    nonce: string;
    expiresAt: ClockTimestamp;
    issuedAt: ClockTimestamp;
    now: ClockTimestamp;
  }): Promise<WalletChallengeRow> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(walletChallenges)
        .where(eq(walletChallenges.walletId, params.walletId))
        .for('update');

      if (existing && existing.expiresAt >= params.now) {
        return {
          walletId: existing.walletId as WalletId,
          nonce: existing.nonce,
          expiresAt: makeClockTimestamp(existing.expiresAt),
          issuedAt: makeClockTimestamp(existing.issuedAt),
        };
      }

      await tx
        .insert(walletChallenges)
        .values({
          walletId: params.walletId,
          nonce: params.nonce,
          expiresAt: params.expiresAt,
          issuedAt: params.issuedAt,
        })
        .onConflictDoUpdate({
          target: walletChallenges.walletId,
          set: {
            nonce: params.nonce,
            expiresAt: params.expiresAt,
            issuedAt: params.issuedAt,
          },
        });

      const [row] = await tx
        .select()
        .from(walletChallenges)
        .where(eq(walletChallenges.walletId, params.walletId));

      if (!row) {
        throw new Error('wallet_challenges row missing after upsert');
      }

      return {
        walletId: row.walletId as WalletId,
        nonce: row.nonce,
        expiresAt: makeClockTimestamp(row.expiresAt),
        issuedAt: makeClockTimestamp(row.issuedAt),
      };
    });
  }

  async get(walletId: WalletId): Promise<WalletChallengeRow | null> {
    const [row] = await this.db
      .select()
      .from(walletChallenges)
      .where(eq(walletChallenges.walletId, walletId));
    if (!row) return null;
    return {
      walletId: row.walletId as WalletId,
      nonce: row.nonce,
      expiresAt: makeClockTimestamp(row.expiresAt),
      issuedAt: makeClockTimestamp(row.issuedAt),
    };
  }

  async consumeAndEnrollIfMatches(params: {
    walletId: WalletId;
    nonce: string;
    now: ClockTimestamp;
    enrolledAt: ClockTimestamp;
  }): Promise<ConsumeAndEnrollResult> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(walletChallenges)
        .where(eq(walletChallenges.walletId, params.walletId))
        .for('update');

      if (!row) return { kind: 'not_found' };
      if (row.nonce !== params.nonce) return { kind: 'mismatch' };
      if (row.expiresAt < params.now) return { kind: 'expired' };

      await tx
        .delete(walletChallenges)
        .where(
          and(
            eq(walletChallenges.walletId, params.walletId),
            eq(walletChallenges.nonce, params.nonce),
          ),
        );

      await tx
        .insert(monitoredWallets)
        .values({
          walletId: params.walletId,
          enrolledAt: params.enrolledAt,
          active: true,
        })
        .onConflictDoUpdate({
          target: monitoredWallets.walletId,
          set: { active: true, enrolledAt: params.enrolledAt },
        });

      return { kind: 'consumed' };
    });
  }
}
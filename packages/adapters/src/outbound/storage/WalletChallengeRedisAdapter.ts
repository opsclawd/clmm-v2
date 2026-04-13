import Redis from 'ioredis';
import type { WalletChallengeRepository } from '@clmm/application';
import type { WalletId, ClockTimestamp } from '@clmm/domain';
import { randomBytes } from 'crypto';

const KEY_PREFIX = 'wallet_challenge:';

interface ChallengeValue {
  nonce: string;
  walletId: string;
  expiresAt: number; // Unix ms
}

/**
 * Redis-backed implementation of WalletChallengeRepository.
 *
 * Key pattern:  wallet_challenge:{walletId}  → JSON string
 * TTL:         set to match expiry so Redis auto-evicts expired rows
 *
 * Redis is a single replica; in a multi-replica Railway deployment all
 * instances share the same Redis cache, solving the in-process Map bug.
 */
export class WalletChallengeRedisAdapter implements WalletChallengeRepository {
  private readonly redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });
  }

  private key(walletId: WalletId): string {
    return `${KEY_PREFIX}${walletId}`;
  }

  async issue(
    walletId: WalletId,
    ttlMs: number,
    now: ClockTimestamp,
  ): Promise<{ nonce: string; expiresAt: ClockTimestamp }> {
    const nonce = randomBytes(32).toString('hex');
    const expiresAt = (now + ttlMs) as ClockTimestamp;
    const value: ChallengeValue = {
      nonce,
      walletId,
      expiresAt,
    };
    // SET with PX for ms-precision TTL
    await this.redis.set(
      this.key(walletId),
      JSON.stringify(value),
      'PX',
      ttlMs,
    );
    return { nonce, expiresAt };
  }

  async consume(
    nonce: string,
    walletId: WalletId,
    now: ClockTimestamp,
  ): Promise<{ nonce: string; walletId: WalletId; expiresAt: ClockTimestamp } | null> {
    const raw = await this.redis.get(this.key(walletId));
    if (!raw) return null;

    let challenge: ChallengeValue;
    try {
      challenge = JSON.parse(raw) as ChallengeValue;
    } catch {
      return null;
    }

    // Reject if nonce mismatch, expired, or wallet mismatch
    if (challenge.nonce !== nonce) return null;
    if (challenge.expiresAt <= now) return null;
    if (challenge.walletId !== walletId) return null;

    // One-time use: delete immediately after validated
    await this.redis.del(this.key(walletId));

    return {
      nonce: challenge.nonce,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertions
      walletId: challenge.walletId as WalletId,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertions
      expiresAt: challenge.expiresAt as ClockTimestamp,
    };
  }
}

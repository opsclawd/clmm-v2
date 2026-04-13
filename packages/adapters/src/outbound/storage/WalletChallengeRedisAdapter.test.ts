import { describe, it, expect, vi } from 'vitest';
import { WalletChallengeRedisAdapter } from './WalletChallengeRedisAdapter.js';
import type { WalletId } from '@clmm/domain';

const NOW = 1_700_000_000_000 as import('@clmm/domain').ClockTimestamp;
const TTL_MS = 5 * 60 * 1_000;

// Branded wallet IDs used in tests — plain strings must be cast
const W1 = 'Wallet123' as WalletId;
const W2 = 'WrongWallet' as WalletId;

interface MockRedis {
  get: (...args: unknown[]) => unknown;
  set: (...args: unknown[]) => unknown;
  del: (...args: unknown[]) => unknown;
  connect: (...args: unknown[]) => unknown;
  _store: Record<string, string>;
}

function makeMockRedis(): MockRedis {
  const store: Record<string, string> = {};
  return {
    get: vi.fn((key: string) => store[key] ?? null),
    set: vi.fn((key: string, val: string) => {
      store[key] = val;
      return 'OK';
    }),
    del: vi.fn((key: string) => {
      delete store[key];
      return 1;
    }),
    connect: vi.fn(),
    _store: store,
  };
}

describe('WalletChallengeRedisAdapter', () => {
  function createAdapterWithMock(): {
    adapter: WalletChallengeRedisAdapter;
    mock: MockRedis;
  } {
    const mock = makeMockRedis();
    const adapter = new WalletChallengeRedisAdapter('redis://ignored');
    // Inject mock without triggering the real Redis constructor
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.defineProperty(adapter, 'redis', { value: mock as any });
    return { adapter, mock };
  }

  it('issues a challenge and stores nonce + expiry in Redis', async () => {
    const { adapter, mock } = createAdapterWithMock();

    const result = await adapter.issue(W1, TTL_MS, NOW);
    expect(result.nonce).toHaveLength(64);
    expect(result.expiresAt).toBe(NOW + TTL_MS);
    expect(mock.set).toHaveBeenCalledWith(
      `wallet_challenge:${W1}`,
      expect.any(String),
      'PX',
      TTL_MS,
    );
    const stored = mock._store[`wallet_challenge:${W1}`]!;
    const parsed = JSON.parse(stored) as {
      nonce: string;
      walletId: string;
      expiresAt: number;
    };
    expect(parsed.nonce).toBe(result.nonce);
    expect(parsed.walletId).toBe(W1);
    expect(parsed.expiresAt).toBe(NOW + TTL_MS);
  });

  it('consume returns null for unknown wallet', async () => {
    const { adapter } = createAdapterWithMock();
    const result = await adapter.consume(
      'nonexistent00000000000000000000000000000000000000000000',
      W1,
      NOW,
    );
    expect(result).toBeNull();
  });

  it('consume returns null for wrong walletId', async () => {
    const { adapter, mock } = createAdapterWithMock();
    // Pre-store a challenge for a different wallet under W1's key
    mock._store[`wallet_challenge:${W1}`] = JSON.stringify({
      nonce: 'a'.repeat(64),
      walletId: W2,
      expiresAt: NOW + TTL_MS,
    });

    const result = await adapter.consume('a'.repeat(64), W1, NOW);
    expect(result).toBeNull();
  });

  it('consume returns null for expired challenge', async () => {
    const { adapter, mock } = createAdapterWithMock();
    mock._store[`wallet_challenge:${W1}`] = JSON.stringify({
      nonce: 'a'.repeat(64),
      walletId: W1,
      expiresAt: NOW - 1,
    });

    const result = await adapter.consume('a'.repeat(64), W1, NOW);
    expect(result).toBeNull();
  });

  it('consume returns challenge and deletes it (one-time use)', async () => {
    const { adapter, mock } = createAdapterWithMock();
    const { nonce } = await adapter.issue(W1, TTL_MS, NOW);

    const result = await adapter.consume(nonce, W1, NOW);
    expect(result).not.toBeNull();
    expect(result!.nonce).toBe(nonce);
    expect(result!.walletId).toBe(W1);
    expect(mock.del).toHaveBeenCalledWith(`wallet_challenge:${W1}`);

    // Second consume should fail — key was deleted
    const second = await adapter.consume(nonce, W1, NOW);
    expect(second).toBeNull();
  });

  it('consume is nonce-specific', async () => {
    const { adapter } = createAdapterWithMock();
    const { nonce } = await adapter.issue(W1, TTL_MS, NOW);
    // Tamper with the nonce
    const wrongNonce =
      nonce.slice(0, -1) +
      (parseInt(nonce.slice(-1), 16) ^ 1).toString(16);

    const result = await adapter.consume(wrongNonce, W1, NOW);
    expect(result).toBeNull();
  });
});

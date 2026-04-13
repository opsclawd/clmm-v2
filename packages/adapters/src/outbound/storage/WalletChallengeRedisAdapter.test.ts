import { describe, it, expect, vi } from 'vitest';
import { WalletChallengeRedisAdapter } from './WalletChallengeRedisAdapter.js';

const NOW = 1_700_000_000_000 as import('@clmm/domain').ClockTimestamp;
const TTL_MS = 5 * 60 * 1_000;

interface MockRedis {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
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

    const result = await adapter.issue('Wallet123', TTL_MS, NOW);
    expect(result.nonce).toHaveLength(64);
    expect(result.expiresAt).toBe(NOW + TTL_MS);
    expect(mock.set).toHaveBeenCalledWith(
      'wallet_challenge:Wallet123',
      expect.any(String),
      'PX',
      TTL_MS,
    );
    const stored = mock._store['wallet_challenge:Wallet123'];
    const parsed = JSON.parse(stored) as {
      nonce: string;
      walletId: string;
      expiresAt: number;
    };
    expect(parsed.nonce).toBe(result.nonce);
    expect(parsed.walletId).toBe('Wallet123');
    expect(parsed.expiresAt).toBe(NOW + TTL_MS);
  });

  it('consume returns null for unknown wallet', async () => {
    const { adapter } = createAdapterWithMock();
    const result = await adapter.consume(
      'nonexistent00000000000000000000000000000000000000000000',
      'Wallet123',
      NOW,
    );
    expect(result).toBeNull();
  });

  it('consume returns null for wrong walletId', async () => {
    const { adapter, mock } = createAdapterWithMock();
    // Pre-store a challenge for a different wallet under Wallet123's key
    mock._store['wallet_challenge:Wallet123'] = JSON.stringify({
      nonce: 'a'.repeat(64),
      walletId: 'WrongWallet',
      expiresAt: NOW + TTL_MS,
    });

    const result = await adapter.consume('a'.repeat(64), 'Wallet123', NOW);
    expect(result).toBeNull();
  });

  it('consume returns null for expired challenge', async () => {
    const { adapter, mock } = createAdapterWithMock();
    mock._store['wallet_challenge:Wallet123'] = JSON.stringify({
      nonce: 'a'.repeat(64),
      walletId: 'Wallet123',
      expiresAt: NOW - 1,
    });

    const result = await adapter.consume('a'.repeat(64), 'Wallet123', NOW);
    expect(result).toBeNull();
  });

  it('consume returns challenge and deletes it (one-time use)', async () => {
    const { adapter, mock } = createAdapterWithMock();
    const { nonce } = await adapter.issue('Wallet123', TTL_MS, NOW);

    const result = await adapter.consume(nonce, 'Wallet123', NOW);
    expect(result).not.toBeNull();
    expect(result!.nonce).toBe(nonce);
    expect(result!.walletId).toBe('Wallet123');
    expect(mock.del).toHaveBeenCalledWith('wallet_challenge:Wallet123');

    // Second consume should fail — key was deleted
    const second = await adapter.consume(nonce, 'Wallet123', NOW);
    expect(second).toBeNull();
  });

  it('consume is nonce-specific', async () => {
    const { adapter } = createAdapterWithMock();
    const { nonce } = await adapter.issue('Wallet123', TTL_MS, NOW);
    // Tamper with the nonce
    const wrongNonce =
      nonce.slice(0, -1) +
      (parseInt(nonce.slice(-1), 16) ^ 1).toString(16);

    const result = await adapter.consume(wrongNonce, 'Wallet123', NOW);
    expect(result).toBeNull();
  });
});

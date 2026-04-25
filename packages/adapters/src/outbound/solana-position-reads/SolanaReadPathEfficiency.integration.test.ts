/**
 * SolanaReadPathEfficiency Integration Test
 *
 * Proves the list -> detail -> triggers flow uses the intended RPC shape:
 * - listSupportedPositions(): one wallet scan + deduped whirlpool reads
 * - getPosition(): direct getPositionAddress -> fetchPosition -> fetchWhirlpool path
 * - listActionableTriggers(): DB-only, zero Solana reads
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SolanaPositionSnapshotReader } from './SolanaPositionSnapshotReader';
import { OrcaPositionReadAdapter } from './OrcaPositionReadAdapter';
import { OperationalStorageAdapter } from '../storage/OperationalStorageAdapter';
import type { WalletId } from '@clmm/domain';
import { makePositionId } from '@clmm/domain';

vi.mock('@orca-so/whirlpools', () => ({
  fetchPositionsForOwner: vi.fn(),
}));

vi.mock('@solana/kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@solana/kit')>();
  return {
    ...actual,
    createSolanaRpc: () => ({
      getTokenAccountsByOwner: () => ({
        send: () =>
          Promise.resolve({
            value: [{ account: { data: { parsed: { info: { tokenAmount: { amount: '1000000' } } } } } }],
          }),
      }),
    }),
  };
});

vi.mock('@orca-so/whirlpools-client', () => ({
  getPositionAddress: vi.fn(),
  fetchPosition: vi.fn(),
  fetchWhirlpool: vi.fn(),
}));

const MOCK_WALLET = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T' as WalletId;
const MOCK_POSITION_MINT = '2Wgh4mq6rp1q6H1G6K3ZsR3LBdqT5qVJb5KfF3U7Y2hX';
const MOCK_POSITION_MINT_2 = '3Xhi4mq6rp1q6H1G6K3ZsR3LBdqT5qVJb5KfF3U7Y2hY';
const MOCK_WHIRLPOOL = '7qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJnm';

describe('Solana read path efficiency integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the reduced RPC shape for list, detail, and trigger flows', async () => {
    const { fetchPositionsForOwner } = await import('@orca-so/whirlpools');
    const { fetchWhirlpool, getPositionAddress, fetchPosition } = await import('@orca-so/whirlpools-client');
    const now = Date.now();

    // Arrange: wallet scan returns two positions on the same whirlpool
    vi.mocked(fetchPositionsForOwner).mockResolvedValue([
      {
        address: 'PositionAddress1',
        isPositionBundle: false,
        data: {
          whirlpool: MOCK_WHIRLPOOL,
          tickLowerIndex: -18304,
          tickUpperIndex: -17956,
          positionMint: MOCK_POSITION_MINT,
        },
      },
      {
        address: 'PositionAddress2',
        isPositionBundle: false,
        data: {
          whirlpool: MOCK_WHIRLPOOL,
          tickLowerIndex: -10000,
          tickUpperIndex: -5000,
          positionMint: MOCK_POSITION_MINT_2,
        },
      },
    ] as unknown as Awaited<ReturnType<typeof fetchPositionsForOwner>>);

    // Batched whirlpool fetch - returns once for shared pool
    vi.mocked(fetchWhirlpool).mockResolvedValue({
      data: {
        tickCurrentIndex: -18130,
        sqrtPrice: 184467440737095516n,
        tokenMintA: { toString: () => 'So11111111111111111111111111111111111111112' },
        tokenMintB: { toString: () => 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
        feeRate: 10,
        tickSpacing: 64,
        liquidity: 2400000000n,
      },
    } as unknown as Awaited<ReturnType<typeof fetchWhirlpool>>);

    // Direct position lookup for getPosition()
    vi.mocked(getPositionAddress).mockResolvedValue(['PositionPDA1', 0] as unknown as Awaited<ReturnType<typeof getPositionAddress>>);
    vi.mocked(fetchPosition).mockResolvedValue({
      data: {
        whirlpool: MOCK_WHIRLPOOL,
        tickLowerIndex: -18304,
        tickUpperIndex: -17956,
        positionMint: MOCK_POSITION_MINT,
      },
    } as unknown as Awaited<ReturnType<typeof fetchPosition>>);

    // DB instrumentation for ownership and trigger queries
    let ownershipSelectCalls = 0;
    let triggerSelectCalls = 0;

    function predicateReferencesOpenEpisodeFilter(value: unknown): boolean {
      const visited = new WeakSet<object>();
      function walk(node: unknown): boolean {
        if (node == null) return false;
        if (typeof node === 'string') {
          return node === 'open';
        }
        if (typeof node !== 'object') return false;
        if (visited.has(node)) return false;
        visited.add(node);

        const record = node as Record<string, unknown>;
        const table = record['table'];
        const name = record['name'];
        if (
          typeof name === 'string' &&
          name === 'status' &&
          typeof table === 'object' &&
          table != null &&
          (table as { name?: unknown }).name === 'breach_episodes'
        ) {
          return true;
        }

        const queryChunks = record['queryChunks'];
        if (Array.isArray(queryChunks) && queryChunks.some((chunk) => walk(chunk))) {
          return true;
        }

        return Object.values(record).some((entry) => walk(entry));
      }

      return walk(value);
    }

    const mockDb = {
      select: () => ({
        from: (table: unknown) => {
          const tableName = (table as { name?: string })?.name ??
            ((table as Record<string | symbol, unknown>)[Symbol.for('drizzle:Name')] as string | undefined) ?? '';
          if (tableName === 'wallet_position_ownership') {
            ownershipSelectCalls++;
            return {
              where: async () => [
                { walletId: MOCK_WALLET, positionId: MOCK_POSITION_MINT, firstSeenAt: now - 1_000, lastSeenAt: now - 1_000 },
                { walletId: MOCK_WALLET, positionId: MOCK_POSITION_MINT_2, firstSeenAt: now - 1_000, lastSeenAt: now - 1_000 },
              ],
            };
          }
          if (tableName === 'exit_triggers') {
            triggerSelectCalls++;
            return {
              innerJoin: () => ({
                where: async (predicate: unknown) =>
                  predicateReferencesOpenEpisodeFilter(predicate)
                    ? [
                        {
                          triggerId: 'trigger1',
                          positionId: MOCK_POSITION_MINT,
                          episodeId: 'episode1',
                          directionKind: 'lower-bound-breach',
                          triggeredAt: 1_000_000,
                          confirmationEvaluatedAt: 1_000_001,
                        },
                      ]
                    : [],
              }),
            };
          }
          return { where: async () => [] };
        },
      }),
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: () => Promise.resolve(),
        }),
      }),
    };

    const rpcUrl = 'https://api.mainnet-beta.solana.com';
    const snapshotReader = new SolanaPositionSnapshotReader(rpcUrl);
    const positionRead = new OrcaPositionReadAdapter(rpcUrl, snapshotReader, mockDb as never);
    const storage = new OperationalStorageAdapter(mockDb as never, { generateId: () => 'id' } as never);

    // Act
    const listed = await positionRead.listSupportedPositions(MOCK_WALLET);
    const detail = await positionRead.getPosition(MOCK_WALLET, makePositionId(MOCK_POSITION_MINT));
    const triggers = await storage.listActionableTriggers(MOCK_WALLET);

    // Assert behavior
    expect(listed).toHaveLength(2);
    expect(detail?.positionId).toBe(MOCK_POSITION_MINT);
    expect(triggers).toHaveLength(1);
    expect(triggers[0]?.positionId).toBe(MOCK_POSITION_MINT);

    // Assert reduced RPC call shape:
    // - listSupportedPositions: 1 wallet scan + 1 deduped whirlpool fetch
    // - getPosition: 1 getPositionAddress + 1 fetchPosition + 1 fetchWhirlpool
    // - listActionableTriggers: 0 Solana calls
    expect(fetchPositionsForOwner).toHaveBeenCalledTimes(1);
    expect(getPositionAddress).toHaveBeenCalledTimes(1);
    expect(fetchPosition).toHaveBeenCalledTimes(1);
    expect(fetchWhirlpool).toHaveBeenCalledTimes(2); // 1 from list + 1 from getPosition

    // Assert DB-only trigger listing
    expect(ownershipSelectCalls).toBe(1);
    expect(triggerSelectCalls).toBe(1);
  });
});

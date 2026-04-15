/**
 * SolanaReadPathEfficiency Integration Test
 *
 * Proves the list flow uses the intended RPC shape with deduplication.
 * (The listActionableTriggers DB-only behavior is tested in OperationalStorageAdapter.test.ts,
 * and getPosition delegation is tested in OrcaPositionReadAdapter.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SolanaPositionSnapshotReader } from './SolanaPositionSnapshotReader';
import { OrcaPositionReadAdapter } from './OrcaPositionReadAdapter';
import type { WalletId } from '@clmm/domain';

vi.mock('@orca-so/whirlpools', () => ({
  fetchPositionsForOwner: vi.fn(),
}));

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

  it('uses batched whirlpool fetching with deduplication in listSupportedPositions', async () => {
    const { fetchPositionsForOwner } = await import('@orca-so/whirlpools');
    const { fetchWhirlpool } = await import('@orca-so/whirlpools-client');

    // Arrange: wallet scan returns two positions across one shared whirlpool
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

    // Batched whirlpool fetch returns the shared whirlpool once
    vi.mocked(fetchWhirlpool).mockResolvedValue({
      data: { tickCurrentIndex: -18130 },
    } as unknown as Awaited<ReturnType<typeof fetchWhirlpool>>);

    // Arrange: fake DB for scan-time ownership writes
    const mockDb = {
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: () => Promise.resolve(),
        }),
      }),
    };

    const rpcUrl = 'https://api.mainnet-beta.solana.com';
    const snapshotReader = new SolanaPositionSnapshotReader(rpcUrl);
    const positionRead = new OrcaPositionReadAdapter(rpcUrl, snapshotReader, mockDb as never);

    // Act
    const listed = await positionRead.listSupportedPositions(MOCK_WALLET);

    // Assert behavior
    expect(listed).toHaveLength(2);

    // Assert call shape: one wallet scan, one deduped whirlpool fetch
    // 2 positions but only 1 unique whirlpool -> only 1 fetchWhirlpool call
    expect(fetchPositionsForOwner).toHaveBeenCalledTimes(1);
    expect(fetchWhirlpool).toHaveBeenCalledTimes(1); // deduplicated to 1 for shared pool
  });
});

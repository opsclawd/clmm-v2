/**
 * OrcaPositionReadAdapter TDD tests
 */
import { describe, it, expect, vi } from 'vitest';
import { OrcaPositionReadAdapter } from './OrcaPositionReadAdapter';
import { SolanaPositionSnapshotReader } from './SolanaPositionSnapshotReader';
import { makePositionId } from '@clmm/domain';
import type { WalletId } from '@clmm/domain';

vi.mock('./SolanaPositionSnapshotReader', () => ({
  SolanaPositionSnapshotReader: vi.fn().mockImplementation(() => ({
    fetchSinglePosition: vi.fn(),
    fetchWhirlpoolsBatched: vi.fn(),
    getRpc: vi.fn(() => ({})),
  })),
}));

vi.mock('@orca-so/whirlpools', () => ({
  fetchPositionsForOwner: vi.fn(),
}));

// Valid base58 Solana addresses (32 bytes = 44 base58 chars)
const MOCK_WALLET = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T' as WalletId;
const MOCK_POSITION_MINT = '2Wgh4mq6rp1q6H1G6K3ZsR3LBdqT5qVJb5KfF3U7Y2hX';
const MOCK_WHIRLPOOL = '7qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJnm';

describe('OrcaPositionReadAdapter', () => {
  const mockRpcUrl = 'https://api.mainnet-beta.solana.com';

  const mockDb = {
    insert: () => ({
      values: (_row: { walletId: string; positionId: string; firstSeenAt: number; lastSeenAt: number }) => ({
        onConflictDoUpdate: () => Promise.resolve(),
      }),
    }),
  };

  describe('listSupportedPositions', () => {
    it('returns array of LiquidityPosition for wallet', async () => {
      const { fetchPositionsForOwner } = await import('@orca-so/whirlpools');

      vi.mocked(fetchPositionsForOwner).mockResolvedValue([
        {
          address: 'PositionAddress123456789012345678901234',
          isPositionBundle: false,
          data: {
            whirlpool: MOCK_WHIRLPOOL,
            tickLowerIndex: -18304,
            tickUpperIndex: -17956,
            positionMint: MOCK_POSITION_MINT,
          },
        },
      ] as unknown as Awaited<ReturnType<typeof fetchPositionsForOwner>>);

      const mockReader = new SolanaPositionSnapshotReader(mockRpcUrl);
      mockReader.fetchWhirlpoolsBatched = vi.fn().mockResolvedValue(
        new Map([[MOCK_WHIRLPOOL, { tickCurrentIndex: -18130 }]]),
      );

      const adapter = new OrcaPositionReadAdapter(mockRpcUrl, mockReader, mockDb as never);
      const positions = await adapter.listSupportedPositions(MOCK_WALLET);

      expect(Array.isArray(positions)).toBe(true);
      expect(positions.length).toBe(1);
      expect(positions[0]!.positionId).toBe(MOCK_POSITION_MINT);
    });

    it('computes correct rangeState when price is in range', async () => {
      const { fetchPositionsForOwner } = await import('@orca-so/whirlpools');

      vi.mocked(fetchPositionsForOwner).mockResolvedValue([
        {
          address: 'PositionAddress123456789012345678901234',
          isPositionBundle: false,
          data: {
            whirlpool: MOCK_WHIRLPOOL,
            tickLowerIndex: -18304,
            tickUpperIndex: -17956,
            positionMint: MOCK_POSITION_MINT,
          },
        },
      ] as unknown as Awaited<ReturnType<typeof fetchPositionsForOwner>>);

      const mockReader = new SolanaPositionSnapshotReader(mockRpcUrl);
      mockReader.fetchWhirlpoolsBatched = vi.fn().mockResolvedValue(
        new Map([[MOCK_WHIRLPOOL, { tickCurrentIndex: -18130 }]]),
      );

      const adapter = new OrcaPositionReadAdapter(mockRpcUrl, mockReader, mockDb as never);
      const positions = await adapter.listSupportedPositions(MOCK_WALLET);

      expect(positions[0]!.rangeState.kind).toBe('in-range');
    });

    it('computes below-range when current tick is below lower bound', async () => {
      const { fetchPositionsForOwner } = await import('@orca-so/whirlpools');

      vi.mocked(fetchPositionsForOwner).mockResolvedValue([
        {
          address: 'PositionAddress123456789012345678901234',
          isPositionBundle: false,
          data: {
            whirlpool: MOCK_WHIRLPOOL,
            tickLowerIndex: -10000,
            tickUpperIndex: -5000,
            positionMint: MOCK_POSITION_MINT,
          },
        },
      ] as unknown as Awaited<ReturnType<typeof fetchPositionsForOwner>>);

      const mockReader = new SolanaPositionSnapshotReader(mockRpcUrl);
      mockReader.fetchWhirlpoolsBatched = vi.fn().mockResolvedValue(
        new Map([[MOCK_WHIRLPOOL, { tickCurrentIndex: -20000 }]]),
      );

      const adapter = new OrcaPositionReadAdapter(mockRpcUrl, mockReader, mockDb as never);
      const positions = await adapter.listSupportedPositions(MOCK_WALLET);

      expect(positions[0]!.rangeState.kind).toBe('below-range');
    });

    it('computes above-range when current tick is above upper bound', async () => {
      const { fetchPositionsForOwner } = await import('@orca-so/whirlpools');

      vi.mocked(fetchPositionsForOwner).mockResolvedValue([
        {
          address: 'PositionAddress123456789012345678901234',
          isPositionBundle: false,
          data: {
            whirlpool: MOCK_WHIRLPOOL,
            tickLowerIndex: -10000,
            tickUpperIndex: -5000,
            positionMint: MOCK_POSITION_MINT,
          },
        },
      ] as unknown as Awaited<ReturnType<typeof fetchPositionsForOwner>>);

      const mockReader = new SolanaPositionSnapshotReader(mockRpcUrl);
      mockReader.fetchWhirlpoolsBatched = vi.fn().mockResolvedValue(
        new Map([[MOCK_WHIRLPOOL, { tickCurrentIndex: 0 }]]),
      );

      const adapter = new OrcaPositionReadAdapter(mockRpcUrl, mockReader, mockDb as never);
      const positions = await adapter.listSupportedPositions(MOCK_WALLET);

      expect(positions[0]!.rangeState.kind).toBe('above-range');
    });

    it('skips position bundles', async () => {
      const { fetchPositionsForOwner } = await import('@orca-so/whirlpools');

      vi.mocked(fetchPositionsForOwner).mockResolvedValue([
        {
          address: 'BundleAddress1234567890123456789012345',
          isPositionBundle: true,
          data: {},
        },
        {
          address: 'PositionAddress123456789012345678901234',
          isPositionBundle: false,
          data: {
            whirlpool: MOCK_WHIRLPOOL,
            tickLowerIndex: -10000,
            tickUpperIndex: -5000,
            positionMint: MOCK_POSITION_MINT,
          },
        },
      ] as unknown as Awaited<ReturnType<typeof fetchPositionsForOwner>>);

      const mockReader = new SolanaPositionSnapshotReader(mockRpcUrl);
      mockReader.fetchWhirlpoolsBatched = vi.fn().mockResolvedValue(
        new Map([[MOCK_WHIRLPOOL, { tickCurrentIndex: -7500 }]]),
      );

      const adapter = new OrcaPositionReadAdapter(mockRpcUrl, mockReader, mockDb as never);
      const positions = await adapter.listSupportedPositions(MOCK_WALLET);

      expect(positions.length).toBe(1);
    });

    it('returns bundled positions owned by the wallet', async () => {
      const { fetchPositionsForOwner } = await import('@orca-so/whirlpools');

      vi.mocked(fetchPositionsForOwner).mockResolvedValue([
        {
          address: 'BundleAddress1234567890123456789012345',
          isPositionBundle: true,
          positions: [
            {
              address: 'BundledPositionAddress12345678901234567890',
              data: {
                whirlpool: MOCK_WHIRLPOOL,
                tickLowerIndex: -18304,
                tickUpperIndex: -17956,
                positionMint: MOCK_POSITION_MINT,
              },
            },
          ],
        },
      ] as unknown as Awaited<ReturnType<typeof fetchPositionsForOwner>>);

      const mockReader = new SolanaPositionSnapshotReader(mockRpcUrl);
      mockReader.fetchWhirlpoolsBatched = vi.fn().mockResolvedValue(
        new Map([[MOCK_WHIRLPOOL, { tickCurrentIndex: -18130 }]]),
      );

      const adapter = new OrcaPositionReadAdapter(mockRpcUrl, mockReader, mockDb as never);
      const positions = await adapter.listSupportedPositions(MOCK_WALLET);

      expect(positions).toHaveLength(1);
      expect(positions[0]!.positionId).toBe(MOCK_POSITION_MINT);
      expect(positions[0]!.rangeState.kind).toBe('in-range');
    });

    it('scan-time ownership writes upserts wallet_position_ownership for each position found during listSupportedPositions', async () => {
      const { fetchPositionsForOwner } = await import('@orca-so/whirlpools');

      vi.mocked(fetchPositionsForOwner).mockResolvedValue([
        {
          address: 'PositionAddress123456789012345678901234',
          isPositionBundle: false,
          data: {
            whirlpool: MOCK_WHIRLPOOL,
            tickLowerIndex: -18304,
            tickUpperIndex: -17956,
            positionMint: MOCK_POSITION_MINT,
          },
        },
      ] as unknown as Awaited<ReturnType<typeof fetchPositionsForOwner>>);

      const mockReader = new SolanaPositionSnapshotReader(mockRpcUrl);
      mockReader.fetchWhirlpoolsBatched = vi.fn().mockResolvedValue(
        new Map([[MOCK_WHIRLPOOL, { tickCurrentIndex: -18130 }]]),
      );

      const upsertedRows: Array<{ walletId: string; positionId: string }> = [];
      const mockDbWithTracking = {
        insert: () => ({
          values: (row: { walletId: string; positionId: string }) => {
            upsertedRows.push(row);
            return {
              onConflictDoUpdate: () => Promise.resolve(),
            };
          },
        }),
      };

      const adapter = new OrcaPositionReadAdapter(mockRpcUrl, mockReader, mockDbWithTracking as never);
      await adapter.listSupportedPositions(MOCK_WALLET);

      expect(upsertedRows).toHaveLength(1);
      expect(upsertedRows[0]!.walletId).toBe(MOCK_WALLET);
      expect(upsertedRows[0]!.positionId).toBe(MOCK_POSITION_MINT);
    });

    it('upserts ownership rows even when a whirlpool lookup fails for one scanned position', async () => {
      const { fetchPositionsForOwner } = await import('@orca-so/whirlpools');

      vi.mocked(fetchPositionsForOwner).mockResolvedValue([
        {
          address: 'PositionAddress123456789012345678901234',
          isPositionBundle: false,
          data: {
            whirlpool: MOCK_WHIRLPOOL,
            tickLowerIndex: -18304,
            tickUpperIndex: -17956,
            positionMint: MOCK_POSITION_MINT,
          },
        },
        {
          address: 'PositionAddress223456789012345678901234',
          isPositionBundle: false,
          data: {
            whirlpool: 'missing-whirlpool-1',
            tickLowerIndex: -1000,
            tickUpperIndex: 1000,
            positionMint: makePositionId('missing-position-1'),
          },
        },
      ] as unknown as Awaited<ReturnType<typeof fetchPositionsForOwner>>);

      const mockReader = new SolanaPositionSnapshotReader(mockRpcUrl);
      mockReader.fetchWhirlpoolsBatched = vi.fn().mockResolvedValue(
        new Map([[MOCK_WHIRLPOOL, { tickCurrentIndex: -18130 }]]),
      );

      const upsertedRows: Array<{ walletId: string; positionId: string }> = [];
      const mockDbWithTracking = {
        insert: () => ({
          values: (row: { walletId: string; positionId: string }) => {
            upsertedRows.push(row);
            return {
              onConflictDoUpdate: () => Promise.resolve(),
            };
          },
        }),
      };

      const adapter = new OrcaPositionReadAdapter(mockRpcUrl, mockReader, mockDbWithTracking as never);
      const positions = await adapter.listSupportedPositions(MOCK_WALLET);

      expect(positions).toHaveLength(1);
      expect(upsertedRows).toHaveLength(2);
      expect(upsertedRows.map((row) => row.positionId)).toEqual([
        MOCK_POSITION_MINT,
        makePositionId('missing-position-1'),
      ]);
    });

    it('excludes positions whose whirlpool data is missing from the batched reader result', async () => {
      const { fetchPositionsForOwner } = await import('@orca-so/whirlpools');

      vi.mocked(fetchPositionsForOwner).mockResolvedValue([
        {
          address: 'PositionAddress123456789012345678901234',
          isPositionBundle: false,
          data: {
            whirlpool: MOCK_WHIRLPOOL,
            tickLowerIndex: -18304,
            tickUpperIndex: -17956,
            positionMint: MOCK_POSITION_MINT,
          },
        },
      ] as unknown as Awaited<ReturnType<typeof fetchPositionsForOwner>>);

      const mockReader = new SolanaPositionSnapshotReader(mockRpcUrl);
      mockReader.fetchWhirlpoolsBatched = vi.fn().mockResolvedValue(new Map());

      const adapter = new OrcaPositionReadAdapter(mockRpcUrl, mockReader, mockDb as never);
      const positions = await adapter.listSupportedPositions(MOCK_WALLET);

      expect(positions).toEqual([]);
    });
  });

  describe('getPosition', () => {
    it('returns the requested position when the wallet owns it', async () => {
      const mockReader = new SolanaPositionSnapshotReader(mockRpcUrl);
      mockReader.fetchSinglePosition = vi.fn().mockResolvedValue({
        positionId: makePositionId(MOCK_POSITION_MINT),
        walletId: MOCK_WALLET,
        poolId: MOCK_WHIRLPOOL,
        bounds: { lowerBound: -18304, upperBound: -17956 },
        lastObservedAt: 1_000_000,
        rangeState: { kind: 'in-range', currentPrice: -18130 },
        monitoringReadiness: { kind: 'active' },
      });

      const adapter = new OrcaPositionReadAdapter(mockRpcUrl, mockReader, mockDb as never);
      const result = await adapter.getPosition(MOCK_WALLET, makePositionId(MOCK_POSITION_MINT));

      expect(result).not.toBeNull();
      expect(result?.positionId).toBe(MOCK_POSITION_MINT);
      expect(result?.walletId).toBe(MOCK_WALLET);
      expect(result?.rangeState.kind).toBe('in-range');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const fetchSinglePosition = mockReader.fetchSinglePosition;
      expect(fetchSinglePosition).toHaveBeenCalledOnce();
      expect(fetchSinglePosition).toHaveBeenCalledWith(
        expect.anything(),
        makePositionId(MOCK_POSITION_MINT),
        MOCK_WALLET,
      );
    });

    it('returns null when the wallet does not own the requested position', async () => {
      const mockReader = new SolanaPositionSnapshotReader(mockRpcUrl);
      mockReader.fetchSinglePosition = vi.fn().mockResolvedValue(null);

      const adapter = new OrcaPositionReadAdapter(mockRpcUrl, mockReader, mockDb as never);
      const result = await adapter.getPosition(
        MOCK_WALLET,
        makePositionId('9w7A9sXjC8eGdxzpcM8f7mPy8tLQGvY1z9WnK3m2LcQa'),
      );

      expect(result).toBeNull();
    });
  });
});

/**
 * OrcaPositionReadAdapter TDD tests
 * RED: Write failing test first, then implement
 */
import { describe, it, expect, vi } from 'vitest';
import { OrcaPositionReadAdapter } from './OrcaPositionReadAdapter';
import { makeWalletId, makePositionId } from '@clmm/domain';
import type { WalletId, PositionId } from '@clmm/domain';

// Mock the Orca SDK functions
vi.mock('@orca-so/whirlpools', () => ({
  fetchPositionsForOwner: vi.fn(),
}));

vi.mock('@orca-so/whirlpools-client', () => ({
  fetchWhirlpool: vi.fn(),
}));

// Valid base58 Solana addresses for testing
const MOCK_WALLET = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T' as WalletId;
const MOCK_POSITION = '2Wgh4mq6rp1q6H1G6K3ZsR3LBdqT5qVJb5KfF3U7Y2h' as PositionId;
const MOCK_WHIRLPOOL = '7qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJnm';

describe('OrcaPositionReadAdapter', () => {
  const mockRpcUrl = 'https://api.mainnet-beta.solana.com';

  describe('listSupportedPositions', () => {
    it('returns array of LiquidityPosition for wallet', async () => {
      const { fetchPositionsForOwner } = await import('@orca-so/whirlpools');
      const { fetchWhirlpool } = await import('@orca-so/whirlpools-client');

      vi.mocked(fetchPositionsForOwner).mockResolvedValue([
        {
          address: MOCK_POSITION,
          isPositionBundle: false,
          data: {
            whirlpool: MOCK_WHIRLPOOL,
            tickLowerIndex: -18304,
            tickUpperIndex: -17956,
          },
        },
      ] as any);

      vi.mocked(fetchWhirlpool).mockResolvedValue({
        data: { tickCurrentIndex: -18130 },
      } as any);

      const adapter = new OrcaPositionReadAdapter(mockRpcUrl);
      const positions = await adapter.listSupportedPositions(MOCK_WALLET);

      expect(Array.isArray(positions)).toBe(true);
      expect(positions.length).toBe(1);
      expect(positions[0]!.positionId).toBe(MOCK_POSITION);
    });

    it('computes correct rangeState when price is in range', async () => {
      const { fetchPositionsForOwner } = await import('@orca-so/whirlpools');
      const { fetchWhirlpool } = await import('@orca-so/whirlpools-client');

      vi.mocked(fetchPositionsForOwner).mockResolvedValue([
        {
          address: MOCK_POSITION,
          isPositionBundle: false,
          data: {
            whirlpool: MOCK_WHIRLPOOL,
            tickLowerIndex: -18304,
            tickUpperIndex: -17956,
          },
        },
      ] as any);

      vi.mocked(fetchWhirlpool).mockResolvedValue({
        data: { tickCurrentIndex: -18130 },
      } as any);

      const adapter = new OrcaPositionReadAdapter(mockRpcUrl);
      const positions = await adapter.listSupportedPositions(MOCK_WALLET);

      expect(positions[0]!.rangeState.kind).toBe('in-range');
    });

    it('computes below-range when current tick is below lower bound', async () => {
      const { fetchPositionsForOwner } = await import('@orca-so/whirlpools');
      const { fetchWhirlpool } = await import('@orca-so/whirlpools-client');

      vi.mocked(fetchPositionsForOwner).mockResolvedValue([
        {
          address: MOCK_POSITION,
          isPositionBundle: false,
          data: {
            whirlpool: MOCK_WHIRLPOOL,
            tickLowerIndex: -10000,
            tickUpperIndex: -5000,
          },
        },
      ] as any);

      vi.mocked(fetchWhirlpool).mockResolvedValue({
        data: { tickCurrentIndex: -20000 },
      } as any);

      const adapter = new OrcaPositionReadAdapter(mockRpcUrl);
      const positions = await adapter.listSupportedPositions(MOCK_WALLET);

      expect(positions[0]!.rangeState.kind).toBe('below-range');
    });

    it('computes above-range when current tick is above upper bound', async () => {
      const { fetchPositionsForOwner } = await import('@orca-so/whirlpools');
      const { fetchWhirlpool } = await import('@orca-so/whirlpools-client');

      vi.mocked(fetchPositionsForOwner).mockResolvedValue([
        {
          address: MOCK_POSITION,
          isPositionBundle: false,
          data: {
            whirlpool: MOCK_WHIRLPOOL,
            tickLowerIndex: -10000,
            tickUpperIndex: -5000,
          },
        },
      ] as any);

      vi.mocked(fetchWhirlpool).mockResolvedValue({
        data: { tickCurrentIndex: 0 },
      } as any);

      const adapter = new OrcaPositionReadAdapter(mockRpcUrl);
      const positions = await adapter.listSupportedPositions(MOCK_WALLET);

      expect(positions[0]!.rangeState.kind).toBe('above-range');
    });

    it('skips position bundles', async () => {
      const { fetchPositionsForOwner } = await import('@orca-so/whirlpools');
      const { fetchWhirlpool } = await import('@orca-so/whirlpools-client');

      const bundlePosition = 'Bundle123456789012345678901234567890' as PositionId;
      const normalPosition = 'Position45678901234567890123456789012' as PositionId;

      vi.mocked(fetchPositionsForOwner).mockResolvedValue([
        {
          address: bundlePosition,
          isPositionBundle: true,
          data: {},
        },
        {
          address: normalPosition,
          isPositionBundle: false,
          data: {
            whirlpool: MOCK_WHIRLPOOL,
            tickLowerIndex: -10000,
            tickUpperIndex: -5000,
          },
        },
      ] as any);

      vi.mocked(fetchWhirlpool).mockResolvedValue({
        data: { tickCurrentIndex: -7500 },
      } as any);

      const adapter = new OrcaPositionReadAdapter(mockRpcUrl);
      const positions = await adapter.listSupportedPositions(MOCK_WALLET);

      expect(positions.length).toBe(1);
      expect(positions[0]!.positionId).toBe(normalPosition);
    });
  });

  describe('getPosition', () => {
    it('returns null when position not found', async () => {
      const { fetchPositionsForOwner } = await import('@orca-so/whirlpools');

      vi.mocked(fetchPositionsForOwner).mockResolvedValue([]);

      const adapter = new OrcaPositionReadAdapter(mockRpcUrl);
      const result = await adapter.getPosition(makePositionId('NonExistent12345678901234567890'));

      expect(result).toBeNull();
    });
  });
});

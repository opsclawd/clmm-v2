/**
 * OrcaPositionReadAdapter TDD tests
 */
import { describe, it, expect, vi } from 'vitest';
import { OrcaPositionReadAdapter } from './OrcaPositionReadAdapter';
import { makePositionId } from '@clmm/domain';
import type { WalletId } from '@clmm/domain';

// Mock the Orca SDK functions
vi.mock('@orca-so/whirlpools', () => ({
  fetchPositionsForOwner: vi.fn(),
}));

vi.mock('@orca-so/whirlpools-client', () => ({
  fetchWhirlpool: vi.fn(),
  fetchPosition: vi.fn(),
}));

// Valid base58 Solana addresses (32 bytes = 44 base58 chars)
const MOCK_WALLET = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T' as WalletId;
const MOCK_POSITION_MINT = '2Wgh4mq6rp1q6H1G6K3ZsR3LBdqT5qVJb5KfF3U7Y2hX';
const MOCK_WHIRLPOOL = '7qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJnm';

describe('OrcaPositionReadAdapter', () => {
  const mockRpcUrl = 'https://api.mainnet-beta.solana.com';

  describe('listSupportedPositions', () => {
    it('returns array of LiquidityPosition for wallet', async () => {
      const { fetchPositionsForOwner } = await import('@orca-so/whirlpools');
      const { fetchWhirlpool } = await import('@orca-so/whirlpools-client');

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
        // boundary: Orca SDK Position type has many fields; test uses minimal shape
      ] as unknown as Awaited<ReturnType<typeof fetchPositionsForOwner>>);

      vi.mocked(fetchWhirlpool).mockResolvedValue({
        data: {
          tickCurrentIndex: -18130,
          sqrtPrice: 79228162514264337593543950336n,
        },
        // boundary: Orca SDK Whirlpool type has many fields; test uses minimal shape
      } as unknown as Awaited<ReturnType<typeof fetchWhirlpool>>);

      const adapter = new OrcaPositionReadAdapter(mockRpcUrl);
      const positions = await adapter.listSupportedPositions(MOCK_WALLET);

      expect(Array.isArray(positions)).toBe(true);
      expect(positions.length).toBe(1);
      expect(positions[0]!.positionId).toBe(MOCK_POSITION_MINT);
    });

    it('computes correct rangeState when price is in range', async () => {
      const { fetchPositionsForOwner } = await import('@orca-so/whirlpools');
      const { fetchWhirlpool } = await import('@orca-so/whirlpools-client');

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
        // boundary: Orca SDK Position type has many fields; test uses minimal shape
      ] as unknown as Awaited<ReturnType<typeof fetchPositionsForOwner>>);

      vi.mocked(fetchWhirlpool).mockResolvedValue({
        data: {
          tickCurrentIndex: -18130,
          sqrtPrice: 79228162514264337593543950336n,
        },
        // boundary: Orca SDK Whirlpool type has many fields; test uses minimal shape
      } as unknown as Awaited<ReturnType<typeof fetchWhirlpool>>);

      const adapter = new OrcaPositionReadAdapter(mockRpcUrl);
      const positions = await adapter.listSupportedPositions(MOCK_WALLET);

      expect(positions[0]!.rangeState.kind).toBe('in-range');
    });

    it('computes below-range when current tick is below lower bound', async () => {
      const { fetchPositionsForOwner } = await import('@orca-so/whirlpools');
      const { fetchWhirlpool } = await import('@orca-so/whirlpools-client');

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
        // boundary: Orca SDK Position type has many fields; test uses minimal shape
      ] as unknown as Awaited<ReturnType<typeof fetchPositionsForOwner>>);

      vi.mocked(fetchWhirlpool).mockResolvedValue({
        data: {
          tickCurrentIndex: -20000,
          sqrtPrice: 79228162514264337593543950336n,
        },
        // boundary: Orca SDK Whirlpool type has many fields; test uses minimal shape
      } as unknown as Awaited<ReturnType<typeof fetchWhirlpool>>);

      const adapter = new OrcaPositionReadAdapter(mockRpcUrl);
      const positions = await adapter.listSupportedPositions(MOCK_WALLET);

      expect(positions[0]!.rangeState.kind).toBe('below-range');
    });

    it('computes above-range when current tick is above upper bound', async () => {
      const { fetchPositionsForOwner } = await import('@orca-so/whirlpools');
      const { fetchWhirlpool } = await import('@orca-so/whirlpools-client');

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
        // boundary: Orca SDK Position type has many fields; test uses minimal shape
      ] as unknown as Awaited<ReturnType<typeof fetchPositionsForOwner>>);

      vi.mocked(fetchWhirlpool).mockResolvedValue({
        data: {
          tickCurrentIndex: 0,
          sqrtPrice: 79228162514264337593543950336n,
        },
        // boundary: Orca SDK Whirlpool type has many fields; test uses minimal shape
      } as unknown as Awaited<ReturnType<typeof fetchWhirlpool>>);

      const adapter = new OrcaPositionReadAdapter(mockRpcUrl);
      const positions = await adapter.listSupportedPositions(MOCK_WALLET);

      expect(positions[0]!.rangeState.kind).toBe('above-range');
    });

    it('skips position bundles', async () => {
      const { fetchPositionsForOwner } = await import('@orca-so/whirlpools');
      const { fetchWhirlpool } = await import('@orca-so/whirlpools-client');

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
        // boundary: Orca SDK Position type has many fields; test uses minimal shape
      ] as unknown as Awaited<ReturnType<typeof fetchPositionsForOwner>>);

      vi.mocked(fetchWhirlpool).mockResolvedValue({
        data: {
          tickCurrentIndex: -7500,
          sqrtPrice: 79228162514264337593543950336n,
        },
        // boundary: Orca SDK Whirlpool type has many fields; test uses minimal shape
      } as unknown as Awaited<ReturnType<typeof fetchWhirlpool>>);

      const adapter = new OrcaPositionReadAdapter(mockRpcUrl);
      const positions = await adapter.listSupportedPositions(MOCK_WALLET);

      expect(positions.length).toBe(1);
    });
  });

  describe('getPosition', () => {
    it('returns null when position not found', async () => {
      const client = await import('@orca-so/whirlpools-client');

      vi.mocked(client.fetchPosition).mockRejectedValue(new Error('not found'));

      const adapter = new OrcaPositionReadAdapter(mockRpcUrl);
      const result = await adapter.getPosition(makePositionId('7qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJnm'));

      expect(result).toBeNull();
    });
  });
});

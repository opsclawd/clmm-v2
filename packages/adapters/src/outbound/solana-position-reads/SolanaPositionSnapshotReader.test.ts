/**
 * SolanaPositionSnapshotReader TDD tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SolanaPositionSnapshotReader } from './SolanaPositionSnapshotReader';
import type { WalletId, PositionId } from '@clmm/domain';
import { address, createSolanaRpc } from '@solana/kit';

vi.mock('@orca-so/whirlpools-client', () => ({
  getPositionAddress: vi.fn(),
  fetchPosition: vi.fn(),
  fetchWhirlpool: vi.fn(),
}));

const MOCK_WALLET = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T' as WalletId;
const MOCK_POSITION_MINT = '2Wgh4mq6rp1q6H1G6K3ZsR3LBdqT5qVJb5KfF3U7Y2hX' as PositionId;
const MOCK_WHIRLPOOL = '7qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJnm';
const MOCK_POSITION_PDA = '5Xh2nBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4U';

describe('SolanaPositionSnapshotReader', () => {
  const mockRpcUrl = 'https://api.mainnet-beta.solana.com';
  let mockRpcWithOwnership: { getTokenAccountsByOwner: () => { send: () => Promise<{ value: Array<unknown> }> } };
  let mockRpcWithoutOwnership: { getTokenAccountsByOwner: () => { send: () => Promise<{ value: Array<unknown> }> } };

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockRpcWithOwnership = {
      getTokenAccountsByOwner: () => ({
        send: () => Promise.resolve({ value: [{ account: { data: { parsed: { info: { tokenAmount: { amount: '1' } } } } } }] }),
      }),
    } as unknown as typeof mockRpcWithOwnership;

    mockRpcWithoutOwnership = {
      getTokenAccountsByOwner: () => ({
        send: () => Promise.resolve({ value: [] }),
      }),
    } as unknown as typeof mockRpcWithoutOwnership;
  });

  describe('fetchSinglePosition', () => {
    it('returns LiquidityPosition when position exists and is owned by wallet', async () => {
      const { getPositionAddress, fetchPosition, fetchWhirlpool } = await import('@orca-so/whirlpools-client');

      vi.mocked(getPositionAddress).mockResolvedValue([address(MOCK_POSITION_PDA)] as unknown as Awaited<ReturnType<typeof getPositionAddress>>);
      vi.mocked(fetchPosition).mockResolvedValue({
        data: {
          whirlpool: address(MOCK_WHIRLPOOL),
          tickLowerIndex: -18304,
          tickUpperIndex: -17956,
          positionMint: address(MOCK_POSITION_MINT),
        },
      } as unknown as Awaited<ReturnType<typeof fetchPosition>>);

      vi.mocked(fetchWhirlpool).mockResolvedValue({
        data: {
          tickCurrentIndex: -18130,
          sqrtPrice: 79228162514264337593543950336n,
        },
      } as unknown as Awaited<ReturnType<typeof fetchWhirlpool>>);

      const reader = new SolanaPositionSnapshotReader(mockRpcUrl);
      const result = await reader.fetchSinglePosition(mockRpcWithOwnership as never, MOCK_POSITION_MINT, MOCK_WALLET);

      expect(result).not.toBeNull();
      expect(result!.positionId).toBe(MOCK_POSITION_MINT);
      expect(result!.walletId).toBe(MOCK_WALLET);
      expect(result!.bounds.lowerBound).toBe(-18304);
      expect(result!.bounds.upperBound).toBe(-17956);
      expect(result!.rangeState.kind).toBe('in-range');
      expect(result!.monitoringReadiness.kind).toBe('active');
    });

    it('returns null when position is not owned by wallet', async () => {
      const { getPositionAddress, fetchPosition } = await import('@orca-so/whirlpools-client');

      vi.mocked(getPositionAddress).mockResolvedValue([address(MOCK_POSITION_PDA)] as unknown as Awaited<ReturnType<typeof getPositionAddress>>);
      vi.mocked(fetchPosition).mockResolvedValue({
        data: {
          whirlpool: address(MOCK_WHIRLPOOL),
          tickLowerIndex: -18304,
          tickUpperIndex: -17956,
          positionMint: address(MOCK_POSITION_MINT),
        },
      } as unknown as Awaited<ReturnType<typeof fetchPosition>>);

      const reader = new SolanaPositionSnapshotReader(mockRpcUrl);
      const result = await reader.fetchSinglePosition(mockRpcWithoutOwnership as never, MOCK_POSITION_MINT, MOCK_WALLET);

      expect(result).toBeNull();
    });

    it('returns null when fetchPosition throws', async () => {
      const { getPositionAddress, fetchPosition } = await import('@orca-so/whirlpools-client');

      vi.mocked(getPositionAddress).mockResolvedValue([address(MOCK_POSITION_PDA)] as unknown as Awaited<ReturnType<typeof getPositionAddress>>);
      vi.mocked(fetchPosition).mockRejectedValue(new Error('Failed to fetch position'));

      const reader = new SolanaPositionSnapshotReader(mockRpcUrl);
      const result = await reader.fetchSinglePosition(mockRpcWithOwnership as never, MOCK_POSITION_MINT, MOCK_WALLET);

      expect(result).toBeNull();
    });

    it('returns null when fetchWhirlpool throws', async () => {
      const { getPositionAddress, fetchPosition, fetchWhirlpool } = await import('@orca-so/whirlpools-client');

      vi.mocked(getPositionAddress).mockResolvedValue([address(MOCK_POSITION_PDA)] as unknown as Awaited<ReturnType<typeof getPositionAddress>>);
      vi.mocked(fetchPosition).mockResolvedValue({
        data: {
          whirlpool: address(MOCK_WHIRLPOOL),
          tickLowerIndex: -18304,
          tickUpperIndex: -17956,
          positionMint: address(MOCK_POSITION_MINT),
        },
      } as unknown as Awaited<ReturnType<typeof fetchPosition>>);
      vi.mocked(fetchWhirlpool).mockRejectedValue(new Error('Failed to fetch whirlpool'));

      const reader = new SolanaPositionSnapshotReader(mockRpcUrl);
      const result = await reader.fetchSinglePosition(mockRpcWithOwnership as never, MOCK_POSITION_MINT, MOCK_WALLET);

      expect(result).toBeNull();
    });

    it('computes below-range rangeState when current tick is below lower bound', async () => {
      const { getPositionAddress, fetchPosition, fetchWhirlpool } = await import('@orca-so/whirlpools-client');

      vi.mocked(getPositionAddress).mockResolvedValue([address(MOCK_POSITION_PDA)] as unknown as Awaited<ReturnType<typeof getPositionAddress>>);
      vi.mocked(fetchPosition).mockResolvedValue({
        data: {
          whirlpool: address(MOCK_WHIRLPOOL),
          tickLowerIndex: -10000,
          tickUpperIndex: -5000,
          positionMint: address(MOCK_POSITION_MINT),
        },
      } as unknown as Awaited<ReturnType<typeof fetchPosition>>);

      vi.mocked(fetchWhirlpool).mockResolvedValue({
        data: {
          tickCurrentIndex: -20000,
          sqrtPrice: 79228162514264337593543950336n,
        },
      } as unknown as Awaited<ReturnType<typeof fetchWhirlpool>>);

      const reader = new SolanaPositionSnapshotReader(mockRpcUrl);
      const result = await reader.fetchSinglePosition(mockRpcWithOwnership as never, MOCK_POSITION_MINT, MOCK_WALLET);

      expect(result).not.toBeNull();
      expect(result!.rangeState.kind).toBe('below-range');
    });

    it('computes above-range rangeState when current tick is above upper bound', async () => {
      const { getPositionAddress, fetchPosition, fetchWhirlpool } = await import('@orca-so/whirlpools-client');

      vi.mocked(getPositionAddress).mockResolvedValue([address(MOCK_POSITION_PDA)] as unknown as Awaited<ReturnType<typeof getPositionAddress>>);
      vi.mocked(fetchPosition).mockResolvedValue({
        data: {
          whirlpool: address(MOCK_WHIRLPOOL),
          tickLowerIndex: -10000,
          tickUpperIndex: -5000,
          positionMint: address(MOCK_POSITION_MINT),
        },
      } as unknown as Awaited<ReturnType<typeof fetchPosition>>);

      vi.mocked(fetchWhirlpool).mockResolvedValue({
        data: {
          tickCurrentIndex: 0,
          sqrtPrice: 79228162514264337593543950336n,
        },
      } as unknown as Awaited<ReturnType<typeof fetchWhirlpool>>);

      const reader = new SolanaPositionSnapshotReader(mockRpcUrl);
      const result = await reader.fetchSinglePosition(mockRpcWithOwnership as never, MOCK_POSITION_MINT, MOCK_WALLET);

      expect(result).not.toBeNull();
      expect(result!.rangeState.kind).toBe('above-range');
    });
  });

  describe('verifyOwnership', () => {
    it('returns true when wallet owns the position mint', async () => {
      const reader = new SolanaPositionSnapshotReader(mockRpcUrl);
      const result = await reader.verifyOwnership(mockRpcWithOwnership as never, MOCK_WALLET, MOCK_POSITION_MINT);

      expect(result).toBe(true);
    });

    it('returns false when wallet does not own the position mint', async () => {
      const nonOwnerWallet = '9w7A9sXjC8eGdxzpcM8f7mPy8tLQGvY1z9WnK3m2LcQa' as WalletId;
      const reader = new SolanaPositionSnapshotReader(mockRpcUrl);
      const result = await reader.verifyOwnership(mockRpcWithoutOwnership as never, nonOwnerWallet, MOCK_POSITION_MINT);

      expect(result).toBe(false);
    });
  });

  describe('fetchWhirlpoolsBatched', () => {
    it('deduplicates whirlpool addresses and fetches each once', async () => {
      const { fetchWhirlpool } = await import('@orca-so/whirlpools-client');
      const mockRpc = {} as ReturnType<typeof createSolanaRpc>;

      const addresses = [
        '7qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJnm',
        '7qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJnm',
        '8qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJno',
        '8qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJno',
        '9qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJnp',
      ];

      vi.mocked(fetchWhirlpool).mockResolvedValue({
        data: {
          tickCurrentIndex: -18130,
          sqrtPrice: 184467440737095516n,
          tokenMintA: { toString: () => 'So11111111111111111111111111111111111111112' },
          tokenMintB: { toString: () => 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
          feeRate: 1000,
          tickSpacing: 64,
          liquidity: 2400000000n,
        },
      } as unknown as Awaited<ReturnType<typeof fetchWhirlpool>>);

      const reader = new SolanaPositionSnapshotReader(mockRpcUrl);
      const result = await reader.fetchWhirlpoolsBatched(mockRpc, addresses);

      expect(result.size).toBe(3);
      expect(fetchWhirlpool).toHaveBeenCalledTimes(3);
    });

    it('omits whirlpools that fail to fetch', async () => {
      const { fetchWhirlpool } = await import('@orca-so/whirlpools-client');
      const mockRpc = {} as ReturnType<typeof createSolanaRpc>;

      const pool1 = '7qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJnm';
      const pool2 = '8qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJno';

      vi.mocked(fetchWhirlpool).mockImplementation(async (_rpc: unknown, addr: { toString: () => string }) => {
        if (addr.toString() === pool2) {
          throw new Error('Failed to fetch');
        }
        return { data: {
          tickCurrentIndex: -18130,
          sqrtPrice: 184467440737095516n,
          tokenMintA: { toString: () => 'So11111111111111111111111111111111111111112' },
          tokenMintB: { toString: () => 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
          feeRate: 1000,
          tickSpacing: 64,
          liquidity: 2400000000n,
        } } as unknown as Awaited<ReturnType<typeof fetchWhirlpool>>;
      });

      const reader = new SolanaPositionSnapshotReader(mockRpcUrl);
      const result = await reader.fetchWhirlpoolsBatched(mockRpc, [pool1, pool2]);

      expect(result.has(pool1)).toBe(true);
      expect(result.has(pool2)).toBe(false);
    });

    it('returns empty map for empty input', async () => {
      const mockRpc = {} as ReturnType<typeof createSolanaRpc>;

      const reader = new SolanaPositionSnapshotReader(mockRpcUrl);
      const result = await reader.fetchWhirlpoolsBatched(mockRpc, []);

      expect(result.size).toBe(0);
    });

    it('limits concurrent whirlpool fetches while still returning all successful results', async () => {
      const { fetchWhirlpool } = await import('@orca-so/whirlpools-client');
      const reader = new SolanaPositionSnapshotReader('https://api.mainnet-beta.solana.com');
      const rpc = {} as ReturnType<typeof createSolanaRpc>;

      let inFlight = 0;
      let maxInFlight = 0;

      vi.mocked(fetchWhirlpool).mockImplementation(async (_rpc: unknown, addr: { toString: () => string }) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);

        await new Promise((resolve) => setTimeout(resolve, 5));

        inFlight -= 1;
        return {
          data: {
            tickCurrentIndex: Number(addr.toString().slice(-1)),
            sqrtPrice: 184467440737095516n,
            tokenMintA: { toString: () => 'So11111111111111111111111111111111111111112' },
            tokenMintB: { toString: () => 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
            feeRate: 1000,
            tickSpacing: 64,
            liquidity: 2400000000n,
          },
        } as never;
      });

      const result = await reader.fetchWhirlpoolsBatched(rpc, [
        '7qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJnm',
        '8qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJno',
        '9qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJnp',
        'AqbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJnq',
        'BqbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJnr',
      ]);

      expect(result.size).toBe(5);
      expect(maxInFlight).toBeLessThanOrEqual(2);
    });
  });
});

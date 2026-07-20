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
  let mockRpcWithOwnership: {
    getTokenAccountsByOwner: () => { send: () => Promise<{ value: Array<unknown> }> };
  };
  let mockRpcWithoutOwnership: {
    getTokenAccountsByOwner: () => { send: () => Promise<{ value: Array<unknown> }> };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockRpcWithOwnership = {
      getTokenAccountsByOwner: () => ({
        send: () =>
          Promise.resolve({
            value: [{ account: { data: { parsed: { info: { tokenAmount: { amount: '1' } } } } } }],
          }),
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
      const { getPositionAddress, fetchPosition, fetchWhirlpool } =
        await import('@orca-so/whirlpools-client');

      vi.mocked(getPositionAddress).mockResolvedValue([
        address(MOCK_POSITION_PDA),
      ] as unknown as Awaited<ReturnType<typeof getPositionAddress>>);
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
      const result = await reader.fetchSinglePosition(
        mockRpcWithOwnership as never,
        MOCK_POSITION_MINT,
        MOCK_WALLET,
      );

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

      vi.mocked(getPositionAddress).mockResolvedValue([
        address(MOCK_POSITION_PDA),
      ] as unknown as Awaited<ReturnType<typeof getPositionAddress>>);
      vi.mocked(fetchPosition).mockResolvedValue({
        data: {
          whirlpool: address(MOCK_WHIRLPOOL),
          tickLowerIndex: -18304,
          tickUpperIndex: -17956,
          positionMint: address(MOCK_POSITION_MINT),
        },
      } as unknown as Awaited<ReturnType<typeof fetchPosition>>);

      const reader = new SolanaPositionSnapshotReader(mockRpcUrl);
      const result = await reader.fetchSinglePosition(
        mockRpcWithoutOwnership as never,
        MOCK_POSITION_MINT,
        MOCK_WALLET,
      );

      expect(result).toBeNull();
    });

    it('returns null when fetchPosition throws', async () => {
      const { getPositionAddress, fetchPosition } = await import('@orca-so/whirlpools-client');

      vi.mocked(getPositionAddress).mockResolvedValue([
        address(MOCK_POSITION_PDA),
      ] as unknown as Awaited<ReturnType<typeof getPositionAddress>>);
      vi.mocked(fetchPosition).mockRejectedValue(new Error('Failed to fetch position'));

      const reader = new SolanaPositionSnapshotReader(mockRpcUrl);
      const result = await reader.fetchSinglePosition(
        mockRpcWithOwnership as never,
        MOCK_POSITION_MINT,
        MOCK_WALLET,
      );

      expect(result).toBeNull();
    });

    it('returns null when fetchWhirlpool throws', async () => {
      const { getPositionAddress, fetchPosition, fetchWhirlpool } =
        await import('@orca-so/whirlpools-client');

      vi.mocked(getPositionAddress).mockResolvedValue([
        address(MOCK_POSITION_PDA),
      ] as unknown as Awaited<ReturnType<typeof getPositionAddress>>);
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
      const result = await reader.fetchSinglePosition(
        mockRpcWithOwnership as never,
        MOCK_POSITION_MINT,
        MOCK_WALLET,
      );

      expect(result).toBeNull();
    });

    it('computes below-range rangeState when current tick is below lower bound', async () => {
      const { getPositionAddress, fetchPosition, fetchWhirlpool } =
        await import('@orca-so/whirlpools-client');

      vi.mocked(getPositionAddress).mockResolvedValue([
        address(MOCK_POSITION_PDA),
      ] as unknown as Awaited<ReturnType<typeof getPositionAddress>>);
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
      const result = await reader.fetchSinglePosition(
        mockRpcWithOwnership as never,
        MOCK_POSITION_MINT,
        MOCK_WALLET,
      );

      expect(result).not.toBeNull();
      expect(result!.rangeState.kind).toBe('below-range');
    });

    it('computes above-range rangeState when current tick is above upper bound', async () => {
      const { getPositionAddress, fetchPosition, fetchWhirlpool } =
        await import('@orca-so/whirlpools-client');

      vi.mocked(getPositionAddress).mockResolvedValue([
        address(MOCK_POSITION_PDA),
      ] as unknown as Awaited<ReturnType<typeof getPositionAddress>>);
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
      const result = await reader.fetchSinglePosition(
        mockRpcWithOwnership as never,
        MOCK_POSITION_MINT,
        MOCK_WALLET,
      );

      expect(result).not.toBeNull();
      expect(result!.rangeState.kind).toBe('above-range');
    });
  });

  describe('verifyOwnership', () => {
    it('returns true when wallet owns the position mint', async () => {
      const reader = new SolanaPositionSnapshotReader(mockRpcUrl);
      const result = await reader.verifyOwnership(
        mockRpcWithOwnership as never,
        MOCK_WALLET,
        MOCK_POSITION_MINT,
      );

      expect(result).toBe(true);
    });

    it('returns false when wallet does not own the position mint', async () => {
      const nonOwnerWallet = '9w7A9sXjC8eGdxzpcM8f7mPy8tLQGvY1z9WnK3m2LcQa' as WalletId;
      const reader = new SolanaPositionSnapshotReader(mockRpcUrl);
      const result = await reader.verifyOwnership(
        mockRpcWithoutOwnership as never,
        nonOwnerWallet,
        MOCK_POSITION_MINT,
      );

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

      vi.mocked(fetchWhirlpool).mockImplementation(
        async (_rpc: unknown, addr: { toString: () => string }) => {
          if (addr.toString() === pool2) {
            throw new Error('Failed to fetch');
          }
          return {
            data: {
              tickCurrentIndex: -18130,
              sqrtPrice: 184467440737095516n,
              tokenMintA: { toString: () => 'So11111111111111111111111111111111111111112' },
              tokenMintB: { toString: () => 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
              feeRate: 1000,
              tickSpacing: 64,
              liquidity: 2400000000n,
            },
          } as unknown as Awaited<ReturnType<typeof fetchWhirlpool>>;
        },
      );

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

      vi.mocked(fetchWhirlpool).mockImplementation(
        async (_rpc: unknown, addr: { toString: () => string }) => {
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
        },
      );

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

  describe('fetchPositionDetail', () => {
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

    function setupHappyMocks() {
      return import('@orca-so/whirlpools-client').then(
        ({ getPositionAddress, fetchPosition, fetchWhirlpool }) => {
          vi.mocked(getPositionAddress).mockResolvedValue([
            address(MOCK_POSITION_PDA),
          ] as unknown as Awaited<ReturnType<typeof getPositionAddress>>);
          vi.mocked(fetchPosition).mockResolvedValue({
            data: {
              whirlpool: address(MOCK_WHIRLPOOL),
              tickLowerIndex: -18304,
              tickUpperIndex: -17956,
              liquidity: 1000n,
              feeGrowthCheckpointA: 0n,
              feeGrowthCheckpointB: 0n,
              feeOwedA: 9999n,
              feeOwedB: 8888n,
              positionMint: address(MOCK_POSITION_MINT),
              rewardInfos: [
                { amountOwed: 7777n, growthInsideCheckpoint: 0n },
                { amountOwed: 0n, growthInsideCheckpoint: 0n },
                { amountOwed: 0n, growthInsideCheckpoint: 0n },
              ],
            },
          } as unknown as Awaited<ReturnType<typeof fetchPosition>>);
          vi.mocked(fetchWhirlpool).mockResolvedValue({
            data: {
              tickCurrentIndex: -18130,
              sqrtPrice: 184467440737095516n,
              tokenMintA: { toString: () => SOL_MINT },
              tokenMintB: { toString: () => USDC_MINT },
              feeRate: 1000,
              tickSpacing: 64,
              liquidity: 2400000000n,
              rewardInfos: [
                { mint: { toString: () => SOL_MINT } },
                { mint: { toString: () => '11111111111111111111111111111111' } },
                { mint: { toString: () => '11111111111111111111111111111111' } },
              ],
            },
          } as unknown as Awaited<ReturnType<typeof fetchWhirlpool>>);
        },
      );
    }

    it('returns detail with live fees from helper when quote succeeds', async () => {
      await setupHappyMocks();

      const helper = {
        quote: vi.fn().mockResolvedValue({
          kind: 'ok',
          fees: {
            feeOwedA: 12345n,
            feeOwedB: 67890n,
            rewardInfos: [{ mint: SOL_MINT, amountOwed: 11111n, decimals: 9 }],
          },
        }),
      };
      const reader = new SolanaPositionSnapshotReader(mockRpcUrl, undefined, helper as never);
      const result = await reader.fetchPositionDetail(
        mockRpcWithOwnership as never,
        MOCK_POSITION_MINT,
        MOCK_WALLET,
      );

      expect(result).not.toBeNull();
      expect(result!.fees.feeOwedA).toBe(12345n);
      expect(result!.fees.feeOwedB).toBe(67890n);
      expect(helper.quote).toHaveBeenCalledTimes(1);
    });

    it('returns null and logs orca_position_fee_reward_quote_unavailable warn when helper returns unavailable', async () => {
      await setupHappyMocks();

      const helper = {
        quote: vi.fn().mockResolvedValue({
          kind: 'unavailable',
          reason: 'fee-quote-failed',
          errorName: 'Error',
          errorMessage: 'wasm overflow',
        }),
      };
      const observability = {
        log: vi.fn(),
        recordTiming: vi.fn(),
        recordDetectionTiming: vi.fn(),
        recordDeliveryTiming: vi.fn(),
      };
      const reader = new SolanaPositionSnapshotReader(
        mockRpcUrl,
        observability as never,
        helper as never,
      );
      const result = await reader.fetchPositionDetail(
        mockRpcWithOwnership as never,
        MOCK_POSITION_MINT,
        MOCK_WALLET,
      );

      expect(result).toBeNull();
      expect(observability.log).toHaveBeenCalledTimes(1);
      expect(observability.log).toHaveBeenCalledWith(
        'warn',
        'orca_position_fee_reward_quote_unavailable',
        expect.objectContaining({
          positionId: MOCK_POSITION_MINT,
          walletId: MOCK_WALLET,
          poolId: MOCK_WHIRLPOOL,
          lowerTick: -18304,
          upperTick: -17956,
          tickSpacing: 64,
          reason: 'fee-quote-failed',
          errorName: 'Error',
          errorMessage: 'wasm overflow',
        }),
      );
    });

    it('does not fall back to checkpointed pos.feeOwedA / pos.feeOwedB / pos.rewardInfos[].amountOwed on quote failure', async () => {
      await setupHappyMocks();

      const helper = {
        quote: vi.fn().mockResolvedValue({
          kind: 'unavailable',
          reason: 'tick-array-fetch-failed',
        }),
      };
      const observability = {
        log: vi.fn(),
        recordTiming: vi.fn(),
        recordDetectionTiming: vi.fn(),
        recordDeliveryTiming: vi.fn(),
      };
      const reader = new SolanaPositionSnapshotReader(
        mockRpcUrl,
        observability as never,
        helper as never,
      );
      const result = await reader.fetchPositionDetail(
        mockRpcWithOwnership as never,
        MOCK_POSITION_MINT,
        MOCK_WALLET,
      );

      expect(result).toBeNull();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      const replacer = (_k: string, v: unknown): unknown =>
        typeof v === 'bigint' ? v.toString() : v;
      const stringified = JSON.stringify(observability.log.mock.calls, replacer);
      expect(stringified).not.toContain('9999');
      expect(stringified).not.toContain('8888');
      expect(stringified).not.toContain('7777');
    });

    it('returns principal amounts and their completion time with a successful detail', async () => {
      await setupHappyMocks();

      const feeRewardHelper = {
        quote: vi.fn().mockResolvedValue({
          kind: 'ok',
          fees: {
            feeOwedA: 12345n,
            feeOwedB: 67890n,
            rewardInfos: [{ mint: SOL_MINT, amountOwed: 11111n, decimals: 9 }],
          },
        }),
      };
      const principalHelper = {
        quote: vi.fn().mockReturnValue({
          kind: 'ok',
          amountA: 250_000_000n,
          amountB: 12_500_000n,
        }),
      };
      // Use 4-arg constructor to pass principal helper
      const reader = new SolanaPositionSnapshotReader(
        mockRpcUrl,
        undefined,
        feeRewardHelper as never,
        principalHelper as never,
      );
      const result = await reader.fetchPositionDetail(
        mockRpcWithOwnership as never,
        MOCK_POSITION_MINT,
        MOCK_WALLET,
      );

      expect(result).not.toBeNull();
      expect(result!.principalTokenAmounts).not.toBeNull();
      expect(result!.principalTokenAmounts!.amountA).toBe(250_000_000n);
      expect(result!.principalTokenAmounts!.amountB).toBe(12_500_000n);
      expect(principalHelper.quote).toHaveBeenCalledTimes(1);
      expect(principalHelper.quote).toHaveBeenCalledWith({
        liquidity: 1000n,
        sqrtPrice: 184467440737095516n,
        tickLowerIndex: -18304,
        tickUpperIndex: -17956,
      });
    });

    it('preserves zero amounts from a successful principal quote', async () => {
      await setupHappyMocks();
      vi.setSystemTime(1_700_000_000_123);

      const feeRewardHelper = {
        quote: vi.fn().mockResolvedValue({
          kind: 'ok',
          fees: {
            feeOwedA: 0n,
            feeOwedB: 0n,
            rewardInfos: [],
          },
        }),
      };
      const principalHelper = {
        quote: vi.fn().mockReturnValue({
          kind: 'ok',
          amountA: 0n,
          amountB: 0n,
        }),
      };
      const reader = new SolanaPositionSnapshotReader(
        mockRpcUrl,
        undefined,
        feeRewardHelper as never,
        principalHelper as never,
      );
      const result = await reader.fetchPositionDetail(
        mockRpcWithOwnership as never,
        MOCK_POSITION_MINT,
        MOCK_WALLET,
      );

      expect(result).not.toBeNull();
      expect(result!.principalTokenAmounts).not.toBeNull();
      expect(result!.principalTokenAmounts!.amountA).toBe(0n);
      expect(result!.principalTokenAmounts!.amountB).toBe(0n);
    });

    it('returns detail with null principal amounts and one warning when principal quoting is unavailable', async () => {
      await setupHappyMocks();

      const feeRewardHelper = {
        quote: vi.fn().mockResolvedValue({
          kind: 'ok',
          fees: {
            feeOwedA: 12345n,
            feeOwedB: 67890n,
            rewardInfos: [],
          },
        }),
      };
      const principalHelper = {
        quote: vi.fn().mockReturnValue({
          kind: 'unavailable',
          reason: 'principal-quote-failed',
        }),
      };
      const observability = {
        log: vi.fn(),
        recordTiming: vi.fn(),
        recordDetectionTiming: vi.fn(),
        recordDeliveryTiming: vi.fn(),
      };
      const reader = new SolanaPositionSnapshotReader(
        mockRpcUrl,
        observability as never,
        feeRewardHelper as never,
        principalHelper as never,
      );
      const result = await reader.fetchPositionDetail(
        mockRpcWithOwnership as never,
        MOCK_POSITION_MINT,
        MOCK_WALLET,
      );

      expect(result).not.toBeNull();
      expect(result!.principalTokenAmounts).toBeNull();
      expect(observability.log).toHaveBeenCalledTimes(1);
      expect(observability.log).toHaveBeenCalledWith(
        'warn',
        'orca_position_principal_quote_unavailable',
        expect.objectContaining({
          positionId: MOCK_POSITION_MINT,
          walletId: MOCK_WALLET,
          poolId: MOCK_WHIRLPOOL,
          lowerTick: -18304,
          upperTick: -17956,
          currentTick: -18130,
          reason: 'principal-quote-failed',
        }),
      );
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      const replacer = (_k: string, v: unknown): unknown =>
        typeof v === 'bigint' ? v.toString() : v;
      const stringified = JSON.stringify(observability.log.mock.calls, replacer);
      expect(stringified).not.toContain('1000n');
      expect(stringified).not.toContain('184467440737095516n');
    });

    it('keeps live fee reward failure as a null detail', async () => {
      await setupHappyMocks();

      const feeRewardHelper = {
        quote: vi.fn().mockResolvedValue({
          kind: 'unavailable',
          reason: 'fee-quote-failed',
        }),
      };
      const principalHelper = {
        quote: vi.fn().mockReturnValue({
          kind: 'ok',
          amountA: 250_000_000n,
          amountB: 12_500_000n,
        }),
      };
      const reader = new SolanaPositionSnapshotReader(
        mockRpcUrl,
        undefined,
        feeRewardHelper as never,
        principalHelper as never,
      );
      const result = await reader.fetchPositionDetail(
        mockRpcWithOwnership as never,
        MOCK_POSITION_MINT,
        MOCK_WALLET,
      );

      expect(result).toBeNull();
      expect(principalHelper.quote).not.toHaveBeenCalled();
    });
  });
});

/**
 * OrcaPositionFeeRewardQuoteHelper TDD tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrcaPositionFeeRewardQuoteHelper } from './OrcaPositionFeeRewardQuoteHelper';
import type { createSolanaRpc } from '@solana/kit';

vi.mock('@orca-so/whirlpools-client', () => ({
  getTickArrayAddress: vi.fn(),
  fetchAllTickArray: vi.fn(),
}));

vi.mock('@orca-so/whirlpools-core', () => ({
  getTickArrayStartTickIndex: vi.fn(),
  getTickIndexInArray: vi.fn(),
  collectFeesQuote: vi.fn(),
  collectRewardsQuote: vi.fn(),
}));

const MOCK_WHIRLPOOL = '7qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJnm';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

type MockRpc = ReturnType<typeof createSolanaRpc>;

function makePosition(
  overrides: Partial<{
    tickLowerIndex: number;
    tickUpperIndex: number;
    liquidity: bigint;
    feeOwedA: bigint;
    feeOwedB: bigint;
    rewardInfos: Array<{ amountOwed: bigint; growthInsideCheckpoint: bigint }>;
  }> = {},
) {
  return {
    whirlpool: MOCK_WHIRLPOOL,
    tickLowerIndex: -18304,
    tickUpperIndex: -17956,
    liquidity: 100000n,
    feeGrowthCheckpointA: 0n,
    feeGrowthCheckpointB: 0n,
    feeOwedA: 999n,
    feeOwedB: 888n,
    rewardInfos: [
      { amountOwed: 777n, growthInsideCheckpoint: 0n },
      { amountOwed: 0n, growthInsideCheckpoint: 0n },
      { amountOwed: 0n, growthInsideCheckpoint: 0n },
    ],
    ...overrides,
  };
}

function makeWhirlpool(
  overrides: Partial<{
    tickSpacing: number;
    rewardInfos: Array<{ mint: { toString: () => string } }>;
  }> = {},
) {
  return {
    tokenMintA: { toString: () => SOL_MINT },
    tokenMintB: { toString: () => USDC_MINT },
    tickSpacing: 64,
    feeRate: 1000,
    liquidity: 2400000000n,
    sqrtPrice: 184467440737095516n,
    tickCurrentIndex: -18130,
    feeGrowthGlobalA: 0n,
    feeGrowthGlobalB: 0n,
    rewardLastUpdatedTimestamp: 0n,
    rewardInfos: [
      { mint: { toString: () => SOL_MINT } },
      { mint: { toString: () => '11111111111111111111111111111111' } },
      { mint: { toString: () => '11111111111111111111111111111111' } },
    ],
    ...overrides,
  };
}

describe('OrcaPositionFeeRewardQuoteHelper', () => {
  let mockRpc: MockRpc;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc = {} as MockRpc;
  });

  describe('quote', () => {
    it('returns ok with PositionFees built from collectFeesQuote and collectRewardsQuote', async () => {
      const { getTickArrayAddress, fetchAllTickArray } = await import('@orca-so/whirlpools-client');
      const {
        getTickArrayStartTickIndex,
        getTickIndexInArray,
        collectFeesQuote,
        collectRewardsQuote,
      } = await import('@orca-so/whirlpools-core');

      vi.mocked(getTickArrayStartTickIndex).mockReturnValueOnce(-22528).mockReturnValueOnce(-22528);
      vi.mocked(getTickArrayAddress)
        .mockResolvedValueOnce(['LowerTickArrayAddr1' as never] as never)
        .mockResolvedValueOnce(['UpperTickArrayAddr1' as never] as never);
      vi.mocked(getTickIndexInArray).mockReturnValueOnce(5).mockReturnValueOnce(10);

      const lowerTick = { initialized: true, liquidityNet: 0n };
      const upperTick = { initialized: true, liquidityNet: 0n };
      vi.mocked(fetchAllTickArray).mockResolvedValue([
        {
          data: {
            ticks: Array.from({ length: 88 }, (_, i) =>
              i === 5 ? lowerTick : { initialized: false },
            ),
          },
        },
        {
          data: {
            ticks: Array.from({ length: 88 }, (_, i) =>
              i === 10 ? upperTick : { initialized: false },
            ),
          },
        },
      ] as never);

      vi.mocked(collectFeesQuote).mockReturnValue({ feeOwedA: 12345n, feeOwedB: 67890n } as never);
      vi.mocked(collectRewardsQuote).mockReturnValue({
        rewards: [{ rewardsOwed: 11111n }, { rewardsOwed: 0n }, { rewardsOwed: 0n }],
      } as never);

      const helper = new OrcaPositionFeeRewardQuoteHelper();
      const result = await helper.quote({
        rpc: mockRpc,
        position: makePosition(),
        whirlpool: makeWhirlpool(),
        whirlpoolAddress: MOCK_WHIRLPOOL,
      });

      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') throw new Error('expected ok');
      expect(result.fees.feeOwedA).toBe(12345n);
      expect(result.fees.feeOwedB).toBe(67890n);
      expect(result.fees.rewardInfos.length).toBe(3);
      expect(result.fees.rewardInfos[0]!.mint).toBe(SOL_MINT);
      expect(result.fees.rewardInfos[0]!.amountOwed).toBe(11111n);
      expect(result.fees.rewardInfos[0]!.decimals).toBe(9);
      expect(result.fees.rewardInfos[1]!.mint).toBe('11111111111111111111111111111111');
      expect(result.fees.rewardInfos[1]!.amountOwed).toBe(0n);
      expect(result.fees.rewardInfos[1]!.decimals).toBeNull();
    });

    it('returns unavailable with reason "tick-array-fetch-failed" when fetchAllTickArray throws', async () => {
      const { getTickArrayAddress, fetchAllTickArray } = await import('@orca-so/whirlpools-client');
      const { getTickArrayStartTickIndex } = await import('@orca-so/whirlpools-core');

      vi.mocked(getTickArrayStartTickIndex).mockReturnValueOnce(-22528).mockReturnValueOnce(-22528);
      vi.mocked(getTickArrayAddress)
        .mockResolvedValueOnce(['LowerTickArrayAddr1' as never] as never)
        .mockResolvedValueOnce(['UpperTickArrayAddr1' as never] as never);
      vi.mocked(fetchAllTickArray).mockRejectedValue(new Error('rpc 429'));

      const helper = new OrcaPositionFeeRewardQuoteHelper();
      const result = await helper.quote({
        rpc: mockRpc,
        position: makePosition(),
        whirlpool: makeWhirlpool(),
        whirlpoolAddress: MOCK_WHIRLPOOL,
      });

      expect(result.kind).toBe('unavailable');
      if (result.kind !== 'unavailable') throw new Error('expected unavailable');
      expect(result.reason).toBe('tick-array-fetch-failed');
      expect(result.errorName).toBe('Error');
      expect(result.errorMessage).toBe('rpc 429');
    });

    it('returns unavailable with reason "tick-data-missing" when ticks[idx] is undefined', async () => {
      const { getTickArrayAddress, fetchAllTickArray } = await import('@orca-so/whirlpools-client');
      const { getTickArrayStartTickIndex, getTickIndexInArray } =
        await import('@orca-so/whirlpools-core');

      vi.mocked(getTickArrayStartTickIndex).mockReturnValueOnce(-22528).mockReturnValueOnce(-22528);
      vi.mocked(getTickArrayAddress)
        .mockResolvedValueOnce(['LowerTickArrayAddr1' as never] as never)
        .mockResolvedValueOnce(['UpperTickArrayAddr1' as never] as never);
      vi.mocked(getTickIndexInArray).mockReturnValueOnce(0).mockReturnValueOnce(99);
      vi.mocked(fetchAllTickArray).mockResolvedValue([
        { data: { ticks: [{ initialized: true, liquidityNet: 0n }] } },
        { data: { ticks: [{ initialized: true, liquidityNet: 0n }] } },
      ] as never);

      const helper = new OrcaPositionFeeRewardQuoteHelper();
      const result = await helper.quote({
        rpc: mockRpc,
        position: makePosition(),
        whirlpool: makeWhirlpool(),
        whirlpoolAddress: MOCK_WHIRLPOOL,
      });

      expect(result.kind).toBe('unavailable');
      if (result.kind !== 'unavailable') throw new Error('expected unavailable');
      expect(result.reason).toBe('tick-data-missing');
    });

    it('returns unavailable with reason "fee-quote-failed" when collectFeesQuote throws', async () => {
      const { getTickArrayAddress, fetchAllTickArray } = await import('@orca-so/whirlpools-client');
      const { getTickArrayStartTickIndex, getTickIndexInArray, collectFeesQuote } =
        await import('@orca-so/whirlpools-core');

      vi.mocked(getTickArrayStartTickIndex).mockReturnValueOnce(-22528).mockReturnValueOnce(-22528);
      vi.mocked(getTickArrayAddress)
        .mockResolvedValueOnce(['LowerTickArrayAddr1' as never] as never)
        .mockResolvedValueOnce(['UpperTickArrayAddr1' as never] as never);
      vi.mocked(getTickIndexInArray).mockReturnValueOnce(0).mockReturnValueOnce(0);
      vi.mocked(fetchAllTickArray).mockResolvedValue([
        { data: { ticks: [{ initialized: true, liquidityNet: 0n }] } },
        { data: { ticks: [{ initialized: true, liquidityNet: 0n }] } },
      ] as never);
      vi.mocked(collectFeesQuote).mockImplementation(() => {
        throw new Error('wasm overflow');
      });

      const helper = new OrcaPositionFeeRewardQuoteHelper();
      const result = await helper.quote({
        rpc: mockRpc,
        position: makePosition(),
        whirlpool: makeWhirlpool(),
        whirlpoolAddress: MOCK_WHIRLPOOL,
      });

      expect(result.kind).toBe('unavailable');
      if (result.kind !== 'unavailable') throw new Error('expected unavailable');
      expect(result.reason).toBe('fee-quote-failed');
      expect(result.errorMessage).toBe('wasm overflow');
    });

    it('returns unavailable with reason "reward-quote-failed" when collectRewardsQuote throws', async () => {
      const { getTickArrayAddress, fetchAllTickArray } = await import('@orca-so/whirlpools-client');
      const {
        getTickArrayStartTickIndex,
        getTickIndexInArray,
        collectFeesQuote,
        collectRewardsQuote,
      } = await import('@orca-so/whirlpools-core');

      vi.mocked(getTickArrayStartTickIndex).mockReturnValueOnce(-22528).mockReturnValueOnce(-22528);
      vi.mocked(getTickArrayAddress)
        .mockResolvedValueOnce(['LowerTickArrayAddr1' as never] as never)
        .mockResolvedValueOnce(['UpperTickArrayAddr1' as never] as never);
      vi.mocked(getTickIndexInArray).mockReturnValueOnce(0).mockReturnValueOnce(0);
      vi.mocked(fetchAllTickArray).mockResolvedValue([
        { data: { ticks: [{ initialized: true, liquidityNet: 0n }] } },
        { data: { ticks: [{ initialized: true, liquidityNet: 0n }] } },
      ] as never);
      vi.mocked(collectFeesQuote).mockReturnValue({ feeOwedA: 1n, feeOwedB: 2n } as never);
      vi.mocked(collectRewardsQuote).mockImplementation(() => {
        throw new Error('rewards bug');
      });

      const helper = new OrcaPositionFeeRewardQuoteHelper();
      const result = await helper.quote({
        rpc: mockRpc,
        position: makePosition(),
        whirlpool: makeWhirlpool(),
        whirlpoolAddress: MOCK_WHIRLPOOL,
      });

      expect(result.kind).toBe('unavailable');
      if (result.kind !== 'unavailable') throw new Error('expected unavailable');
      expect(result.reason).toBe('reward-quote-failed');
      expect(result.errorMessage).toBe('rewards bug');
    });

    it('keeps empty/inactive reward slots with mint="", decimals=null, amountOwed=0n even when quote returns nonzero', async () => {
      const { getTickArrayAddress, fetchAllTickArray } = await import('@orca-so/whirlpools-client');
      const {
        getTickArrayStartTickIndex,
        getTickIndexInArray,
        collectFeesQuote,
        collectRewardsQuote,
      } = await import('@orca-so/whirlpools-core');

      vi.mocked(getTickArrayStartTickIndex).mockReturnValueOnce(-22528).mockReturnValueOnce(-22528);
      vi.mocked(getTickArrayAddress)
        .mockResolvedValueOnce(['LowerTickArrayAddr1' as never] as never)
        .mockResolvedValueOnce(['UpperTickArrayAddr1' as never] as never);
      vi.mocked(getTickIndexInArray).mockReturnValueOnce(0).mockReturnValueOnce(0);
      vi.mocked(fetchAllTickArray).mockResolvedValue([
        { data: { ticks: [{ initialized: true, liquidityNet: 0n }] } },
        { data: { ticks: [{ initialized: true, liquidityNet: 0n }] } },
      ] as never);
      vi.mocked(collectFeesQuote).mockReturnValue({ feeOwedA: 0n, feeOwedB: 0n } as never);
      vi.mocked(collectRewardsQuote).mockReturnValue({
        rewards: [{ rewardsOwed: 50n }, { rewardsOwed: 50n }, { rewardsOwed: 50n }],
      } as never);

      const helper = new OrcaPositionFeeRewardQuoteHelper();
      const result = await helper.quote({
        rpc: mockRpc,
        position: makePosition(),
        whirlpool: makeWhirlpool({
          rewardInfos: [
            { mint: { toString: () => '' } },
            { mint: { toString: () => '' } },
            { mint: { toString: () => '' } },
          ],
        }),
        whirlpoolAddress: MOCK_WHIRLPOOL,
      });

      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') throw new Error('expected ok');
      expect(result.fees.rewardInfos.length).toBe(3);
      for (const ri of result.fees.rewardInfos) {
        expect(ri.mint).toBe('');
        expect(ri.decimals).toBeNull();
        expect(ri.amountOwed).toBe(0n);
      }
    });
  });
});

import { describe, it, expect } from 'vitest';
import { buildSolUsdcPositionInsight } from './buildSolUsdcPositionInsight.js';
import {
  FIXTURE_POSITION_DETAIL,
  FIXTURE_POSITION_IN_RANGE,
} from '@clmm/testing';

describe('buildSolUsdcPositionInsight', () => {
  it('returns a SOL/USDC position insight DTO with raw fee fields and tick distances', () => {
    const result = buildSolUsdcPositionInsight({
      detail: FIXTURE_POSITION_DETAIL,
      observedAtUnixMs: 1_700_000_000_000,
      priceMap: new Map([
        ['So11111111111111111111111111111111111111112', { usdValue: 150, symbol: 'SOL' }],
        ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', { usdValue: 1, symbol: 'USDC' }],
      ]),
    });

    expect(result.insight.pair).toBe('SOL/USDC');
    expect(result.insight.source).toBe('orca');
    expect(result.insight.walletId).toBe(FIXTURE_POSITION_IN_RANGE.walletId);
    expect(result.insight.positionId).toBe(FIXTURE_POSITION_IN_RANGE.positionId);
    expect(result.insight.lowerTick).toBe(100);
    expect(result.insight.upperTick).toBe(200);
    expect(result.insight.unclaimedFees.feeOwedA.raw).toBe('120000000');
    expect(result.insight.unclaimedFees.feeOwedA.decimals).toBe(9);
    expect(result.insight.unclaimedFees.feeOwedA.symbol).toBe('SOL');
    expect(result.insight.unclaimedFees.feeOwedB.raw).toBe('47230000');
    expect(result.insight.unclaimedFees.feeOwedB.symbol).toBe('USDC');
    expect(result.insight.unclaimedFeesUsd).not.toBeNull();
    expect(result.insight.unclaimedFeesUsd).toBeGreaterThan(0);
    expect(result.insight.unclaimedRewardsUsd).toBe(0);
    expect(result.insight.hasActionableTrigger).toBe(false);
    expect(result.insight.triggerId).toBeUndefined();
    expect(result.warnings).toEqual([]);
  });

  it('returns null fee USD and a warning when fee prices are missing, and 0 rewards USD when there are no rewards', () => {
    const result = buildSolUsdcPositionInsight({
      detail: FIXTURE_POSITION_DETAIL,
      observedAtUnixMs: 1_700_000_000_000,
      priceMap: new Map(),
    });

    expect(result.insight.unclaimedFeesUsd).toBeNull();
    expect(result.insight.unclaimedRewardsUsd).toBe(0);
    expect(result.warnings.find((w) => w.code === 'fee_reward_usd_unavailable')).toBeDefined();
    expect(result.warnings.find((w) => w.code === 'fee_reward_usd_unavailable')?.scope?.positionId)
      .toBe(FIXTURE_POSITION_IN_RANGE.positionId);
  });

  it('returns null rewards USD and a warning when a reward price is missing', () => {
    const detailWithReward = {
      ...FIXTURE_POSITION_DETAIL,
      fees: {
        ...FIXTURE_POSITION_DETAIL.fees,
        rewardInfos: [
          { mint: 'RewardMint1111111111111111111111111111111111', amountOwed: 1_000n, decimals: 6 },
        ],
      },
    };
    const result = buildSolUsdcPositionInsight({
      detail: detailWithReward,
      observedAtUnixMs: 1_700_000_000_000,
      priceMap: new Map([
        ['So11111111111111111111111111111111111111112', { usdValue: 150, symbol: 'SOL' }],
        ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', { usdValue: 1, symbol: 'USDC' }],
      ]),
    });

    expect(result.insight.unclaimedFeesUsd).not.toBeNull();
    expect(result.insight.unclaimedRewardsUsd).toBeNull();
    expect(result.warnings.find((w) => w.code === 'fee_reward_usd_unavailable')).toBeDefined();
  });

  it('omits price-distance fields and adds a warning when token decimals are missing', () => {
    const detailNoDecimals = {
      ...FIXTURE_POSITION_DETAIL,
      poolData: {
        ...FIXTURE_POSITION_DETAIL.poolData,
        tokenPair: {
          ...FIXTURE_POSITION_DETAIL.poolData.tokenPair,
          decimalsA: null,
          decimalsB: null,
        },
      },
    };

    const result = buildSolUsdcPositionInsight({
      detail: detailNoDecimals,
      observedAtUnixMs: 1_700_000_000_000,
      priceMap: new Map(),
    });

    expect(result.insight.rangeDistance.belowLowerPricePercent).toBeUndefined();
    expect(result.insight.rangeDistance.aboveUpperPricePercent).toBeUndefined();
    expect(result.warnings.find((w) => w.code === 'price_distance_unavailable')).toBeDefined();
  });
});
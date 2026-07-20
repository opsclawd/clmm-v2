import { describe, it, expect } from 'vitest';
import { buildSolUsdcPositionInsight, type PriceMapEntry } from './buildSolUsdcPositionInsight.js';
import { FIXTURE_POSITION_DETAIL, FIXTURE_POSITION_IN_RANGE } from '@clmm/testing';
import { makeClockTimestamp } from '@clmm/domain';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

function makePriceMapEntry(
  mint: string,
  usdValue: number,
  symbol: string,
  quotedAt?: number,
  source?: string,
): PriceMapEntry {
  return {
    usdValue,
    symbol,
    quotedAt: quotedAt ?? makeClockTimestamp(1_700_000_000_000),
    source: source ?? 'orca_full_liquidity_quote',
  };
}

describe('buildSolUsdcPositionInsight', () => {
  describe('behavioral invariants', () => {
    it('serializes exact principal amounts including zero', () => {
      const detailWithPrincipal = {
        ...FIXTURE_POSITION_DETAIL,
        principalTokenAmounts: {
          amountA: 0n,
          amountB: 0n,
          observedAt: makeClockTimestamp(1_700_000_100_000),
        },
      };
      const priceMap = new Map<string, PriceMapEntry>([
        [SOL_MINT, makePriceMapEntry(SOL_MINT, 150, 'SOL')],
        [USDC_MINT, makePriceMapEntry(USDC_MINT, 1, 'USDC')],
      ]);
      const result = buildSolUsdcPositionInsight({
        detail: detailWithPrincipal,
        observedAtUnixMs: 1_700_000_000_000,
        priceMap,
      });

      expect(result.insight.principalTokenAmounts).toEqual({
        tokenA: { raw: '0', decimals: 9, symbol: 'SOL', mint: SOL_MINT },
        tokenB: { raw: '0', decimals: 6, symbol: 'USDC', mint: USDC_MINT },
        observedAtUnixMs: 1_700_000_100_000,
        source: 'orca_full_liquidity_quote',
        basis: 'principal-only',
      });
    });

    it('warns and returns null when principal amounts are unavailable', () => {
      const detailNoPrincipal = {
        ...FIXTURE_POSITION_DETAIL,
        principalTokenAmounts: null,
      };
      const priceMap = new Map<string, PriceMapEntry>([
        [SOL_MINT, makePriceMapEntry(SOL_MINT, 150, 'SOL')],
        [USDC_MINT, makePriceMapEntry(USDC_MINT, 1, 'USDC')],
      ]);
      const result = buildSolUsdcPositionInsight({
        detail: detailNoPrincipal,
        observedAtUnixMs: 1_700_000_000_000,
        priceMap,
      });

      expect(result.insight.principalTokenAmounts).toBeNull();
      const principalWarning = result.warnings.find(
        (w) => w.code === 'principal_token_amounts_unavailable',
      );
      expect(principalWarning).toBeDefined();
      expect(principalWarning?.scope?.positionId).toBe(FIXTURE_POSITION_IN_RANGE.positionId);
      expect(principalWarning?.scope?.poolId).toBeDefined();
    });

    it('serializes returned price quotes in mint order with exact lineage', () => {
      const quotedAt1 = makeClockTimestamp(1_700_000_001_000);
      const quotedAt2 = makeClockTimestamp(1_700_000_002_000);
      const priceMap = new Map<string, PriceMapEntry>([
        [USDC_MINT, makePriceMapEntry(USDC_MINT, 1, 'USDC', quotedAt2, 'test_source_b')],
        [SOL_MINT, makePriceMapEntry(SOL_MINT, 150, 'SOL', quotedAt1, 'test_source_a')],
      ]);
      const result = buildSolUsdcPositionInsight({
        detail: FIXTURE_POSITION_DETAIL,
        observedAtUnixMs: 1_700_000_000_000,
        priceMap,
      });

      expect(result.insight.usdPriceQuotes).toHaveLength(2);
      expect(result.insight.usdPriceQuotes[0]).toMatchObject({
        mint: USDC_MINT,
        symbol: 'USDC',
        usdPerToken: 1,
        quotedAtUnixMs: 1_700_000_002_000,
        source: 'test_source_b',
      });
      expect(result.insight.usdPriceQuotes[1]).toMatchObject({
        mint: SOL_MINT,
        symbol: 'SOL',
        usdPerToken: 150,
        quotedAtUnixMs: 1_700_000_001_000,
        source: 'test_source_a',
      });
    });

    it('warns once per requested missing mint and omits its quote', () => {
      const priceMap = new Map<string, PriceMapEntry>([
        [SOL_MINT, makePriceMapEntry(SOL_MINT, 150, 'SOL')],
      ]);
      const result = buildSolUsdcPositionInsight({
        detail: FIXTURE_POSITION_DETAIL,
        observedAtUnixMs: 1_700_000_000_000,
        priceMap,
      });

      expect(result.insight.usdPriceQuotes).toHaveLength(1);
      expect(result.insight.usdPriceQuotes[0]?.mint).toBe(SOL_MINT);

      const missingQuoteWarning = result.warnings.filter(
        (w) => w.code === 'usd_price_quote_unavailable' && w.scope?.tokenMint === USDC_MINT,
      );
      expect(missingQuoteWarning).toHaveLength(1);
      expect(missingQuoteWarning[0]?.scope?.positionId).toBe(FIXTURE_POSITION_IN_RANGE.positionId);
    });

    it('computes known zero compatibility totals from serialized quotes', () => {
      const detailZeroFees = {
        ...FIXTURE_POSITION_DETAIL,
        fees: {
          ...FIXTURE_POSITION_DETAIL.fees,
          feeOwedA: 0n,
          feeOwedB: 0n,
        },
      };
      const priceMap = new Map<string, PriceMapEntry>([
        [SOL_MINT, makePriceMapEntry(SOL_MINT, 150, 'SOL')],
        [USDC_MINT, makePriceMapEntry(USDC_MINT, 1, 'USDC')],
      ]);
      const result = buildSolUsdcPositionInsight({
        detail: detailZeroFees,
        observedAtUnixMs: 1_700_000_000_000,
        priceMap,
      });

      expect(result.insight.unclaimedFeesUsd).toBe(0);
      expect(result.insight.unclaimedRewardsUsd).toBe(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('sets affected totals null while retaining compatibility warnings', () => {
      const priceMap = new Map<string, PriceMapEntry>([]);
      const result = buildSolUsdcPositionInsight({
        detail: FIXTURE_POSITION_DETAIL,
        observedAtUnixMs: 1_700_000_000_000,
        priceMap,
      });

      expect(result.insight.unclaimedFeesUsd).toBeNull();
      expect(result.insight.unclaimedRewardsUsd).toBe(0);
      const feeRewardWarning = result.warnings.find((w) => w.code === 'fee_reward_usd_unavailable');
      expect(feeRewardWarning).toBeDefined();
      expect(feeRewardWarning?.scope?.positionId).toBe(FIXTURE_POSITION_IN_RANGE.positionId);
    });

    it('sets partial exactly when raw-fact warnings exist', () => {
      const priceMap = new Map<string, PriceMapEntry>([]);
      const result = buildSolUsdcPositionInsight({
        detail: FIXTURE_POSITION_DETAIL,
        observedAtUnixMs: 1_700_000_000_000,
        priceMap,
      });

      expect(result.warnings.length > 0).toBe(true);
    });
  });
  it('returns a SOL/USDC position insight DTO with raw fee fields and tick distances', () => {
    const result = buildSolUsdcPositionInsight({
      detail: FIXTURE_POSITION_DETAIL,
      observedAtUnixMs: 1_700_000_000_000,
      priceMap: new Map([
        [
          'So11111111111111111111111111111111111111112',
          { usdValue: 150, symbol: 'SOL', quotedAt: 1_700_000_000_000, source: 'jupiter' },
        ],
        [
          'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          { usdValue: 1, symbol: 'USDC', quotedAt: 1_700_000_000_000, source: 'jupiter' },
        ],
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
    expect(
      result.warnings.find((w) => w.code === 'fee_reward_usd_unavailable')?.scope?.positionId,
    ).toBe(FIXTURE_POSITION_IN_RANGE.positionId);
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
        [
          'So11111111111111111111111111111111111111112',
          { usdValue: 150, symbol: 'SOL', quotedAt: 1_700_000_000_000, source: 'jupiter' },
        ],
        [
          'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          { usdValue: 1, symbol: 'USDC', quotedAt: 1_700_000_000_000, source: 'jupiter' },
        ],
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

  it('returns price_distance_unavailable with zero-width range message when lowerBound equals upperBound', () => {
    const detailZeroWidth = {
      ...FIXTURE_POSITION_DETAIL,
      position: {
        ...FIXTURE_POSITION_DETAIL.position,
        bounds: {
          lowerBound: 100,
          upperBound: 100,
        },
      },
    };

    const result = buildSolUsdcPositionInsight({
      detail: detailZeroWidth,
      observedAtUnixMs: 1_700_000_000_000,
      priceMap: new Map([
        [
          'So11111111111111111111111111111111111111112',
          { usdValue: 150, symbol: 'SOL', quotedAt: 1_700_000_000_000, source: 'jupiter' },
        ],
        [
          'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          { usdValue: 1, symbol: 'USDC', quotedAt: 1_700_000_000_000, source: 'jupiter' },
        ],
      ]),
    });

    const priceDistanceWarning = result.warnings.find(
      (w) => w.code === 'price_distance_unavailable',
    );
    expect(priceDistanceWarning).toBeDefined();
    expect(priceDistanceWarning?.message).toContain('zero-width range');
  });

  it('uses rangeState.currentPrice as fallback when decimals are missing', () => {
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

    expect(result.insight.currentPrice).toBe(
      FIXTURE_POSITION_DETAIL.position.rangeState.currentPrice,
    );
    expect(result.insight.currentPriceLabel).toBeDefined();
  });

  it('returns null fee USD when only one token price is available', () => {
    const result = buildSolUsdcPositionInsight({
      detail: FIXTURE_POSITION_DETAIL,
      observedAtUnixMs: 1_700_000_000_000,
      priceMap: new Map([
        [
          'So11111111111111111111111111111111111111112',
          { usdValue: 150, symbol: 'SOL', quotedAt: 1_700_000_000_000, source: 'jupiter' },
        ],
      ]),
    });

    expect(result.insight.unclaimedFeesUsd).toBeNull();
    expect(result.warnings.find((w) => w.code === 'fee_reward_usd_unavailable')).toBeDefined();
  });
});

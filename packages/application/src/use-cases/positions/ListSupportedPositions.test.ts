import { describe, it, expect } from 'vitest';
import { listSupportedPositions } from './ListSupportedPositions.js';
import {
  FakeSupportedPositionReadPort,
  FakePricePort,
  FIXTURE_WALLET_ID,
  FIXTURE_POSITION_IN_RANGE,
  FIXTURE_POSITION_BELOW_RANGE,
  FIXTURE_POOL_DATA,
  FIXTURE_SOL_PRICE_QUOTE,
  FIXTURE_USDC_PRICE_QUOTE,
} from '@clmm/testing';
import type { PricePort } from '@clmm/application';

describe('ListSupportedPositions', () => {
  it('returns enriched summaries with pool data and prices', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort(
      [FIXTURE_POSITION_IN_RANGE],
      { [FIXTURE_POSITION_IN_RANGE.poolId]: FIXTURE_POOL_DATA },
    );
    const pricePort = new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]);

    const result = await listSupportedPositions({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort,
      pricePort,
    });

    expect(result.positions).toHaveLength(1);
    expect(result.summaryDtos).toHaveLength(1);
    expect(result.summaryDtos[0]?.tokenPairLabel).toContain('SOL');
    expect(result.summaryDtos[0]?.currentPriceLabel).toMatch(/\$/);
    expect(result.summaryDtos[0]?.feeRateLabel).toBe('10 bps');
  });

  it('degrades gracefully when price fetch fails', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort(
      [FIXTURE_POSITION_IN_RANGE],
      { [FIXTURE_POSITION_IN_RANGE.poolId]: FIXTURE_POOL_DATA },
    );
    const pricePort: PricePort = {
      getPrices: async () => { throw new Error('price unavailable'); },
    };

    const result = await listSupportedPositions({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort,
      pricePort,
    });

    expect(result.summaryDtos).toHaveLength(1);
    expect(result.summaryDtos[0]?.tokenPairLabel).toContain('SOL');
    expect(result.summaryDtos[0]?.currentPriceLabel).toMatch(/\$/);
  });

  it('returns empty list when wallet has no positions', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([]);
    const pricePort = new FakePricePort([]);

    const result = await listSupportedPositions({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort,
      pricePort,
    });

    expect(result.positions).toHaveLength(0);
    expect(result.summaryDtos).toHaveLength(0);
  });

  it('falls back to tick labels when pool data unavailable', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort(
      [FIXTURE_POSITION_IN_RANGE],
      {},
    );
    const pricePort = new FakePricePort([]);

    const result = await listSupportedPositions({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort,
      pricePort,
    });

    expect(result.summaryDtos).toHaveLength(1);
    expect(result.summaryDtos[0]?.currentPriceLabel).toContain('tick:');
    expect(result.summaryDtos[0]?.poolId).toBe(FIXTURE_POSITION_IN_RANGE.poolId);
  });

  it('computes range distance for out-of-range positions', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort(
      [FIXTURE_POSITION_BELOW_RANGE],
      { [FIXTURE_POSITION_BELOW_RANGE.poolId]: FIXTURE_POOL_DATA },
    );
    const pricePort = new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]);

    const result = await listSupportedPositions({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort,
      pricePort,
    });

    expect(result.summaryDtos[0]?.rangeState).toBe('below-range');
    expect(result.summaryDtos[0]?.rangeDistance.belowLowerPercent).toBeGreaterThanOrEqual(0);
  });
});
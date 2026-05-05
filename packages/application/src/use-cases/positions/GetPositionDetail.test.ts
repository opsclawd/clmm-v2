import { describe, it, expect } from 'vitest';
import { getPositionDetail } from './GetPositionDetail.js';
import {
  FakeSupportedPositionReadPort,
  FakePricePort,
  FIXTURE_POSITION_ID,
  FIXTURE_POSITION_IN_RANGE,
  FIXTURE_WALLET_ID,
  FIXTURE_POOL_DATA,
  FIXTURE_POSITION_DETAIL,
  FIXTURE_SOL_PRICE_QUOTE,
  FIXTURE_USDC_PRICE_QUOTE,
} from '@clmm/testing';
import { makePositionId } from '@clmm/domain';
import type { PricePort } from '@clmm/application';

describe('GetPositionDetail', () => {
  it('returns enriched detail with fees and USD values', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort(
      [FIXTURE_POSITION_IN_RANGE],
      { [FIXTURE_POSITION_IN_RANGE.poolId]: FIXTURE_POOL_DATA },
      FIXTURE_POSITION_DETAIL,
    );
    const pricePort = new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]);

    const result = await getPositionDetail({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      positionReadPort,
      pricePort,
    });

    expect(result.kind).toBe('found');
    if (result.kind === 'found') {
      expect(result.detailDto.tokenPairLabel).toContain('SOL');
      expect(result.detailDto.unclaimedFees).toBeDefined();
      expect(result.detailDto.unclaimedFees.totalUsd).toBeGreaterThan(0);
      expect(result.detailDto.poolDepthLabel).toBeDefined();
    }
  });

  it('degrades gracefully when price fetch fails', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort(
      [FIXTURE_POSITION_IN_RANGE],
      { [FIXTURE_POSITION_IN_RANGE.poolId]: FIXTURE_POOL_DATA },
      FIXTURE_POSITION_DETAIL,
    );
    const pricePort: PricePort = {
      getPrices: async () => {
        throw new Error('price unavailable');
      },
    };

    const result = await getPositionDetail({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      positionReadPort,
      pricePort,
    });

    expect(result.kind).toBe('found');
    if (result.kind === 'found') {
      expect(result.detailDto.unclaimedFees.totalUsd).toBe(0);
      expect(result.detailDto.poolDepthLabel).toBe('depth unavailable');
    }
  });

  it('returns not-found when position does not exist', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([]);
    const pricePort = new FakePricePort([]);

    const result = await getPositionDetail({
      walletId: FIXTURE_WALLET_ID,
      positionId: makePositionId('nonexistent'),
      positionReadPort,
      pricePort,
    });

    expect(result.kind).toBe('not-found');
  });

  it('returns price-space bound fields', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort(
      [FIXTURE_POSITION_IN_RANGE],
      { [FIXTURE_POSITION_IN_RANGE.poolId]: FIXTURE_POOL_DATA },
      FIXTURE_POSITION_DETAIL,
    );
    const pricePort = new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]);

    const result = await getPositionDetail({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      positionReadPort,
      pricePort,
    });

    expect(result.kind).toBe('found');
    if (result.kind === 'found') {
      expect(result.detailDto.lowerBoundPrice).toBeDefined();
      expect(result.detailDto.upperBoundPrice).toBeDefined();
      expect(result.detailDto.lowerBoundLabel).toBeDefined();
      expect(result.detailDto.upperBoundLabel).toBeDefined();
      expect(typeof result.detailDto.lowerBoundPrice).toBe('number');
      expect(typeof result.detailDto.upperBoundPrice).toBe('number');
    }
  });

  it('returns cannot-build-supported-detail-dto when token decimals are null', async () => {
    const poolDataNullDecimals: typeof FIXTURE_POOL_DATA = {
      ...FIXTURE_POOL_DATA,
      tokenPair: {
        ...FIXTURE_POOL_DATA.tokenPair,
        decimalsA: null,
        decimalsB: null,
      },
    };
    const positionDetailNullDecimals: typeof FIXTURE_POSITION_DETAIL = {
      ...FIXTURE_POSITION_DETAIL,
      poolData: poolDataNullDecimals,
    };
    const positionReadPort = new FakeSupportedPositionReadPort(
      [FIXTURE_POSITION_IN_RANGE],
      { [FIXTURE_POSITION_IN_RANGE.poolId]: poolDataNullDecimals },
      positionDetailNullDecimals,
    );
    const pricePort = new FakePricePort([]);

    const result = await getPositionDetail({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      positionReadPort,
      pricePort,
    });

    expect(result.kind).toBe('cannot-build-supported-detail-dto');
  });

  it('returns not-found when returned detail has mismatched positionId', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort(
      [FIXTURE_POSITION_IN_RANGE],
      { [FIXTURE_POSITION_IN_RANGE.poolId]: FIXTURE_POOL_DATA },
      FIXTURE_POSITION_DETAIL,
    );
    const pricePort = new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]);

    const result = await getPositionDetail({
      walletId: FIXTURE_WALLET_ID,
      positionId: makePositionId('different-position-id'),
      positionReadPort,
      pricePort,
    });

    expect(result.kind).toBe('not-found');
  });
});

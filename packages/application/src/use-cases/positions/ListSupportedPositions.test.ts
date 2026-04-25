import { describe, it, expect } from 'vitest';
import { listSupportedPositions } from './ListSupportedPositions.js';
import {
  FakeSupportedPositionReadPort,
  FIXTURE_WALLET_ID,
  FIXTURE_POSITION_IN_RANGE,
  FIXTURE_POSITION_BELOW_RANGE,
  FIXTURE_POOL_DATA,
} from '@clmm/testing';

describe('ListSupportedPositions', () => {
  it('returns enriched summaries with pool data', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort(
      [FIXTURE_POSITION_IN_RANGE],
      { [FIXTURE_POSITION_IN_RANGE.poolId]: FIXTURE_POOL_DATA },
    );

    const result = await listSupportedPositions({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort,
    });

    expect(result.positions).toHaveLength(1);
    expect(result.summaryDtos).toHaveLength(1);
    expect(result.summaryDtos[0]?.tokenPairLabel).toContain('SOL');
    expect(result.summaryDtos[0]?.currentPriceLabel).toMatch(/\$/);
    expect(result.summaryDtos[0]?.feeRateLabel).toBe('10 bps');
  });

  it('returns empty list when wallet has no positions', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([]);

    const result = await listSupportedPositions({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort,
    });

    expect(result.positions).toHaveLength(0);
    expect(result.summaryDtos).toHaveLength(0);
  });

  it('falls back to tick labels when pool data unavailable', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort(
      [FIXTURE_POSITION_IN_RANGE],
      {},
    );

    const result = await listSupportedPositions({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort,
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

    const result = await listSupportedPositions({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort,
    });

    expect(result.summaryDtos[0]?.rangeState).toBe('below-range');
    expect(result.summaryDtos[0]?.rangeDistance.belowLowerPercent).toBeGreaterThanOrEqual(0);
  });
});
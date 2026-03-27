import { describe, it, expect, beforeEach } from 'vitest';
import { scanPositionsForBreaches } from '@clmm/application';
import {
  FakeSupportedPositionReadPort,
  FakeClockPort,
  FakeIdGeneratorPort,
  FIXTURE_WALLET_ID,
  FIXTURE_POSITION_BELOW_RANGE,
  FIXTURE_POSITION_ABOVE_RANGE,
  FIXTURE_POSITION_IN_RANGE,
} from '@clmm/testing';

describe('ScanPositionsForBreaches', () => {
  let clock: FakeClockPort;
  let ids: FakeIdGeneratorPort;

  beforeEach(() => {
    clock = new FakeClockPort();
    ids = new FakeIdGeneratorPort('scan');
  });

  it('reports below-range observation for a position below its lower bound', async () => {
    const positionRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_BELOW_RANGE]);
    const observations = await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: positionRead,
      clock,
      ids,
    });
    expect(observations).toHaveLength(1);
    expect(observations[0]?.direction.kind).toBe('lower-bound-breach');
  });

  it('reports above-range observation for a position above its upper bound', async () => {
    const positionRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_ABOVE_RANGE]);
    const observations = await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: positionRead,
      clock,
      ids,
    });
    expect(observations[0]?.direction.kind).toBe('upper-bound-breach');
  });

  it('reports no observations for in-range positions', async () => {
    const positionRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]);
    const observations = await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: positionRead,
      clock,
      ids,
    });
    expect(observations).toHaveLength(0);
  });

  it('observations include positionId and breachDirection — never inferred from token order', async () => {
    const positionRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_BELOW_RANGE]);
    const [obs] = await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: positionRead,
      clock,
      ids,
    });
    expect(obs?.positionId).toBe(FIXTURE_POSITION_BELOW_RANGE.positionId);
    expect(obs?.direction).toBeDefined();
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { scanPositionsForBreaches } from './ScanPositionsForBreaches.js';
import {
  FakeSupportedPositionReadPort,
  FakeClockPort,
  FakeBreachEpisodeRepository,
  FIXTURE_WALLET_ID,
  FIXTURE_POSITION_BELOW_RANGE,
  FIXTURE_POSITION_ABOVE_RANGE,
  FIXTURE_POSITION_IN_RANGE,
} from '@clmm/testing';

describe('ScanPositionsForBreaches', () => {
  let clock: FakeClockPort;
  let episodeRepo: FakeBreachEpisodeRepository;

  beforeEach(() => {
    clock = new FakeClockPort();
    episodeRepo = new FakeBreachEpisodeRepository();
    FakeBreachEpisodeRepository.resetCounter();
  });

  it('emits observation with consecutiveCount=1 for first breach', async () => {
    const positionRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_BELOW_RANGE]);
    const { observations } = await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: positionRead,
      clock,
      episodeRepo,
    });

    expect(observations).toHaveLength(1);
    expect(observations[0]?.consecutiveCount).toBe(1);
    expect(observations[0]?.direction.kind).toBe('lower-bound-breach');
  });

  it('increments consecutiveCount on subsequent scans in same direction', async () => {
    const positionRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_BELOW_RANGE]);

    await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: positionRead,
      clock,
      episodeRepo,
    });

    clock.advance(60_000);

    const { observations } = await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: positionRead,
      clock,
      episodeRepo,
    });

    expect(observations[0]?.consecutiveCount).toBe(2);
  });

  it('reuses same episodeId across scans in same direction', async () => {
    const positionRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_BELOW_RANGE]);

    const first = await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: positionRead,
      clock,
      episodeRepo,
    });

    clock.advance(60_000);

    const second = await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: positionRead,
      clock,
      episodeRepo,
    });

    expect(second.observations[0]?.episodeId).toBe(first.observations[0]?.episodeId);
  });

  it('emits no observations and no abandonments for in-range positions with no open episode', async () => {
    const positionRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]);
    const { observations, abandonments } = await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: positionRead,
      clock,
      episodeRepo,
    });

    expect(observations).toHaveLength(0);
    expect(abandonments).toHaveLength(0);
  });

  it('emits abandonment when position recovers to in-range', async () => {
    const belowRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_BELOW_RANGE]);

    await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: belowRead,
      clock,
      episodeRepo,
    });

    clock.advance(60_000);

    const inRangeRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]);
    const { abandonments } = await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: inRangeRead,
      clock,
      episodeRepo,
    });

    expect(abandonments).toHaveLength(1);
    expect(abandonments[0]?.reason).toBe('position-recovered');
  });

  it('emits abandonment and starts new episode on direction reversal', async () => {
    const belowRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_BELOW_RANGE]);

    await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: belowRead,
      clock,
      episodeRepo,
    });

    clock.advance(60_000);

    const aboveRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_ABOVE_RANGE]);
    const { observations, abandonments } = await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: aboveRead,
      clock,
      episodeRepo,
    });

    expect(abandonments).toHaveLength(1);
    expect(abandonments[0]?.reason).toBe('direction-reversed');
    expect(observations).toHaveLength(1);
    expect(observations[0]?.consecutiveCount).toBe(1);
    expect(observations[0]?.direction.kind).toBe('upper-bound-breach');
  });

  it('does not increment count on duplicate scan tick (idempotency)', async () => {
    const positionRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_BELOW_RANGE]);

    const first = await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: positionRead,
      clock,
      episodeRepo,
    });

    const second = await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: positionRead,
      clock,
      episodeRepo,
    });

    expect(second.observations[0]?.consecutiveCount).toBe(first.observations[0]?.consecutiveCount);
  });
});

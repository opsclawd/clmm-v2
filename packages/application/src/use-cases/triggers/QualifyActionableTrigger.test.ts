import { describe, it, expect, beforeEach } from 'vitest';
import { qualifyActionableTrigger } from './QualifyActionableTrigger.js';
import {
  FakeBreachEpisodeRepository,
  FakeIdGeneratorPort,
  FIXTURE_POSITION_ID,
} from '@clmm/testing';
import {
  LOWER_BOUND_BREACH,
  UPPER_BOUND_BREACH,
  makeClockTimestamp,
  type BreachEpisodeId,
} from '@clmm/domain';
import type { BreachObservationResult } from './ScanPositionsForBreaches.js';

function makeObs(
  direction = LOWER_BOUND_BREACH,
): BreachObservationResult {
  return {
    positionId: FIXTURE_POSITION_ID,
    direction,
    observedAt: makeClockTimestamp(1_000_000),
    episodeId: 'ep-1' as BreachEpisodeId,
    consecutiveCount: 3,
  };
}

describe('QualifyActionableTrigger', () => {
  let ids: FakeIdGeneratorPort;
  let episodeRepo: FakeBreachEpisodeRepository;

  beforeEach(() => {
    ids = new FakeIdGeneratorPort('trigger');
    episodeRepo = new FakeBreachEpisodeRepository();
    episodeRepo.episodes.set('ep-1', {
      episodeId: 'ep-1' as BreachEpisodeId,
      positionId: FIXTURE_POSITION_ID,
      direction: LOWER_BOUND_BREACH,
      status: 'open',
      startedAt: makeClockTimestamp(900_000),
      lastObservedAt: makeClockTimestamp(1_000_000),
      consecutiveCount: 3,
      triggerId: null,
      closedAt: null,
      closeReason: null,
    });
  });

  it('returns not-qualified below threshold', async () => {
    const result = await qualifyActionableTrigger({
      observation: {
        ...makeObs(LOWER_BOUND_BREACH),
        consecutiveCount: 2,
      },
      episodeRepo,
      ids,
    });
    expect(result.kind).toBe('not-qualified');
  });

  it('creates trigger when threshold met and episode exists', async () => {
    const result = await qualifyActionableTrigger({
      observation: makeObs(UPPER_BOUND_BREACH),
      episodeRepo,
      ids,
    });

    expect(result.kind).toBe('trigger-created');
    if (result.kind === 'trigger-created') {
      expect(result.trigger.breachDirection.kind).toBe('upper-bound-breach');
      expect(result.trigger.triggeredAt).toBe(makeClockTimestamp(1_000_000));
    }
  });

  it('returns duplicate-suppressed when episode already has trigger', async () => {
    await qualifyActionableTrigger({
      observation: makeObs(),
      episodeRepo,
      ids,
    });

    const result = await qualifyActionableTrigger({
      observation: makeObs(),
      episodeRepo,
      ids,
    });

    expect(result.kind).toBe('duplicate-suppressed');
  });

  it('uses IdGeneratorPort for trigger id', async () => {
    const result = await qualifyActionableTrigger({
      observation: makeObs(),
      episodeRepo,
      ids,
    });

    expect(result.kind).toBe('trigger-created');
    if (result.kind === 'trigger-created') {
      expect(result.trigger.triggerId).toBe('trigger-1');
    }
  });
});

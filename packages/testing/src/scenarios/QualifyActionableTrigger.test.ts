import { describe, it, expect, beforeEach } from 'vitest';
import { qualifyActionableTrigger } from '@clmm/application';
import {
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeTriggerRepository,
  FIXTURE_POSITION_ID,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH, makeClockTimestamp } from '@clmm/domain';
import type { BreachObservationResult } from '@clmm/application';

function makeObs(
  direction = LOWER_BOUND_BREACH,
): BreachObservationResult {
  return {
    positionId: FIXTURE_POSITION_ID,
    direction,
    observedAt: makeClockTimestamp(1_000_000),
    episodeId: 'ep-1',
  };
}

describe('QualifyActionableTrigger', () => {
  let clock: FakeClockPort;
  let ids: FakeIdGeneratorPort;
  let repo: FakeTriggerRepository;

  beforeEach(() => {
    clock = new FakeClockPort();
    ids = new FakeIdGeneratorPort('trigger');
    repo = new FakeTriggerRepository();
  });

  it('creates a trigger for a lower-bound breach with correct direction', async () => {
    const result = await qualifyActionableTrigger({
      observation: makeObs(LOWER_BOUND_BREACH),
      consecutiveCount: 3,
      triggerRepo: repo,
      clock,
      ids,
    });
    expect(result.kind).toBe('trigger-created');
    if (result.kind === 'trigger-created') {
      expect(result.trigger.breachDirection.kind).toBe('lower-bound-breach');
    }
  });

  it('creates a trigger for an upper-bound breach with correct direction', async () => {
    const result = await qualifyActionableTrigger({
      observation: makeObs(UPPER_BOUND_BREACH),
      consecutiveCount: 3,
      triggerRepo: repo,
      clock,
      ids,
    });
    expect(result.kind).toBe('trigger-created');
    if (result.kind === 'trigger-created') {
      expect(result.trigger.breachDirection.kind).toBe('upper-bound-breach');
    }
  });

  it('suppresses duplicate when episode already has a trigger', async () => {
    await qualifyActionableTrigger({
      observation: makeObs(),
      consecutiveCount: 3,
      triggerRepo: repo,
      clock,
      ids,
    });
    const result = await qualifyActionableTrigger({
      observation: makeObs(),
      consecutiveCount: 3,
      triggerRepo: repo,
      clock,
      ids,
    });
    expect(result.kind).toBe('duplicate-suppressed');
  });

  it('does not qualify when below confirmation threshold', async () => {
    const result = await qualifyActionableTrigger({
      observation: makeObs(),
      consecutiveCount: 2,
      triggerRepo: repo,
      clock,
      ids,
    });
    expect(result.kind).toBe('not-qualified');
  });

  it('persists the trigger and episode to the repository', async () => {
    await qualifyActionableTrigger({
      observation: makeObs(),
      consecutiveCount: 3,
      triggerRepo: repo,
      clock,
      ids,
    });
    expect(repo.triggers.size).toBe(1);
  });
});

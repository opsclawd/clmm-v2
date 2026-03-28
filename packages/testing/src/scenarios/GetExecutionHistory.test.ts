import { describe, it, expect, beforeEach } from 'vitest';
import { getExecutionHistory } from '@clmm/application';
import { FakeClockPort, FakeExecutionHistoryRepository, FIXTURE_POSITION_ID } from '@clmm/testing';
import { LOWER_BOUND_BREACH, makePositionId } from '@clmm/domain';

describe('GetExecutionHistory', () => {
  let historyRepo: FakeExecutionHistoryRepository;

  beforeEach(async () => {
    historyRepo = new FakeExecutionHistoryRepository();
    await historyRepo.appendEvent({
      eventId: 'evt-1',
      positionId: FIXTURE_POSITION_ID,
      eventType: 'submitted',
      breachDirection: LOWER_BOUND_BREACH,
      occurredAt: new FakeClockPort().now(),
      lifecycleState: { kind: 'submitted' },
    });
  });

  it('returns the timeline for a position', async () => {
    const result = await getExecutionHistory({ positionId: FIXTURE_POSITION_ID, historyRepo });
    expect(result.timeline.positionId).toBe(FIXTURE_POSITION_ID);
    expect(result.timeline.events).toHaveLength(1);
  });

  it('returns empty timeline for a position with no events', async () => {
    const otherId = makePositionId('other-pos');
    const result = await getExecutionHistory({ positionId: otherId, historyRepo });
    expect(result.timeline.events).toHaveLength(0);
  });

  it('events include breachDirection', async () => {
    const result = await getExecutionHistory({ positionId: FIXTURE_POSITION_ID, historyRepo });
    expect(result.timeline.events[0]?.breachDirection).toBeDefined();
  });
});

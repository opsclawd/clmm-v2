import type {
  ExecutionRepository,
  ExecutionHistoryRepository,
  ClockPort,
  IdGeneratorPort,
} from '../../ports/index.js';
import type { PositionId, BreachDirection, ExecutionLifecycleState } from '@clmm/domain';

export type RecordAbandonmentResult =
  | { kind: 'abandoned' }
  | { kind: 'not-found' }
  | { kind: 'already-terminal'; state: ExecutionLifecycleState['kind'] };

export async function recordExecutionAbandonment(params: {
  attemptId: string;
  positionId: PositionId;
  breachDirection: BreachDirection;
  executionRepo: ExecutionRepository;
  historyRepo: ExecutionHistoryRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}): Promise<RecordAbandonmentResult> {
  const { attemptId, positionId, breachDirection, executionRepo, historyRepo, clock, ids } = params;

  const attempt = await executionRepo.getAttempt(attemptId);
  if (!attempt) return { kind: 'not-found' };

  if (attempt.positionId !== positionId) {
    throw new Error(`recordExecutionAbandonment: positionId mismatch for attempt ${attemptId}`);
  }

  if (attempt.lifecycleState.kind !== 'awaiting-signature') {
    return { kind: 'already-terminal', state: attempt.lifecycleState.kind };
  }

  if (attempt.breachDirection.kind !== breachDirection.kind) {
    throw new Error(`recordExecutionAbandonment: breachDirection mismatch for attempt ${attemptId}`);
  }

  await executionRepo.updateAttemptState(attemptId, { kind: 'abandoned' });

  await historyRepo.appendEvent({
    eventId: ids.generateId(),
    positionId: attempt.positionId,
    eventType: 'abandoned',
    breachDirection,
    occurredAt: clock.now(),
    lifecycleState: { kind: 'abandoned' },
  });

  return { kind: 'abandoned' };
}

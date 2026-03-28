import type {
  ExecutionRepository,
  ExecutionHistoryRepository,
  ClockPort,
  IdGeneratorPort,
} from '../../ports/index.js';
import type { PositionId, BreachDirection } from '@clmm/domain';

export type RecordAbandonmentResult =
  | { kind: 'abandoned' }
  | { kind: 'not-found' }
  | { kind: 'already-terminal'; state: string };

const TERMINAL_STATES = new Set(['confirmed', 'partial', 'abandoned']);

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

  if (TERMINAL_STATES.has(attempt.lifecycleState.kind)) {
    return { kind: 'already-terminal', state: attempt.lifecycleState.kind };
  }

  await executionRepo.updateAttemptState(attemptId, { kind: 'abandoned' });

  await historyRepo.appendEvent({
    eventId: ids.generateId(),
    positionId,
    eventType: 'abandoned',
    breachDirection,
    occurredAt: clock.now(),
    lifecycleState: { kind: 'abandoned' },
  });

  return { kind: 'abandoned' };
}

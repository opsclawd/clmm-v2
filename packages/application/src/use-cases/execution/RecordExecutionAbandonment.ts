import type {
  ExecutionRepository,
  ExecutionHistoryRepository,
  ClockPort,
  IdGeneratorPort,
} from '../../ports/index.js';
import type { PositionId, ExecutionOrigin, ExecutionLifecycleState } from '@clmm/domain';

export type RecordAbandonmentResult =
  | { kind: 'abandoned' }
  | { kind: 'not-found' }
  | { kind: 'already-terminal'; state: ExecutionLifecycleState['kind'] };

function originsMatch(a: ExecutionOrigin, b: ExecutionOrigin): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'qualified-breach' && b.kind === 'qualified-breach') {
    return a.breachDirection.kind === b.breachDirection.kind;
  }
  if (a.kind === 'regime-plan' && b.kind === 'regime-plan') {
    return a.planId === b.planId;
  }
  return false;
}

export async function recordExecutionAbandonment(params: {
  attemptId: string;
  positionId: PositionId;
  origin: ExecutionOrigin;
  executionRepo: ExecutionRepository;
  historyRepo: ExecutionHistoryRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}): Promise<RecordAbandonmentResult> {
  const { attemptId, positionId, origin, executionRepo, historyRepo, clock, ids } = params;

  const attempt = await executionRepo.getAttempt(attemptId);
  if (!attempt) return { kind: 'not-found' };

  if (attempt.positionId !== positionId) {
    throw new Error(`recordExecutionAbandonment: positionId mismatch for attempt ${attemptId}`);
  }

  if (attempt.lifecycleState.kind !== 'awaiting-signature') {
    return { kind: 'already-terminal', state: attempt.lifecycleState.kind };
  }

  if (!originsMatch(attempt.origin, origin)) {
    throw new Error(`recordExecutionAbandonment: origin mismatch for attempt ${attemptId}`);
  }

  await executionRepo.updateAttemptState(attemptId, { kind: 'abandoned' });

  await historyRepo.appendEvent({
    eventId: ids.generateId(),
    positionId: attempt.positionId,
    eventType: 'abandoned',
    origin,
    occurredAt: clock.now(),
    lifecycleState: { kind: 'abandoned' },
  });

  return { kind: 'abandoned' };
}

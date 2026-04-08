import type {
  ExecutionRepository,
  ExecutionHistoryRepository,
  ClockPort,
  IdGeneratorPort,
} from '../../ports/index.js';
import type { ExecutionLifecycleState } from '@clmm/domain';

export type RecordSignatureDeclineResult =
  | { kind: 'declined' }
  | { kind: 'not-found' }
  | { kind: 'already-terminal'; state: ExecutionLifecycleState['kind'] };

export async function recordSignatureDecline(params: {
  attemptId: string;
  executionRepo: ExecutionRepository;
  historyRepo: ExecutionHistoryRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}): Promise<RecordSignatureDeclineResult> {
  const { attemptId, executionRepo, historyRepo, clock, ids } = params;

  const attempt = await executionRepo.getAttempt(attemptId);
  if (!attempt) return { kind: 'not-found' };

  if (attempt.lifecycleState.kind !== 'awaiting-signature') {
    return { kind: 'already-terminal', state: attempt.lifecycleState.kind };
  }

  await executionRepo.updateAttemptState(attemptId, { kind: 'abandoned' });

  await historyRepo.appendEvent({
    eventId: ids.generateId(),
    positionId: attempt.positionId,
    eventType: 'signature-declined',
    breachDirection: attempt.breachDirection,
    occurredAt: clock.now(),
    lifecycleState: { kind: 'abandoned' },
  });

  return { kind: 'declined' };
}

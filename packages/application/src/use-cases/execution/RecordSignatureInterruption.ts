import type { ExecutionLifecycleState } from '@clmm/domain';
import type {
  ClockPort,
  ExecutionHistoryRepository,
  ExecutionRepository,
  IdGeneratorPort,
} from '../../ports/index.js';

export type RecordSignatureInterruptionInput = {
  readonly attemptId: string;
  readonly executionRepo: ExecutionRepository;
  readonly historyRepo: ExecutionHistoryRepository;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
};

export type RecordSignatureInterruptionResult =
  | { readonly kind: 'interrupted' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'already-terminal'; readonly state: ExecutionLifecycleState['kind'] };

export async function recordSignatureInterruption(
  input: RecordSignatureInterruptionInput,
): Promise<RecordSignatureInterruptionResult> {
  const attempt = await input.executionRepo.getAttempt(input.attemptId);
  if (!attempt) {
    return { kind: 'not-found' };
  }

  if (attempt.lifecycleState.kind !== 'awaiting-signature') {
    return { kind: 'already-terminal', state: attempt.lifecycleState.kind };
  }

  await input.historyRepo.appendEvent({
    eventId: input.ids.generateId(),
    positionId: attempt.positionId,
    eventType: 'signature-interrupted',
    breachDirection: attempt.breachDirection,
    occurredAt: input.clock.now(),
    lifecycleState: { kind: 'awaiting-signature' },
  });

  return { kind: 'interrupted' };
}

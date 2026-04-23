import type { ClockTimestamp } from '@clmm/domain';
import type {
  ClockPort,
  ExecutionHistoryRepository,
  ExecutionRepository,
  IdGeneratorPort,
} from '../../ports/index.js';

export type GetAwaitingSignaturePayloadInput = {
  readonly attemptId: string;
  readonly executionRepo: ExecutionRepository;
  readonly historyRepo: ExecutionHistoryRepository;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
};

export type GetAwaitingSignaturePayloadResult =
  | {
      readonly kind: 'found';
      readonly attemptId: string;
      readonly serializedPayload: Uint8Array;
      readonly payloadVersion: string;
      readonly lifecycleState: { readonly kind: 'awaiting-signature' };
      readonly signingExpiresAt?: ClockTimestamp;
    }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'not-signable'; readonly currentState: string }
  | { readonly kind: 'missing-payload'; readonly currentState: 'awaiting-signature' }
  | { readonly kind: 'expired'; readonly currentState: 'expired' };

export async function getAwaitingSignaturePayload(
  input: GetAwaitingSignaturePayloadInput,
): Promise<GetAwaitingSignaturePayloadResult> {
  const attempt = await input.executionRepo.getAttempt(input.attemptId);
  if (!attempt) {
    return { kind: 'not-found' };
  }

  if (attempt.lifecycleState.kind !== 'awaiting-signature') {
    return {
      kind: 'not-signable',
      currentState: attempt.lifecycleState.kind,
    };
  }

  const preparedPayload = await input.executionRepo.getPreparedPayload(input.attemptId);
  if (!preparedPayload) {
    return {
      kind: 'missing-payload',
      currentState: 'awaiting-signature',
    };
  }

  if (input.clock.now() >= preparedPayload.expiresAt) {
    await input.executionRepo.updateAttemptState(input.attemptId, { kind: 'expired' });
    await input.historyRepo.appendEvent({
      eventId: input.ids.generateId(),
      positionId: attempt.positionId,
      eventType: 'preview-expired',
      breachDirection: attempt.breachDirection,
      occurredAt: input.clock.now(),
      lifecycleState: { kind: 'expired' },
    });

    return {
      kind: 'expired',
      currentState: 'expired',
    };
  }

  return {
    kind: 'found',
    attemptId: input.attemptId,
    serializedPayload: preparedPayload.unsignedPayload,
    payloadVersion: preparedPayload.payloadVersion,
    lifecycleState: { kind: 'awaiting-signature' },
    signingExpiresAt: preparedPayload.expiresAt,
  };
}

import type {
  BreachDirection,
  ExecutionApprovalDto,
  ExecutionAttemptDto,
  ExecutionLifecycleState,
  ExecutionSigningPayloadDto,
  HistoryEventDto,
} from '@clmm/application/public';
import { fetchJson } from './http';

type ExecutionResponse = {
  execution: ExecutionAttemptDto;
};

type ExecutionApprovalResponse = {
  approval: ExecutionApprovalDto;
};

type ExecutionSigningPayloadResponse = {
  signingPayload: ExecutionSigningPayloadDto;
};

type ExecutionHistoryResponse = {
  history: HistoryEventDto[];
};

type SignatureMutationResponse = {
  state: string;
};

type SubmitExecutionResponse =
  | { result: 'pending' }
  | { result: 'confirmed' }
  | { result: 'failed' }
  | { result: 'partial'; confirmedSteps: Array<(typeof VALID_EXECUTION_STEP_KINDS)[number]> };

const VALID_BREACH_DIRECTIONS = ['lower-bound-breach', 'upper-bound-breach'] as const;
const VALID_EXECUTION_LIFECYCLE_STATES = [
  'previewed',
  'awaiting-signature',
  'submitted',
  'confirmed',
  'failed',
  'expired',
  'abandoned',
  'partial',
] as const;
const VALID_EXECUTION_STEP_KINDS = ['remove-liquidity', 'collect-fees', 'swap-assets'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBreachDirection(value: unknown): value is BreachDirection {
  return (
    isRecord(value) &&
    VALID_BREACH_DIRECTIONS.includes(value['kind'] as (typeof VALID_BREACH_DIRECTIONS)[number])
  );
}

function isExecutionLifecycleState(value: unknown): value is ExecutionLifecycleState {
  return (
    isRecord(value) &&
    VALID_EXECUTION_LIFECYCLE_STATES.includes(
      value['kind'] as (typeof VALID_EXECUTION_LIFECYCLE_STATES)[number],
    )
  );
}

function isTransactionReference(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['signature'] === 'string' &&
    isExecutionStepKind(value['stepKind'])
  );
}

function isExecutionStepKind(value: unknown): value is (typeof VALID_EXECUTION_STEP_KINDS)[number] {
  return (
    typeof value === 'string' &&
    VALID_EXECUTION_STEP_KINDS.includes(value as (typeof VALID_EXECUTION_STEP_KINDS)[number])
  );
}

function isExecutionAttemptDto(value: unknown): value is ExecutionAttemptDto {
  return (
    isRecord(value) &&
    typeof value['attemptId'] === 'string' &&
    typeof value['positionId'] === 'string' &&
    isBreachDirection(value['breachDirection']) &&
    isPostExitAssetPosture(value['postExitPosture']) &&
    isExecutionLifecycleState(value['lifecycleState']) &&
    Array.isArray(value['completedStepKinds']) &&
    value['completedStepKinds'].every(isExecutionStepKind) &&
    Array.isArray(value['transactionReferences']) &&
    value['transactionReferences'].every(isTransactionReference) &&
    typeof value['retryEligible'] === 'boolean' &&
    (value['retryReason'] == null || typeof value['retryReason'] === 'string')
  );
}

function isExecutionApprovalDto(value: unknown): value is ExecutionApprovalDto {
  return (
    isRecord(value) &&
    typeof value['attemptId'] === 'string' &&
    isExecutionLifecycleState(value['lifecycleState']) &&
    isBreachDirection(value['breachDirection'])
  );
}

function isExecutionSigningPayloadDto(value: unknown): value is ExecutionSigningPayloadDto {
  return (
    isRecord(value) &&
    typeof value['attemptId'] === 'string' &&
    typeof value['serializedPayload'] === 'string' &&
    value['serializedPayload'].length > 0 &&
    isExecutionLifecycleState(value['lifecycleState']) &&
    (value['signingExpiresAt'] == null || typeof value['signingExpiresAt'] === 'number')
  );
}

function isHistoryEventDto(value: unknown): value is HistoryEventDto {
  return (
    isRecord(value) &&
    typeof value['eventId'] === 'string' &&
    typeof value['positionId'] === 'string' &&
    typeof value['eventType'] === 'string' &&
    isBreachDirection(value['breachDirection']) &&
    typeof value['occurredAt'] === 'number' &&
    (value['transactionReference'] == null || isTransactionReference(value['transactionReference'])) &&
    value['note'] === 'off-chain operational history — not an on-chain receipt or attestation'
  );
}

function isPostExitAssetPosture(value: unknown): boolean {
  return isRecord(value) && (value['kind'] === 'exit-to-usdc' || value['kind'] === 'exit-to-sol');
}

function isHistoryEventDtoArray(value: unknown): value is HistoryEventDto[] {
  return Array.isArray(value) && value.every(isHistoryEventDto);
}

function isExecutionApprovalResponse(value: unknown): value is ExecutionApprovalResponse {
  return isRecord(value) && isExecutionApprovalDto(value['approval']);
}

function isExecutionSigningPayloadResponse(
  value: unknown,
): value is ExecutionSigningPayloadResponse {
  return isRecord(value) && isExecutionSigningPayloadDto(value['signingPayload']);
}

function isExecutionHistoryResponse(value: unknown): value is ExecutionHistoryResponse {
  return isRecord(value) && isHistoryEventDtoArray(value['history']);
}

function conflictDetailError(cause: unknown): Error | null {
  if (!(cause instanceof Error)) {
    return null;
  }

  const detailMatch = /^HTTP 409: (.+)$/.exec(cause.message);
  if (detailMatch?.[1] != null) {
    return new Error(detailMatch[1], { cause });
  }

  return cause.message.length > 0 ? new Error(cause.message, { cause }) : null;
}

function isSignatureDeclineResponse(
  value: unknown,
): value is SignatureMutationResponse & { declined: true } {
  return isRecord(value) && typeof value['state'] === 'string' && value['declined'] === true;
}

function isSignatureInterruptionResponse(
  value: unknown,
): value is SignatureMutationResponse & { interrupted: true } {
  return isRecord(value) && typeof value['state'] === 'string' && value['interrupted'] === true;
}

function isSubmitExecutionResponse(value: unknown): value is SubmitExecutionResponse {
  if (!isRecord(value) || typeof value['result'] !== 'string') {
    return false;
  }

  if (value['result'] === 'partial') {
    return Array.isArray(value['confirmedSteps']) && value['confirmedSteps'].every(isExecutionStepKind);
  }

  return value['result'] === 'pending' || value['result'] === 'confirmed' || value['result'] === 'failed';
}

type ApproveExecutionPreviewInput = {
  previewId: string;
  walletId: string;
  episodeId?: string;
  isTriggerDerivedApproval?: boolean;
};

export async function fetchExecution(attemptId: string): Promise<ExecutionAttemptDto> {
  try {
    const payload = (await fetchJson(`/executions/${attemptId}`)) as Partial<ExecutionResponse>;

    if (!isExecutionAttemptDto(payload.execution)) {
      throw new Error('Malformed execution response');
    }

    return payload.execution;
  } catch (cause: unknown) {
    throw new Error('Could not load execution attempt', { cause });
  }
}

export async function approveExecutionPreview(
  input: ApproveExecutionPreviewInput,
): Promise<ExecutionApprovalDto> {
  try {
    const payload = (await fetchJson('/executions/approve', {
      method: 'POST',
      body: JSON.stringify({
        previewId: input.previewId,
        walletId: input.walletId,
        ...(input.episodeId ? { episodeId: input.episodeId } : {}),
        ...(input.isTriggerDerivedApproval !== undefined
          ? { isTriggerDerivedApproval: input.isTriggerDerivedApproval }
          : {}),
      }),
    })) as Partial<ExecutionApprovalResponse>;

    if (!isExecutionApprovalResponse(payload)) {
      throw new Error('Malformed execution approval response');
    }

    return payload.approval;
  } catch (cause: unknown) {
    if (cause instanceof Error) {
      throw cause;
    }

    throw new Error('Could not approve execution preview', { cause });
  }
}

export async function fetchExecutionSigningPayload(
  attemptId: string,
): Promise<ExecutionSigningPayloadDto> {
  try {
    const payload = (await fetchJson(
      `/executions/${attemptId}/signing-payload`,
    )) as Partial<ExecutionSigningPayloadResponse>;

    if (!isExecutionSigningPayloadResponse(payload)) {
      throw new Error('Malformed execution signing payload response');
    }

    return payload.signingPayload;
  } catch (cause: unknown) {
    const conflictError = conflictDetailError(cause);
    if (conflictError) {
      throw conflictError;
    }

    throw new Error('Could not load execution signing payload', { cause });
  }
}

export async function recordSignatureDecline(
  attemptId: string,
): Promise<{ declined: true; state: string }> {
  try {
    const payload = (await fetchJson(`/executions/${attemptId}/decline-signature`, {
      method: 'POST',
    })) as unknown;

    if (!isSignatureDeclineResponse(payload)) {
      throw new Error('Malformed signature decline response');
    }

    return { declined: true, state: payload.state };
  } catch (cause: unknown) {
    throw new Error('Could not record signature decline', { cause });
  }
}

export async function recordSignatureInterruption(
  attemptId: string,
): Promise<{ interrupted: true; state: string }> {
  try {
    const payload = (await fetchJson(`/executions/${attemptId}/interrupt-signature`, {
      method: 'POST',
    })) as unknown;

    if (!isSignatureInterruptionResponse(payload)) {
      throw new Error('Malformed signature interruption response');
    }

    return { interrupted: true, state: payload.state };
  } catch (cause: unknown) {
    throw new Error('Could not record signature interruption', { cause });
  }
}

export async function fetchWalletExecutionHistory(walletId: string): Promise<HistoryEventDto[]> {
  try {
    const payload = (await fetchJson(
      `/executions/history/wallet/${walletId}`,
    )) as Partial<ExecutionHistoryResponse>;

    if (!isExecutionHistoryResponse(payload)) {
      throw new Error('Malformed execution history response');
    }

    return payload.history;
  } catch (cause: unknown) {
    throw new Error('Could not load wallet execution history', { cause });
  }
}

export async function submitExecution(
  attemptId: string,
  signedPayload: string,
  payloadVersion?: string,
): Promise<SubmitExecutionResponse> {
  try {
    const payload = (await fetchJson(`/executions/${attemptId}/submit`, {
      method: 'POST',
      body: JSON.stringify({
        signedPayload,
        ...(payloadVersion ? { payloadVersion } : {}),
      }),
    })) as Partial<SubmitExecutionResponse>;

    if (!isSubmitExecutionResponse(payload)) {
      throw new Error('Malformed execution submit response');
    }

    return payload;
  } catch (cause: unknown) {
    if (cause instanceof Error) {
      throw cause;
    }

    throw new Error('Could not submit execution', { cause });
  }
}

export async function abandonExecution(attemptId: string): Promise<void> {
  await fetchJson(`/executions/${attemptId}/abandon`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

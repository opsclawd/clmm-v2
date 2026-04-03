import type { ExecutionAttemptDto } from '@clmm/application/public';
import { fetchJson, getBffBaseUrl } from './http';

type ExecutionResponse = {
  execution: ExecutionAttemptDto;
};

export type PrepareResponse = {
  unsignedPayloadBase64: string;
  payloadVersion: string;
  expiresAt: number;
  requiresSignature: true;
};

export async function fetchExecution(attemptId: string): Promise<ExecutionAttemptDto> {
  try {
    const payload = (await fetchJson(`/executions/${attemptId}`)) as Partial<ExecutionResponse>;
    if (!payload.execution) {
      throw new Error('Malformed execution response');
    }
    return payload.execution;
  } catch (cause: unknown) {
    throw new Error('Could not load execution attempt', { cause });
  }
}

export async function prepareExecution(attemptId: string, walletId: string): Promise<PrepareResponse> {
  const response = await fetch(`${getBffBaseUrl()}/executions/${attemptId}/prepare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletId }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Prepare failed: HTTP ${response.status}${text ? `: ${text}` : ''}`);
  }

  return response.json() as Promise<PrepareResponse>;
}

export async function submitExecution(
  attemptId: string,
  signedPayload: string,
  payloadVersion: string,
): Promise<{ result: 'confirmed' | 'failed' | 'partial' | 'pending' }> {
  const response = await fetch(`${getBffBaseUrl()}/executions/${attemptId}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      signedPayload,
      payloadVersion,
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Submit failed: HTTP ${response.status}${text ? `: ${text}` : ''}`);
  }
  return response.json() as Promise<{ result: 'confirmed' | 'failed' | 'partial' | 'pending' }>;
}

export async function abandonExecution(attemptId: string): Promise<void> {
  const response = await fetch(`${getBffBaseUrl()}/executions/${attemptId}/abandon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    throw new Error(`Abandon failed: HTTP ${response.status}`);
  }
}

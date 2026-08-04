import {
  type EvidenceBundle,
  type EvidenceUnavailableReason,
  parseEvidenceBundle,
} from '@clmm/application/public';
import { getBffBaseUrl } from './http.js';

export type EvidenceResponse = {
  evidence: EvidenceBundle | null;
  unavailableReason?: EvidenceUnavailableReason | undefined;
};

export type PositionEvidenceRequest = {
  walletAddress: string;
  positionId: string;
};

const FETCH_TIMEOUT_MS = 10_000;

const VALID_REASONS: ReadonlySet<string> = new Set<EvidenceUnavailableReason>([
  'not-found',
  'store-unavailable',
  'config-error',
  'malformed',
  'upstream-error',
]);

function isAbortError(error: unknown): boolean {
  if (typeof error !== 'object' || error == null) return false;
  return (error as { name?: string }).name === 'AbortError';
}

function isUnavailableReason(value: unknown): value is EvidenceUnavailableReason {
  return typeof value === 'string' && VALID_REASONS.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

export async function fetchCurrentEvidence(
  externalSignal?: AbortSignal,
  position?: PositionEvidenceRequest,
): Promise<EvidenceResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  if (externalSignal?.aborted) {
    clearTimeout(timeoutId);
    controller.abort();
  }
  const onExternalAbort = () => {
    clearTimeout(timeoutId);
    controller.abort();
  };
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

  const path = position
    ? `/evidence/sol-usdc/${encodeURIComponent(position.walletAddress)}/${encodeURIComponent(position.positionId)}/current`
    : '/evidence/sol-usdc/current';
  const requestUrl = `${getBffBaseUrl()}${path}`;

  try {
    let response: Response;
    try {
      response = await fetch(requestUrl, {
        signal: controller.signal,
      });
    } catch (error: unknown) {
      if (isAbortError(error)) {
        throw new Error('Could not load evidence: request timed out');
      }
      throw new Error('Could not load evidence: network error');
    }

    if (!response.ok) {
      throw new Error(`Could not load evidence: HTTP ${response.status}`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Error('Could not load evidence: response body was not valid JSON');
    }

    if (!isRecord(body)) {
      throw new Error('Could not load evidence: malformed response');
    }

    const rawEvidence = body['evidence'];
    const rawReason = body['unavailableReason'];
    const unavailableReason = isUnavailableReason(rawReason) ? rawReason : undefined;

    if (rawEvidence === null) {
      if (unavailableReason === undefined) {
        throw new Error('Could not load evidence: malformed evidence block');
      }
      return { evidence: null, unavailableReason };
    }

    const evidence = parseEvidenceBundle(rawEvidence);
    if (!evidence) {
      throw new Error('Could not load evidence: malformed evidence block');
    }

    return { evidence, unavailableReason };
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

export async function fetchRawEvidence(
  runId: string,
  externalSignal?: AbortSignal,
): Promise<unknown> {
  const requestUrl = `${getBffBaseUrl()}/insights/sol-usdc/evidence/raw/${encodeURIComponent(runId)}`;
  let response: Response;

  try {
    response = await fetch(requestUrl, externalSignal ? { signal: externalSignal } : {});
  } catch (error: unknown) {
    if (isAbortError(error)) {
      throw new Error('Could not load raw evidence: request aborted');
    }
    throw new Error('Could not load raw evidence: network error');
  }

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Could not load raw evidence: HTTP ${response.status}`);
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new Error('Could not load raw evidence: response body was not valid JSON');
  }
}

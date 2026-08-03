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

  try {
    let response: Response;
    try {
      response = await fetch(`${getBffBaseUrl()}/evidence/sol-usdc/current`, {
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

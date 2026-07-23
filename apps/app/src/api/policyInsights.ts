import {
  type PolicyInsightBlock,
  type PolicyInsightsUnavailableReason,
  parsePolicyInsightBlock,
} from '@clmm/application/public';
import { getBffBaseUrl } from './http.js';

export type PolicyInsightsResponse = {
  policyInsight: PolicyInsightBlock | null;
  unavailableReason?: PolicyInsightsUnavailableReason | undefined;
};

const FETCH_TIMEOUT_MS = 10_000;

const VALID_REASONS: ReadonlySet<string> = new Set<PolicyInsightsUnavailableReason>([
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

function isUnavailableReason(value: unknown): value is PolicyInsightsUnavailableReason {
  return typeof value === 'string' && VALID_REASONS.has(value);
}

export async function fetchCurrentPolicyInsight(
  externalSignal?: AbortSignal,
): Promise<PolicyInsightsResponse> {
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
      response = await fetch(`${getBffBaseUrl()}/policy-insights/sol-usdc/current`, {
        signal: controller.signal,
      });
    } catch (error: unknown) {
      if (isAbortError(error)) {
        throw new Error('Could not load policy insights: request timed out');
      }
      throw new Error('Could not load policy insights: network error');
    }

    if (!response.ok) {
      throw new Error(`Could not load policy insights: HTTP ${response.status}`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Error('Could not load policy insights: response body was not valid JSON');
    }

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new Error('Could not load policy insights: malformed response');
    }

    const policyInsightRaw = (body as Record<string, unknown>)['policyInsight'];
    const unavailableReason = isUnavailableReason(
      (body as Record<string, unknown>)['unavailableReason'],
    )
      ? ((body as Record<string, unknown>)['unavailableReason'] as PolicyInsightsUnavailableReason)
      : undefined;

    if (policyInsightRaw === null) {
      return { policyInsight: null, unavailableReason };
    }

    const policyInsight = parsePolicyInsightBlock(policyInsightRaw);
    if (!policyInsight) {
      throw new Error('Could not load policy insights: malformed policyInsight block');
    }

    return { policyInsight, unavailableReason };
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

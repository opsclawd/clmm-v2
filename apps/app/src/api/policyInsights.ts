import {
  type PolicyInsightBlock,
  type PolicyInsightClmmPolicy,
  type PolicyInsightConfidence,
  type PolicyInsightDataQuality,
  type PolicyInsightFreshness,
  type PolicyInsightLevels,
  type PolicyInsightRecommendedAction,
  type PolicyInsightRiskLevel,
  type PolicyInsightStatus,
  type PolicyInsightsUnavailableReason,
} from '@clmm/application/public';
import { getBffBaseUrl } from './http.js';

export type PolicyInsightsResponse = {
  policyInsight: PolicyInsightBlock | null;
  unavailableReason?: PolicyInsightsUnavailableReason | undefined;
};

const FETCH_TIMEOUT_MS = 10_000;

const VALID_ACTIONS: ReadonlySet<string> = new Set<PolicyInsightRecommendedAction>([
  'hold',
  'watch',
  'tighten_range',
  'widen_range',
  'exit_range',
  'pause_rebalances',
]);
const VALID_CONFIDENCES: ReadonlySet<string> = new Set<PolicyInsightConfidence>([
  'low',
  'medium',
  'high',
]);
const VALID_RISK_LEVELS: ReadonlySet<string> = new Set<PolicyInsightRiskLevel>([
  'normal',
  'elevated',
  'critical',
]);
const VALID_DATA_QUALITIES: ReadonlySet<string> = new Set<PolicyInsightDataQuality>([
  'complete',
  'partial',
  'stale',
]);
const VALID_STATUSES: ReadonlySet<string> = new Set<PolicyInsightStatus>(['FRESH', 'STALE']);
const VALID_REASONS: ReadonlySet<string> = new Set<PolicyInsightsUnavailableReason>([
  'not-found',
  'store-unavailable',
  'config-error',
  'upstream-error',
]);

function isAbortError(error: unknown): boolean {
  if (typeof error !== 'object' || error == null) return false;
  return (error as { name?: string }).name === 'AbortError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'number' && Number.isFinite(v));
}

function isClmmPolicy(value: unknown): value is PolicyInsightClmmPolicy {
  if (!isRecord(value)) return false;
  if (typeof value['posture'] !== 'string') return false;
  if (typeof value['rangeBias'] !== 'string') return false;
  if (typeof value['rebalanceSensitivity'] !== 'string') return false;
  const pct = value['maxCapitalDeploymentPct'];
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return false;
  if (pct < 0 || pct > 1) return false;
  return true;
}

function isLevels(value: unknown): value is PolicyInsightLevels {
  if (!isRecord(value)) return false;
  if (!isNumberArray(value['supports'])) return false;
  if (!isNumberArray(value['resistances'])) return false;
  return true;
}

function parseFreshness(value: unknown, fallbackIso?: string): PolicyInsightFreshness | null {
  if (!isRecord(value)) return null;
  if (typeof value['stale'] !== 'boolean') return null;
  const stale = value['stale'];
  const capturedAtUnixMsRaw = value['capturedAtUnixMs'];
  let capturedAtUnixMs: number | null = null;
  if (typeof capturedAtUnixMsRaw === 'number' && Number.isFinite(capturedAtUnixMsRaw)) {
    capturedAtUnixMs = capturedAtUnixMsRaw;
  } else {
    const capturedAtIso = value['capturedAtIso'];
    if (typeof capturedAtIso === 'string') {
      const parsed = Date.parse(capturedAtIso);
      if (Number.isFinite(parsed)) capturedAtUnixMs = parsed;
    }
    if (capturedAtUnixMs === null && typeof fallbackIso === 'string') {
      const parsed = Date.parse(fallbackIso);
      if (Number.isFinite(parsed)) capturedAtUnixMs = parsed;
    }
  }
  if (capturedAtUnixMs === null) return null;
  return { capturedAtUnixMs, stale };
}

function parsePolicyInsightBlock(value: unknown): PolicyInsightBlock | null {
  if (!isRecord(value)) return null;
  if (value['schemaVersion'] !== '1.0') return null;
  if (value['pair'] !== 'SOL/USDC') return null;
  if (value['source'] !== 'openclaw') return null;
  if (typeof value['asOf'] !== 'string') return null;
  if (typeof value['runId'] !== 'string') return null;
  if (!VALID_STATUSES.has(value['status'] as string)) return null;
  if (typeof value['marketRegime'] !== 'string') return null;
  if (typeof value['fundamentalRegime'] !== 'string') return null;
  if (!VALID_ACTIONS.has(value['recommendedAction'] as string)) return null;
  if (!VALID_CONFIDENCES.has(value['confidence'] as string)) return null;
  if (!VALID_RISK_LEVELS.has(value['riskLevel'] as string)) return null;
  if (!VALID_DATA_QUALITIES.has(value['dataQuality'] as string)) return null;
  if (!isClmmPolicy(value['clmmPolicy'])) return null;
  if (!isLevels(value['levels'])) return null;
  if (!isStringArray(value['reasoning'])) return null;
  if (!isStringArray(value['sourceRefs'])) return null;
  if (typeof value['expiresAt'] !== 'string') return null;
  if (typeof value['payloadHash'] !== 'string') return null;
  if (typeof value['receivedAtIso'] !== 'string') return null;
  const freshness = parseFreshness(
    value['freshness'],
    typeof value['asOf'] === 'string' ? value['asOf'] : undefined,
  );
  if (!freshness) return null;
  return {
    schemaVersion: '1.0',
    pair: 'SOL/USDC',
    asOf: value['asOf'],
    source: 'openclaw',
    runId: value['runId'],
    status: value['status'] as PolicyInsightStatus,
    marketRegime: value['marketRegime'],
    fundamentalRegime: value['fundamentalRegime'],
    recommendedAction: value['recommendedAction'] as PolicyInsightRecommendedAction,
    confidence: value['confidence'] as PolicyInsightConfidence,
    riskLevel: value['riskLevel'] as PolicyInsightRiskLevel,
    dataQuality: value['dataQuality'] as PolicyInsightDataQuality,
    clmmPolicy: value['clmmPolicy'],
    levels: value['levels'],
    reasoning: value['reasoning'],
    sourceRefs: value['sourceRefs'],
    expiresAt: value['expiresAt'],
    payloadHash: value['payloadHash'],
    receivedAtIso: value['receivedAtIso'],
    freshness,
  };
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

    if (!isRecord(body)) {
      throw new Error('Could not load policy insights: malformed response');
    }

    const policyInsightRaw = body['policyInsight'];
    const unavailableReason = isUnavailableReason(body['unavailableReason'])
      ? body['unavailableReason']
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

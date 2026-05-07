import type {
  PolicyInsightBlock,
  PolicyInsightClmmPolicy,
  PolicyInsightConfidence,
  PolicyInsightDataQuality,
  PolicyInsightFreshness,
  PolicyInsightLevels,
  PolicyInsightRecommendedAction,
  PolicyInsightRiskLevel,
  PolicyInsightStatus,
} from '@clmm/application/public';
import { getBffBaseUrl } from './http.js';

export type PolicyInsightsUnavailableReason =
  | 'not-found'
  | 'store-unavailable'
  | 'config-error'
  | 'upstream-error';

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
  return true;
}

function isLevels(value: unknown): value is PolicyInsightLevels {
  if (!isRecord(value)) return false;
  if (!isNumberArray(value['supports'])) return false;
  if (!isNumberArray(value['resistances'])) return false;
  return true;
}

function isFreshness(value: unknown): value is PolicyInsightFreshness {
  if (!isRecord(value)) return false;
  if (typeof value['capturedAtUnixMs'] !== 'number') return false;
  if (!Number.isFinite(value['capturedAtUnixMs'])) return false;
  if (typeof value['stale'] !== 'boolean') return false;
  return true;
}

function isPolicyInsightBlock(value: unknown): value is PolicyInsightBlock {
  if (!isRecord(value)) return false;
  if (value['schemaVersion'] !== '1.0') return false;
  if (value['pair'] !== 'SOL/USDC') return false;
  if (value['source'] !== 'openclaw') return false;
  if (typeof value['asOf'] !== 'string') return false;
  if (typeof value['runId'] !== 'string') return false;
  if (!VALID_STATUSES.has(value['status'] as string)) return false;
  if (typeof value['marketRegime'] !== 'string') return false;
  if (typeof value['fundamentalRegime'] !== 'string') return false;
  if (!VALID_ACTIONS.has(value['recommendedAction'] as string)) return false;
  if (!VALID_CONFIDENCES.has(value['confidence'] as string)) return false;
  if (!VALID_RISK_LEVELS.has(value['riskLevel'] as string)) return false;
  if (!VALID_DATA_QUALITIES.has(value['dataQuality'] as string)) return false;
  if (!isClmmPolicy(value['clmmPolicy'])) return false;
  if (!isLevels(value['levels'])) return false;
  if (!isStringArray(value['reasoning'])) return false;
  if (!isStringArray(value['sourceRefs'])) return false;
  if (typeof value['expiresAt'] !== 'string') return false;
  if (typeof value['payloadHash'] !== 'string') return false;
  if (typeof value['receivedAtIso'] !== 'string') return false;
  if (!isFreshness(value['freshness'])) return false;
  return true;
}

function isUnavailableReason(value: unknown): value is PolicyInsightsUnavailableReason {
  return typeof value === 'string' && VALID_REASONS.has(value);
}

export async function fetchCurrentPolicyInsight(): Promise<PolicyInsightsResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${getBffBaseUrl()}/policy-insights/sol-usdc/current`, {
      signal: controller.signal,
    });
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (isAbortError(error)) {
      throw new Error('Could not load policy insights: request timed out');
    }
    throw new Error(
      `Could not load policy insights: ${error instanceof Error ? error.message : 'network error'}`,
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => `HTTP ${response.status}`);
    clearTimeout(timeoutId);
    throw new Error(`Could not load policy insights: ${detail || response.statusText}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    clearTimeout(timeoutId);
    throw new Error('Could not load policy insights: response body was not valid JSON');
  }
  clearTimeout(timeoutId);

  if (!isRecord(body)) {
    throw new Error('Could not load policy insights: malformed response');
  }

  const policyInsight = body['policyInsight'];
  const unavailableReason = isUnavailableReason(body['unavailableReason'])
    ? body['unavailableReason']
    : undefined;

  if (policyInsight === null) {
    return { policyInsight: null, unavailableReason };
  }

  if (!isPolicyInsightBlock(policyInsight)) {
    throw new Error('Could not load policy insights: malformed policyInsight block');
  }

  return { policyInsight, unavailableReason };
}

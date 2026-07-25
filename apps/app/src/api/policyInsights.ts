import {
  type PolicyInsightBlock,
  type PolicyInsightClmmPolicy,
  type PolicyInsightDataQuality,
  type PolicyInsightEvidence,
  type PolicyInsightFreshness,
  type PolicyInsightFreshnessStatus,
  type PolicyInsightFundamentalRegime,
  type PolicyInsightLevels,
  type PolicyInsightMarketRegime,
  type PolicyInsightPositionScope,
  type PolicyInsightPosture,
  type PolicyInsightRecommendedAction,
  type PolicyInsightRiskLevel,
  type PolicyInsightSelectionStatus,
  type PolicyInsightsUnavailableReason,
  type PolicyInsightWarning,
} from '@clmm/application/public';
import { getBffBaseUrl } from './http.js';

export type PolicyInsightsResponse = {
  policyInsight: PolicyInsightBlock | null;
  unavailableReason?: PolicyInsightsUnavailableReason | undefined;
};

const FETCH_TIMEOUT_MS = 10_000;

const VALID_MARKET_REGIMES: ReadonlySet<string> = new Set<PolicyInsightMarketRegime>([
  'UP',
  'DOWN',
  'CHOP',
]);
const VALID_FUNDAMENTAL_REGIMES: ReadonlySet<string> = new Set<PolicyInsightFundamentalRegime>([
  'BULLISH',
  'BEARISH',
  'NEUTRAL',
  'UNKNOWN',
]);
const VALID_POSTURES: ReadonlySet<string> = new Set<PolicyInsightPosture>([
  'AGGRESSIVE',
  'MODERATELY_AGGRESSIVE',
  'NEUTRAL',
  'DEFENSIVE',
  'PAUSED',
]);
const VALID_ACTIONS: ReadonlySet<string> = new Set<PolicyInsightRecommendedAction>([
  'HOLD',
  'MONITOR_LOWER_BOUND',
  'MONITOR_UPPER_BOUND',
  'EXIT_TO_USDC',
  'EXIT_TO_SOL',
  'STAND_DOWN',
]);
const VALID_RISK_LEVELS: ReadonlySet<string> = new Set<PolicyInsightRiskLevel>([
  'NORMAL',
  'ELEVATED',
  'CRITICAL',
]);
const VALID_RANGE_BIASES: ReadonlySet<string> = new Set(['TIGHT', 'MEDIUM', 'WIDE', 'PASSIVE']);
const VALID_REBALANCE_SENSITIVITIES: ReadonlySet<string> = new Set([
  'LOW',
  'NORMAL',
  'HIGH',
  'PAUSED',
]);
const VALID_DATA_QUALITIES: ReadonlySet<string> = new Set<PolicyInsightDataQuality>([
  'COMPLETE',
  'PARTIAL',
  'STALE',
]);
const VALID_SELECTION_STATUSES: ReadonlySet<string> = new Set<PolicyInsightSelectionStatus>([
  'FULL',
  'PARTIAL',
  'DEGRADED',
]);
const VALID_FRESHNESS_STATUSES: ReadonlySet<string> = new Set<PolicyInsightFreshnessStatus>([
  'FRESH',
  'STALE',
]);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isClmmPolicy(value: unknown): value is PolicyInsightClmmPolicy {
  if (!isRecord(value)) return false;
  if (typeof value['rangeBias'] !== 'string' || !VALID_RANGE_BIASES.has(value['rangeBias']))
    return false;
  if (
    typeof value['rebalanceSensitivity'] !== 'string' ||
    !VALID_REBALANCE_SENSITIVITIES.has(value['rebalanceSensitivity'])
  )
    return false;
  const bps = value['maxCapitalDeploymentBps'];
  if (typeof bps !== 'number' || !Number.isInteger(bps)) return false;
  if (bps < 0 || bps > 10000) return false;
  return true;
}

const POSITIVE_DECIMAL_REGEX = /^(0|[1-9]\d*)(\.\d+)?$/;

function isLevels(value: unknown): value is PolicyInsightLevels {
  if (!isRecord(value)) return false;
  if (!isStringArray(value['supportsUsdcPerSol'])) return false;
  if (!isStringArray(value['resistancesUsdcPerSol'])) return false;
  if (!value['supportsUsdcPerSol'].every((s) => POSITIVE_DECIMAL_REGEX.test(s))) return false;
  if (!value['resistancesUsdcPerSol'].every((r) => POSITIVE_DECIMAL_REGEX.test(r))) return false;
  return true;
}

function isPositionScope(value: unknown): value is PolicyInsightPositionScope {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  if (value['network'] !== 'solana-mainnet') return false;
  if (typeof value['walletAddress'] !== 'string' || value['walletAddress'].length === 0)
    return false;
  if (typeof value['whirlpoolAddress'] !== 'string' || value['whirlpoolAddress'].length === 0)
    return false;
  if (typeof value['positionId'] !== 'string' || value['positionId'].length === 0) return false;
  return true;
}

function isEvidence(value: unknown): value is PolicyInsightEvidence {
  if (!isRecord(value)) return false;
  if (
    typeof value['selectionStatus'] !== 'string' ||
    !VALID_SELECTION_STATUSES.has(value['selectionStatus'])
  )
    return false;
  if (typeof value['selectionPolicyVersion'] !== 'string') return false;
  if (!Array.isArray(value['selectedBundleRefs'])) return false;
  if (!Array.isArray(value['selectedSourceRefs'])) return false;
  return true;
}

function isFreshness(value: unknown): value is PolicyInsightFreshness {
  if (!isRecord(value)) return false;
  if (typeof value['status'] !== 'string' || !VALID_FRESHNESS_STATUSES.has(value['status']))
    return false;
  if (typeof value['evaluatedAt'] !== 'string') return false;
  if (
    typeof value['ageSeconds'] !== 'number' ||
    !Number.isInteger(value['ageSeconds']) ||
    value['ageSeconds'] < 0
  )
    return false;
  return true;
}

function isWarnings(value: unknown): value is PolicyInsightWarning[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (w) => isRecord(w) && typeof w['code'] === 'string' && typeof w['message'] === 'string',
  );
}

function validatePolicyInsightBlock(value: unknown): PolicyInsightBlock | null {
  if (!isRecord(value)) return null;

  if (value['schemaVersion'] !== 'policy-insight.v1') return null;
  if (typeof value['insightId'] !== 'string') return null;
  if (typeof value['rulesetVersion'] !== 'string') return null;
  if (value['pair'] !== 'SOL/USDC') return null;
  if (!isPositionScope(value['position'])) return null;

  if (typeof value['generatedAt'] !== 'string') return null;
  if (typeof value['asOf'] !== 'string') return null;
  if (typeof value['expiresAt'] !== 'string') return null;

  if (typeof value['marketRegime'] !== 'string' || !VALID_MARKET_REGIMES.has(value['marketRegime']))
    return null;
  if (
    typeof value['fundamentalRegime'] !== 'string' ||
    !VALID_FUNDAMENTAL_REGIMES.has(value['fundamentalRegime'])
  )
    return null;
  if (typeof value['posture'] !== 'string' || !VALID_POSTURES.has(value['posture'])) return null;
  if (
    typeof value['recommendedAction'] !== 'string' ||
    !VALID_ACTIONS.has(value['recommendedAction'])
  )
    return null;
  if (typeof value['riskLevel'] !== 'string' || !VALID_RISK_LEVELS.has(value['riskLevel']))
    return null;

  if (!isClmmPolicy(value['clmmPolicy'])) return null;
  if (!isLevels(value['levels'])) return null;
  if (!isEvidence(value['evidence'])) return null;

  const confidenceBps = value['confidenceBps'];
  if (
    typeof confidenceBps !== 'number' ||
    !Number.isInteger(confidenceBps) ||
    confidenceBps < 0 ||
    confidenceBps > 10000
  )
    return null;

  if (typeof value['dataQuality'] !== 'string' || !VALID_DATA_QUALITIES.has(value['dataQuality']))
    return null;

  if (!isStringArray(value['reasonCodes'])) return null;
  if (typeof value['reasoning'] !== 'string') return null;
  if (!isWarnings(value['warnings'])) return null;
  if (!isFreshness(value['freshness'])) return null;

  return value as unknown as PolicyInsightBlock;
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

    const policyInsight = validatePolicyInsightBlock(policyInsightRaw);
    if (!policyInsight) {
      throw new Error('Could not load policy insights: malformed policyInsight block');
    }

    return { policyInsight, unavailableReason };
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

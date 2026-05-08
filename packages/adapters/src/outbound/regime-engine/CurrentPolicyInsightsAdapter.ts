import type {
  ObservabilityPort,
  PolicyInsightBlock,
  PolicyInsightClmmPolicy,
  PolicyInsightConfidence,
  PolicyInsightDataQuality,
  PolicyInsightFreshness,
  PolicyInsightLevels,
  PolicyInsightRecommendedAction,
  PolicyInsightRiskLevel,
  PolicyInsightStatus,
  PolicyInsightsReadResult,
  PolicyInsightsReadPort,
} from '@clmm/application';

const FETCH_TIMEOUT_MS = 2000;

const VALID_ACTIONS: ReadonlySet<string> = new Set([
  'hold',
  'watch',
  'tighten_range',
  'widen_range',
  'exit_range',
  'pause_rebalances',
]);
const VALID_CONFIDENCES: ReadonlySet<string> = new Set(['low', 'medium', 'high']);
const VALID_RISK_LEVELS: ReadonlySet<string> = new Set(['normal', 'elevated', 'critical']);
const VALID_DATA_QUALITIES: ReadonlySet<string> = new Set(['complete', 'partial', 'stale']);
const VALID_STATUSES: ReadonlySet<string> = new Set(['FRESH', 'STALE']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null | undefined {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  return undefined;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return null;
    out.push(item);
  }
  return out;
}

function numberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const out: number[] = [];
  for (const item of value) {
    if (typeof item !== 'number' || !Number.isFinite(item)) return null;
    out.push(item);
  }
  return out;
}

function parseClmmPolicy(raw: unknown): PolicyInsightClmmPolicy | null {
  if (!isRecord(raw)) return null;
  const posture = raw['posture'];
  const rangeBias = raw['rangeBias'];
  const rebalanceSensitivity = raw['rebalanceSensitivity'];
  const maxCapitalDeploymentPct = raw['maxCapitalDeploymentPct'];
  if (typeof posture !== 'string') return null;
  if (typeof rangeBias !== 'string') return null;
  if (typeof rebalanceSensitivity !== 'string') return null;
  if (typeof maxCapitalDeploymentPct !== 'number' || !Number.isFinite(maxCapitalDeploymentPct)) {
    return null;
  }
  if (maxCapitalDeploymentPct < 0 || maxCapitalDeploymentPct > 1) return null;
  return { posture, rangeBias, rebalanceSensitivity, maxCapitalDeploymentPct };
}

function parseLevels(raw: unknown): PolicyInsightLevels | null {
  if (!isRecord(raw)) return null;
  const supports = numberArray(raw['supports']);
  const resistances = numberArray(raw['resistances']);
  if (!supports || !resistances) return null;
  return { supports, resistances };
}

function parseFreshness(raw: unknown, fallbackIso: string): PolicyInsightFreshness | null {
  if (!isRecord(raw)) return null;
  const staleRaw = raw['stale'];
  if (typeof staleRaw !== 'boolean') return null;
  const stale = staleRaw;
  let capturedAtUnixMs: number | null = null;
  const capturedAtUnixMsRaw = raw['capturedAtUnixMs'];
  if (typeof capturedAtUnixMsRaw === 'number' && Number.isFinite(capturedAtUnixMsRaw)) {
    capturedAtUnixMs = capturedAtUnixMsRaw;
  } else {
    const capturedAtIsoRaw = nullableString(raw['capturedAtIso']);
    if (typeof capturedAtIsoRaw === 'string') {
      const parsed = Date.parse(capturedAtIsoRaw);
      if (Number.isFinite(parsed)) capturedAtUnixMs = parsed;
    }
  }
  if (capturedAtUnixMs == null) {
    const parsed = Date.parse(fallbackIso);
    if (!Number.isFinite(parsed)) return null;
    capturedAtUnixMs = parsed;
  }
  return { capturedAtUnixMs, stale };
}

function parseUpstream(data: unknown): PolicyInsightBlock | null {
  if (!isRecord(data)) return null;
  if (data['schemaVersion'] !== '1.0') return null;
  if (data['pair'] !== 'SOL/USDC') return null;
  if (data['source'] !== 'openclaw') return null;
  const asOf = data['asOf'];
  const runId = data['runId'];
  const status = data['status'];
  const marketRegime = data['marketRegime'];
  const fundamentalRegime = data['fundamentalRegime'];
  const actionRaw = data['recommendedAction'];
  const confidenceRaw = data['confidence'];
  const riskLevelRaw = data['riskLevel'];
  const dataQualityRaw = data['dataQuality'];
  if (typeof asOf !== 'string') return null;
  if (typeof runId !== 'string') return null;
  if (typeof status !== 'string' || !VALID_STATUSES.has(status)) return null;
  if (typeof marketRegime !== 'string') return null;
  if (typeof fundamentalRegime !== 'string') return null;
  if (typeof actionRaw !== 'string' || !VALID_ACTIONS.has(actionRaw)) return null;
  if (typeof confidenceRaw !== 'string' || !VALID_CONFIDENCES.has(confidenceRaw)) return null;
  if (typeof riskLevelRaw !== 'string' || !VALID_RISK_LEVELS.has(riskLevelRaw)) return null;
  if (typeof dataQualityRaw !== 'string' || !VALID_DATA_QUALITIES.has(dataQualityRaw)) return null;
  const clmmPolicy = parseClmmPolicy(data['clmmPolicy']);
  if (!clmmPolicy) return null;
  const levels = parseLevels(data['levels']);
  if (!levels) return null;
  const reasoning = stringArray(data['reasoning']);
  const sourceRefs = stringArray(data['sourceRefs']);
  if (!reasoning || !sourceRefs) return null;
  const expiresAt = data['expiresAt'];
  const payloadHash = data['payloadHash'];
  const receivedAtIso = data['receivedAtIso'];
  if (typeof expiresAt !== 'string') return null;
  if (typeof payloadHash !== 'string') return null;
  if (typeof receivedAtIso !== 'string') return null;
  const freshness = parseFreshness(data['freshness'], asOf);
  if (!freshness) return null;

  return {
    schemaVersion: '1.0',
    pair: 'SOL/USDC',
    asOf,
    source: 'openclaw',
    runId,
    status: status as PolicyInsightStatus,
    marketRegime,
    fundamentalRegime,
    recommendedAction: actionRaw as PolicyInsightRecommendedAction,
    confidence: confidenceRaw as PolicyInsightConfidence,
    riskLevel: riskLevelRaw as PolicyInsightRiskLevel,
    dataQuality: dataQualityRaw as PolicyInsightDataQuality,
    clmmPolicy,
    levels,
    reasoning,
    sourceRefs,
    expiresAt,
    payloadHash,
    receivedAtIso,
    freshness,
  };
}

export class CurrentPolicyInsightsAdapter implements PolicyInsightsReadPort {
  constructor(
    private readonly baseUrl: string | null,
    private readonly observability: ObservabilityPort,
  ) {}

  async fetchCurrent(): Promise<PolicyInsightsReadResult> {
    if (!this.baseUrl) {
      this.observability.log(
        'warn',
        'PolicyInsights read disabled — no REGIME_ENGINE_BASE_URL configured',
      );
      return { kind: 'config-error' };
    }

    let url: URL;
    try {
      url = new URL(`${this.baseUrl.replace(/\/+$/, '')}/v1/insights/sol-usdc/current`);
    } catch {
      this.observability.log('warn', 'PolicyInsights base URL is malformed', {
        baseUrl: this.baseUrl,
      });
      return { kind: 'config-error' };
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      this.observability.log('warn', 'PolicyInsights base URL uses disallowed protocol', {
        protocol: url.protocol,
      });
      return { kind: 'config-error' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      let response: Response;
      try {
        response = await fetch(url.toString(), { signal: controller.signal });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.observability.log('warn', 'PolicyInsights fetch network error', { message });
        return { kind: 'upstream-error' };
      }

      if (response.status === 200) {
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          this.observability.log('warn', 'PolicyInsights response was not valid JSON');
          return { kind: 'upstream-error' };
        }
        const block = parseUpstream(body);
        if (!block) {
          this.observability.log('warn', 'PolicyInsights response failed shape validation');
          return { kind: 'upstream-error' };
        }
        return { kind: 'block', block };
      }

      if (response.status === 404) {
        const envelope = await this.readErrorEnvelope(response);
        if (!envelope || envelope.code === 'INSIGHT_NOT_FOUND' || envelope.code == null) {
          return { kind: 'not-found' };
        }
        this.observability.log('warn', 'PolicyInsights upstream 404 with unexpected code', {
          envelope,
        });
        return { kind: 'not-found' };
      }

      if (response.status === 503) {
        this.observability.log('warn', 'PolicyInsights upstream 503 store unavailable');
        return { kind: 'store-unavailable' };
      }

      this.observability.log('warn', 'PolicyInsights upstream non-2xx', {
        status: response.status,
      });
      return { kind: 'upstream-error' };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readErrorEnvelope(
    response: Response,
  ): Promise<{ code?: string; message?: string } | null> {
    try {
      const body: unknown = await response.json();
      if (!isRecord(body)) return null;
      const err = body['error'];
      const out: { code?: string; message?: string } = {};
      if (isRecord(err)) {
        if (typeof err['code'] === 'string') out.code = err['code'];
        if (typeof err['message'] === 'string') out.message = err['message'];
      }
      return out;
    } catch {
      return null;
    }
  }
}

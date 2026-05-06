import type {
  ObservabilityPort,
  RegimeReadPort,
  RegimeReadResult,
  RegimeBlock,
  RegimeReason,
  RegimeReasonSeverity,
} from '@clmm/application';
import type { MarketRegime, ClmmSuitabilityStatus } from '@clmm/domain';

const FETCH_TIMEOUT_MS = 2000;

const VALID_REGIMES: ReadonlySet<MarketRegime> = new Set(['UP', 'DOWN', 'CHOP']);
const VALID_STATUSES: ReadonlySet<ClmmSuitabilityStatus> = new Set([
  'ALLOWED',
  'CAUTION',
  'BLOCKED',
  'UNKNOWN',
]);
const VALID_SEVERITIES: ReadonlySet<RegimeReasonSeverity> = new Set(['ERROR', 'WARN', 'INFO']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseReasons(raw: unknown): RegimeReason[] | null {
  if (!Array.isArray(raw)) return null;
  const out: RegimeReason[] = [];
  for (const item of raw) {
    if (!isRecord(item)) return null;
    const sev = item['severity'];
    const text = item['text'];
    if (typeof sev !== 'string' || !VALID_SEVERITIES.has(sev as RegimeReasonSeverity)) return null;
    if (typeof text !== 'string') return null;
    const code = item['code'];
    out.push({
      severity: sev as RegimeReasonSeverity,
      text,
      ...(typeof code === 'string' ? { code } : {}),
    });
  }
  return out;
}

function parseUpstream(data: unknown): RegimeBlock | null {
  if (!isRecord(data)) return null;

  const regime = data['regime'];
  if (typeof regime !== 'string' || !VALID_REGIMES.has(regime as MarketRegime)) return null;

  const trendStrength = data['trendStrength'];
  const volRatio = data['volRatio'];
  if (typeof trendStrength !== 'number' || !Number.isFinite(trendStrength)) return null;
  if (typeof volRatio !== 'number' || !Number.isFinite(volRatio)) return null;

  const suit = data['clmmSuitability'];
  if (!isRecord(suit)) return null;
  const status = suit['status'];
  if (typeof status !== 'string' || !VALID_STATUSES.has(status as ClmmSuitabilityStatus))
    return null;
  const suitReasons = parseReasons(suit['reasons']);
  if (!suitReasons) return null;

  const marketReasons = parseReasons(data['marketReasons']);
  if (!marketReasons) return null;

  const freshness = data['freshness'];
  if (!isRecord(freshness)) return null;
  const capturedAtIso = freshness['capturedAtIso'];
  const softStale = freshness['softStale'];
  const hardStale = freshness['hardStale'];
  if (typeof capturedAtIso !== 'string') return null;
  if (typeof softStale !== 'boolean' || typeof hardStale !== 'boolean') return null;
  const capturedAtUnixMs = Date.parse(capturedAtIso);
  if (!Number.isFinite(capturedAtUnixMs)) return null;

  const metadataRaw = data['metadata'];
  const metadata = isRecord(metadataRaw)
    ? {
        ...(typeof metadataRaw['source'] === 'string' ? { source: metadataRaw['source'] } : {}),
        ...(typeof metadataRaw['network'] === 'string' ? { network: metadataRaw['network'] } : {}),
        ...(typeof metadataRaw['symbol'] === 'string' ? { symbol: metadataRaw['symbol'] } : {}),
        ...(typeof metadataRaw['timeframe'] === 'string'
          ? { timeframe: metadataRaw['timeframe'] }
          : {}),
      }
    : undefined;

  return {
    regime: regime as MarketRegime,
    trendStrength,
    volRatio,
    clmmSuitability: { status: status as ClmmSuitabilityStatus, reasons: suitReasons },
    marketReasons,
    freshness: { capturedAtUnixMs, softStale, hardStale },
    ...(metadata ? { metadata } : {}),
  };
}

export class CurrentRegimeAdapter implements RegimeReadPort {
  constructor(
    private readonly baseUrl: string | null,
    private readonly observability: ObservabilityPort,
  ) {}

  async fetchCurrent(params: {
    symbol: string;
    source: string;
    network: string;
    poolAddress: string;
    timeframe: string;
  }): Promise<RegimeReadResult> {
    if (!this.baseUrl) {
      this.observability.log('warn', 'Regime read disabled — no REGIME_ENGINE_BASE_URL configured');
      return { kind: 'config-error' };
    }

    let url: URL;
    try {
      url = new URL(`${this.baseUrl.replace(/\/+$/, '')}/v1/regime/current`);
    } catch {
      this.observability.log('warn', 'Regime base URL is malformed', {
        baseUrl: this.baseUrl,
      });
      return { kind: 'config-error' };
    }
    url.searchParams.set('symbol', params.symbol);
    url.searchParams.set('source', params.source);
    url.searchParams.set('network', params.network);
    url.searchParams.set('poolAddress', params.poolAddress);
    url.searchParams.set('timeframe', params.timeframe);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url.toString(), { signal: controller.signal });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.observability.log('warn', 'Regime fetch network error', { message });
      return { kind: 'upstream-error' };
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 200) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        this.observability.log('warn', 'Regime response was not valid JSON');
        return { kind: 'upstream-error' };
      }
      const block = parseUpstream(body);
      if (!block) {
        this.observability.log('warn', 'Regime response failed shape validation');
        return { kind: 'upstream-error' };
      }
      return { kind: 'block', block };
    }

    if (response.status === 404) {
      const envelope = await this.readErrorEnvelope(response);
      if (envelope?.code === 'CANDLES_NOT_FOUND') {
        return { kind: 'not-found' };
      }
      this.observability.log('warn', 'Regime upstream 404 with unexpected code', { envelope });
      return { kind: 'upstream-error' };
    }

    if (response.status === 400) {
      const envelope = await this.readErrorEnvelope(response);
      if (envelope?.code === 'VALIDATION_ERROR') {
        this.observability.log('warn', 'Regime upstream rejected request as VALIDATION_ERROR', {
          envelope,
        });
        return { kind: 'config-error' };
      }
      this.observability.log('warn', 'Regime upstream 400 with unexpected code', { envelope });
      return { kind: 'upstream-error' };
    }

    this.observability.log('warn', 'Regime upstream non-2xx', { status: response.status });
    return { kind: 'upstream-error' };
  }

  private async readErrorEnvelope(
    response: Response,
  ): Promise<{ code?: string; message?: string } | null> {
    try {
      const body = (await response.json()) as unknown;
      if (!isRecord(body)) return null;
      const out: { code?: string; message?: string } = {};
      if (typeof body['code'] === 'string') out.code = body['code'];
      if (typeof body['message'] === 'string') out.message = body['message'];
      return out;
    } catch {
      return null;
    }
  }
}

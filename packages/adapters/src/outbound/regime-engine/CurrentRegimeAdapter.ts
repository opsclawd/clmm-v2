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

const ISO_8601_UTC_OR_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
function isStrictIso(value: unknown): value is string {
  return typeof value === 'string' && ISO_8601_UTC_OR_OFFSET.test(value);
}

const AGE_PARITY_TOLERANCE_SECONDS = 2;

const _RECOGNIZED_TIMEFRAME_MS: Readonly<Record<string, number>> = {
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseReasons(raw: unknown): RegimeReason[] | null {
  if (!Array.isArray(raw)) return null;
  const out: RegimeReason[] = [];
  for (const item of raw) {
    if (!isRecord(item)) return null;
    const sev = item['severity'];
    const message = item['message'];
    if (typeof sev !== 'string' || !VALID_SEVERITIES.has(sev as RegimeReasonSeverity)) return null;
    if (typeof message !== 'string') return null;
    const code = item['code'];
    out.push({
      severity: sev as RegimeReasonSeverity,
      text: message,
      ...(typeof code === 'string' ? { code } : {}),
    });
  }
  return out;
}

function pickStringTopThenNested(
  data: Record<string, unknown>,
  metadata: Record<string, unknown> | null,
  key: string,
): string | undefined {
  const top = data[key];
  if (typeof top === 'string' && top.length > 0) return top;
  if (metadata) {
    const nested = metadata[key];
    if (typeof nested === 'string' && nested.length > 0) return nested;
  }
  return undefined;
}

function pickNumberTopThenNested(
  data: Record<string, unknown>,
  metadata: Record<string, unknown> | null,
  key: string,
): number | undefined {
  const top = data[key];
  if (typeof top === 'number' && Number.isFinite(top) && top > 0) return top;
  if (metadata) {
    const nested = metadata[key];
    if (typeof nested === 'number' && Number.isFinite(nested) && nested > 0) return nested;
  }
  return undefined;
}

function parseTelemetry(raw: unknown): RegimeBlock['telemetry'] | null {
  if (!isRecord(raw)) return null;
  const required = [
    'realizedVolShort',
    'realizedVolLong',
    'volRatio',
    'trendStrength',
    'compression',
  ] as const;
  const out: Record<string, number> = {};
  for (const key of required) {
    const value = raw[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    out[key] = value;
  }
  return out as RegimeBlock['telemetry'];
}

function parseUpstream(data: unknown): RegimeBlock | null {
  if (!isRecord(data)) return null;

  const regime = data['regime'];
  if (typeof regime !== 'string' || !VALID_REGIMES.has(regime as MarketRegime)) return null;

  const telemetry = parseTelemetry(data['telemetry']);
  if (!telemetry) return null;

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

  if (
    Object.prototype.hasOwnProperty.call(freshness, 'lastCandleIso') ||
    Object.prototype.hasOwnProperty.call(freshness, 'lastCandleUnixMs')
  ) {
    return null;
  }

  const generatedAtIso = freshness['generatedAtIso'];
  const lastCandleOpenIso = freshness['lastCandleOpenIso'];
  const lastCandleCloseIso = freshness['lastCandleCloseIso'];
  const lastCandleOpenUnixMs = freshness['lastCandleOpenUnixMs'];
  const lastCandleCloseUnixMs = freshness['lastCandleCloseUnixMs'];
  const ageSeconds = freshness['ageSeconds'];
  const softStale = freshness['softStale'];
  const hardStale = freshness['hardStale'];
  const softStaleSeconds = freshness['softStaleSeconds'];
  const hardStaleSeconds = freshness['hardStaleSeconds'];

  if (!isStrictIso(generatedAtIso)) return null;
  if (!isStrictIso(lastCandleOpenIso)) return null;
  if (!isStrictIso(lastCandleCloseIso)) return null;
  if (
    typeof lastCandleOpenUnixMs !== 'number' ||
    !Number.isFinite(lastCandleOpenUnixMs) ||
    lastCandleOpenUnixMs <= 0
  )
    return null;
  if (
    typeof lastCandleCloseUnixMs !== 'number' ||
    !Number.isFinite(lastCandleCloseUnixMs) ||
    lastCandleCloseUnixMs <= 0
  )
    return null;
  if (typeof softStale !== 'boolean' || typeof hardStale !== 'boolean') return null;
  if (typeof ageSeconds !== 'number' || !Number.isFinite(ageSeconds) || ageSeconds < 0) return null;
  if (
    typeof softStaleSeconds !== 'number' ||
    !Number.isFinite(softStaleSeconds) ||
    softStaleSeconds <= 0
  )
    return null;
  if (
    typeof hardStaleSeconds !== 'number' ||
    !Number.isFinite(hardStaleSeconds) ||
    hardStaleSeconds <= softStaleSeconds
  )
    return null;

  const generatedAtUnixMs = Date.parse(generatedAtIso);
  if (!Number.isFinite(generatedAtUnixMs) || generatedAtUnixMs <= 0) return null;

  if (Date.parse(lastCandleOpenIso) !== lastCandleOpenUnixMs) return null;
  if (Date.parse(lastCandleCloseIso) !== lastCandleCloseUnixMs) return null;

  if (lastCandleCloseUnixMs <= lastCandleOpenUnixMs) return null;

  if (generatedAtUnixMs < lastCandleCloseUnixMs) return null;

  const expectedAgeSeconds = Math.floor((generatedAtUnixMs - lastCandleCloseUnixMs) / 1000);
  if (Math.abs(ageSeconds - expectedAgeSeconds) > AGE_PARITY_TOLERANCE_SECONDS) return null;

  const metadataRaw = data['metadata'];
  const metadata = isRecord(metadataRaw) ? metadataRaw : null;

  const source = pickStringTopThenNested(data, metadata, 'source');
  const network = pickStringTopThenNested(data, metadata, 'network');
  const symbol = pickStringTopThenNested(data, metadata, 'symbol');
  const timeframe = pickStringTopThenNested(data, metadata, 'timeframe');
  if (!source || !network || !symbol || !timeframe) return null;

  const sourceTimeframe = pickStringTopThenNested(data, metadata, 'sourceTimeframe');
  const sourceCandleCount = pickNumberTopThenNested(data, metadata, 'sourceCandleCount');
  const candleCount = pickNumberTopThenNested(data, metadata, 'candleCount');
  const derivedTimeframe = pickStringTopThenNested(data, metadata, 'derivedTimeframe');
  const aggregationVersion = pickStringTopThenNested(data, metadata, 'aggregationVersion');
  const engineVersion = pickStringTopThenNested(data, metadata, 'engineVersion');
  const configVersion = pickStringTopThenNested(data, metadata, 'configVersion');

  return {
    regime: regime as MarketRegime,
    telemetry,
    clmmSuitability: { status: status as ClmmSuitabilityStatus, reasons: suitReasons },
    marketReasons,
    freshness: {
      generatedAtUnixMs,
      generatedAtIso,
      lastCandleOpenUnixMs,
      lastCandleOpenIso,
      lastCandleCloseUnixMs,
      lastCandleCloseIso,
      ageSeconds,
      softStale,
      hardStale,
      softStaleSeconds,
      hardStaleSeconds,
    },
    metadata: {
      source,
      network,
      symbol,
      timeframe,
      ...(sourceTimeframe !== undefined ? { sourceTimeframe } : {}),
      ...(sourceCandleCount !== undefined ? { sourceCandleCount } : {}),
      ...(candleCount !== undefined ? { candleCount } : {}),
      ...(derivedTimeframe !== undefined ? { derivedTimeframe } : {}),
      ...(aggregationVersion !== undefined ? { aggregationVersion } : {}),
      ...(engineVersion !== undefined ? { engineVersion } : {}),
      ...(configVersion !== undefined ? { configVersion } : {}),
    },
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

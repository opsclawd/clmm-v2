import type {
  RegimeBlock,
  RegimeReason,
  RegimeClmmSuitability,
  RegimeFreshness,
  RegimeReasonSeverity,
} from '@clmm/application/public';
import type { MarketRegime, ClmmSuitabilityStatus } from '@clmm/application/public';
import { getBffBaseUrl } from './http';

export class RegimeUnsupportedPoolError extends Error {
  constructor(poolId: string) {
    super(`Regime not available: pool ${poolId} is not supported`);
    this.name = 'RegimeUnsupportedPoolError';
  }
}

export function isRegimeUnsupportedPoolError(error: unknown): error is RegimeUnsupportedPoolError {
  return error instanceof RegimeUnsupportedPoolError;
}

export type RegimeUnavailableReason = 'not-found' | 'config-error' | 'upstream-error';

export type RegimeResponse = {
  regime: RegimeBlock | null;
  unavailableReason?: RegimeUnavailableReason | undefined;
};

const FETCH_TIMEOUT_MS = 10_000;

function isAbortError(error: unknown): boolean {
  if (typeof error !== 'object' || error == null) return false;
  return (error as { name?: string }).name === 'AbortError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

const VALID_REASON_SEVERITIES: Set<string> = new Set<RegimeReasonSeverity>([
  'ERROR',
  'WARN',
  'INFO',
]);

const VALID_CLMM_SUITABILITY_STATUSES: Set<string> = new Set<ClmmSuitabilityStatus>([
  'ALLOWED',
  'CAUTION',
  'BLOCKED',
  'UNKNOWN',
]);

const VALID_MARKET_REGIMES: Set<string> = new Set<MarketRegime>(['UP', 'DOWN', 'CHOP']);

function isRegimeReasonBlock(value: unknown): value is RegimeReason {
  if (!isRecord(value)) return false;
  if (!VALID_REASON_SEVERITIES.has(value['severity'] as string)) return false;
  if (typeof value['text'] !== 'string') return false;
  if (value['code'] != null && typeof value['code'] !== 'string') return false;
  return true;
}

function isRegimeClmmSuitabilityBlock(value: unknown): value is RegimeClmmSuitability {
  if (!isRecord(value)) return false;
  if (!VALID_CLMM_SUITABILITY_STATUSES.has(value['status'] as string)) return false;
  if (!Array.isArray(value['reasons'])) return false;
  if (!(value['reasons'] as unknown[]).every(isRegimeReasonBlock)) return false;
  return true;
}

const ISO_8601_UTC_OR_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
function isStrictIso(value: unknown): value is string {
  return typeof value === 'string' && ISO_8601_UTC_OR_OFFSET.test(value);
}

function isRegimeFreshnessBlock(value: unknown): value is RegimeFreshness {
  if (!isRecord(value)) return false;

  if (
    Object.prototype.hasOwnProperty.call(value, 'lastCandleIso') ||
    Object.prototype.hasOwnProperty.call(value, 'lastCandleUnixMs')
  ) {
    return false;
  }

  const generatedAtMs = value['generatedAtUnixMs'];
  const generatedAtIso = value['generatedAtIso'];
  const openMs = value['lastCandleOpenUnixMs'];
  const openIso = value['lastCandleOpenIso'];
  const closeMs = value['lastCandleCloseUnixMs'];
  const closeIso = value['lastCandleCloseIso'];
  const age = value['ageSeconds'];
  const softSec = value['softStaleSeconds'];
  const hardSec = value['hardStaleSeconds'];

  if (typeof generatedAtMs !== 'number' || !Number.isFinite(generatedAtMs) || generatedAtMs <= 0)
    return false;
  if (typeof openMs !== 'number' || !Number.isFinite(openMs) || openMs <= 0) return false;
  if (typeof closeMs !== 'number' || !Number.isFinite(closeMs) || closeMs <= 0) return false;
  if (!isStrictIso(generatedAtIso)) return false;
  if (!isStrictIso(openIso)) return false;
  if (!isStrictIso(closeIso)) return false;

  if (Date.parse(generatedAtIso) !== generatedAtMs) return false;
  if (Date.parse(openIso) !== openMs) return false;
  if (Date.parse(closeIso) !== closeMs) return false;

  if (closeMs <= openMs) return false;
  if (generatedAtMs < closeMs) return false;

  if (typeof age !== 'number' || !Number.isFinite(age) || age < 0) return false;
  if (typeof value['softStale'] !== 'boolean') return false;
  if (typeof value['hardStale'] !== 'boolean') return false;
  if (typeof softSec !== 'number' || !Number.isFinite(softSec) || softSec <= 0) return false;
  if (typeof hardSec !== 'number' || !Number.isFinite(hardSec) || hardSec <= softSec) return false;
  return true;
}

function isRegimeTelemetryBlock(value: unknown): boolean {
  if (!isRecord(value)) return false;
  for (const key of [
    'realizedVolShort',
    'realizedVolLong',
    'volRatio',
    'trendStrength',
    'compression',
  ]) {
    const v = value[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) return false;
  }
  return true;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isOptionalPositiveNumber(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value > 0);
}

function isRegimeMetadataBlock(value: unknown): boolean {
  if (!isRecord(value)) return false;
  for (const key of ['source', 'network', 'symbol', 'timeframe']) {
    if (typeof value[key] !== 'string' || value[key].length === 0) return false;
  }
  if (!isOptionalString(value['sourceTimeframe'])) return false;
  if (!isOptionalPositiveNumber(value['sourceCandleCount'])) return false;
  if (!isOptionalPositiveNumber(value['candleCount'])) return false;
  if (!isOptionalString(value['derivedTimeframe'])) return false;
  if (!isOptionalString(value['aggregationVersion'])) return false;
  if (!isOptionalString(value['engineVersion'])) return false;
  if (!isOptionalString(value['configVersion'])) return false;
  return true;
}

function isRegimeBlock(value: unknown): value is RegimeBlock {
  if (!isRecord(value)) return false;
  if (!VALID_MARKET_REGIMES.has(value['regime'] as string)) return false;
  if (!isRegimeTelemetryBlock(value['telemetry'])) return false;
  if (!isRegimeClmmSuitabilityBlock(value['clmmSuitability'])) return false;
  if (!Array.isArray(value['marketReasons'])) return false;
  if (!(value['marketReasons'] as unknown[]).every(isRegimeReasonBlock)) return false;
  if (!isRegimeFreshnessBlock(value['freshness'])) return false;
  if (!isRegimeMetadataBlock(value['metadata'])) return false;
  return true;
}

function isRegimeUnavailableReason(value: unknown): value is RegimeUnavailableReason {
  return (
    typeof value === 'string' &&
    (value === 'not-found' || value === 'config-error' || value === 'upstream-error')
  );
}

async function classifyNotFound(poolId: string, response: Response): Promise<Error> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (error: unknown) {
    if (isAbortError(error)) throw error;
    return new Error('Could not load market regime: unexpected 404');
  }
  if (
    isRecord(body) &&
    typeof body['message'] === 'string' &&
    body['message'].includes('not supported')
  ) {
    return new RegimeUnsupportedPoolError(poolId);
  }
  return new Error('Could not load market regime: endpoint not found');
}

export async function fetchCurrentRegime(poolId: string): Promise<RegimeResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let response: Response;
    try {
      response = await fetch(
        `${getBffBaseUrl()}/regime/pools/${encodeURIComponent(poolId)}/current`,
        { signal: controller.signal },
      );
    } catch (error: unknown) {
      if (isAbortError(error)) throw error;
      throw new Error(
        `Could not load market regime: ${error instanceof Error ? error.message : 'network error'}`,
      );
    }

    if (response.status === 404) throw await classifyNotFound(poolId, response);

    if (!response.ok) {
      let detail: string;
      try {
        detail = await response.text();
      } catch (error: unknown) {
        if (isAbortError(error)) throw error;
        detail = `HTTP ${response.status}`;
      }
      throw new Error(`Could not load market regime: ${detail || response.statusText}`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error: unknown) {
      if (isAbortError(error)) throw error;
      throw new Error('Could not load market regime: response body was not valid JSON');
    }

    if (!isRecord(body)) {
      throw new Error('Could not load market regime: malformed response');
    }

    const regime = body['regime'];
    const unavailableReason = isRegimeUnavailableReason(body['unavailableReason'])
      ? body['unavailableReason']
      : undefined;

    if (regime === null) {
      return { regime: null, unavailableReason };
    }

    if (!isRegimeBlock(regime)) {
      throw new Error('Could not load market regime: malformed regime block');
    }

    return { regime, unavailableReason };
  } catch (error: unknown) {
    if (isAbortError(error)) {
      throw new Error('Could not load market regime: request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

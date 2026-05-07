import type { SrThesesBlock, SrThesisDto } from '@clmm/application/public';
import { getBffBaseUrl } from './http.js';

export class SrThesesUnsupportedPoolError extends Error {
  constructor(poolId: string) {
    super(`S/R theses not available: pool ${poolId} is not supported`);
    this.name = 'SrThesesUnsupportedPoolError';
  }
}

export function isSrThesesUnsupportedPoolError(
  error: unknown,
): error is SrThesesUnsupportedPoolError {
  return error instanceof SrThesesUnsupportedPoolError;
}

export type SrThesesUnavailableReason = 'not-found' | 'config-error' | 'upstream-error';

export type SrThesesResponse = {
  srTheses: SrThesesBlock | null;
  unavailableReason?: SrThesesUnavailableReason | undefined;
};

const FETCH_TIMEOUT_MS = 10_000;

function isAbortError(error: unknown): boolean {
  if (typeof error !== 'object' || error == null) return false;
  return (error as { name?: string }).name === 'AbortError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isThesis(value: unknown): value is SrThesisDto {
  if (!isRecord(value)) return false;
  if (typeof value['asset'] !== 'string') return false;
  if (typeof value['timeframe'] !== 'string') return false;
  if (!isNullableString(value['bias'])) return false;
  if (!isNullableString(value['setupType'])) return false;
  if (!isStringArray(value['supportLevels'])) return false;
  if (!isStringArray(value['resistanceLevels'])) return false;
  if (!isNullableString(value['entryZone'])) return false;
  if (!isStringArray(value['targets'])) return false;
  if (!isNullableString(value['invalidation'])) return false;
  if (!isNullableString(value['trigger'])) return false;
  if (!isNullableString(value['chartReference'])) return false;
  if (typeof value['sourceHandle'] !== 'string') return false;
  if (!isNullableString(value['sourceChannel'])) return false;
  if (typeof value['sourceKind'] !== 'string') return false;
  if (!isNullableString(value['sourceReliability'])) return false;
  if (!isNullableString(value['rawThesisText'])) return false;
  if (!isNullableString(value['collectedAt'])) return false;
  if (!isNullableString(value['publishedAt'])) return false;
  if (!isNullableString(value['sourceUrl'])) return false;
  if (!isNullableString(value['notes'])) return false;
  return true;
}

function isSrThesesBlock(value: unknown): value is SrThesesBlock {
  if (!isRecord(value)) return false;
  if (value['schemaVersion'] !== '2.0') return false;
  if (typeof value['source'] !== 'string') return false;
  if (typeof value['symbol'] !== 'string') return false;
  if (typeof value['capturedAtIso'] !== 'string') return false;
  if (typeof value['capturedAtUnixMs'] !== 'number') return false;
  if (!Number.isFinite(value['capturedAtUnixMs']) || value['capturedAtUnixMs'] <= 0) return false;
  if (!isRecord(value['brief'])) return false;
  const brief = value['brief'];
  if (typeof brief['briefId'] !== 'string') return false;
  if (!isNullableString(brief['sourceRecordedAtIso'])) return false;
  if (!isNullableString(brief['summary'])) return false;
  if (!Array.isArray(value['theses'])) return false;
  if (!(value['theses'] as unknown[]).every(isThesis)) return false;
  return true;
}

function isUnavailableReason(value: unknown): value is SrThesesUnavailableReason {
  return (
    typeof value === 'string' &&
    (value === 'not-found' || value === 'config-error' || value === 'upstream-error')
  );
}

export async function fetchCurrentSrTheses(poolId: string): Promise<SrThesesResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(
      `${getBffBaseUrl()}/sr-theses/pools/${encodeURIComponent(poolId)}/current`,
      { signal: controller.signal },
    );
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (isAbortError(error)) {
      throw new Error('Could not load S/R theses: request timed out');
    }
    throw new Error(
      `Could not load S/R theses: ${error instanceof Error ? error.message : 'network error'}`,
    );
  }

  if (response.status === 404) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      clearTimeout(timeoutId);
      throw new Error('Could not load S/R theses: unexpected 404');
    }
    clearTimeout(timeoutId);
    if (
      isRecord(body) &&
      typeof body['message'] === 'string' &&
      body['message'].includes('not supported')
    ) {
      throw new SrThesesUnsupportedPoolError(poolId);
    }
    throw new Error('Could not load S/R theses: endpoint not found');
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => `HTTP ${response.status}`);
    clearTimeout(timeoutId);
    throw new Error(`Could not load S/R theses: ${detail || response.statusText}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    clearTimeout(timeoutId);
    throw new Error('Could not load S/R theses: response body was not valid JSON');
  }
  clearTimeout(timeoutId);

  if (!isRecord(body)) {
    throw new Error('Could not load S/R theses: malformed response');
  }

  const srTheses = body['srTheses'];
  const unavailableReason = isUnavailableReason(body['unavailableReason'])
    ? body['unavailableReason']
    : undefined;

  if (srTheses === null) {
    return { srTheses: null, unavailableReason };
  }

  if (!isSrThesesBlock(srTheses)) {
    throw new Error('Could not load S/R theses: malformed srTheses block');
  }

  return { srTheses, unavailableReason };
}

import type { SrLevelsBlock, SrLevel } from '@clmm/application/public';
import { getBffBaseUrl } from './http';

export class SrLevelsUnsupportedPoolError extends Error {
  constructor(poolId: string) {
    super(`S/R levels not available: pool ${poolId} is not supported`);
    this.name = 'SrLevelsUnsupportedPoolError';
  }
}

export function isSrLevelsUnsupportedPoolError(error: unknown): error is SrLevelsUnsupportedPoolError {
  return error instanceof SrLevelsUnsupportedPoolError;
}

export type SrLevelsResponse = {
  srLevels: SrLevelsBlock | null;
};

const FETCH_TIMEOUT_MS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null;
}

function isSrLevel(value: unknown): value is SrLevel {
  if (!isRecord(value)) return false;
  const price = value['price'];
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return false;
  if (value['rank'] != null && typeof value['rank'] !== 'string') return false;
  if (value['timeframe'] != null && typeof value['timeframe'] !== 'string') return false;
  if (value['invalidation'] != null && typeof value['invalidation'] !== 'number') return false;
  if (value['notes'] != null && typeof value['notes'] !== 'string') return false;
  return true;
}

function isSrLevelsBlock(value: unknown): value is SrLevelsBlock {
  if (!isRecord(value)) return false;
  return (
    typeof value['briefId'] === 'string' &&
    (value['sourceRecordedAtIso'] == null || typeof value['sourceRecordedAtIso'] === 'string') &&
    (value['summary'] == null || typeof value['summary'] === 'string') &&
    typeof value['capturedAtUnixMs'] === 'number' &&
    Number.isFinite(value['capturedAtUnixMs']) &&
    value['capturedAtUnixMs'] > 0 &&
    Array.isArray(value['supports']) && (value['supports'] as unknown[]).every(isSrLevel) &&
    Array.isArray(value['resistances']) && (value['resistances'] as unknown[]).every(isSrLevel)
  );
}

export async function fetchCurrentSrLevels(poolId: string): Promise<SrLevelsResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(
      `${getBffBaseUrl()}/sr-levels/pools/${encodeURIComponent(poolId)}/current`,
      { signal: controller.signal },
    );
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Could not load market context: request timed out');
    }
    throw new Error(`Could not load market context: ${error instanceof Error ? error.message : 'network error'}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 404) {
    throw new SrLevelsUnsupportedPoolError(poolId);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => `HTTP ${response.status}`);
    throw new Error(`Could not load market context: ${detail || response.statusText}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('Could not load market context: response body was not valid JSON');
  }

  if (!isRecord(body)) {
    throw new Error('Could not load market context: malformed response');
  }

  const srLevels = body['srLevels'];
  if (srLevels === null) {
    return { srLevels: null };
  }

  if (!isSrLevelsBlock(srLevels)) {
    throw new Error('Could not load market context: malformed srLevels block');
  }

  return { srLevels };
}
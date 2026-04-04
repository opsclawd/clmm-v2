import type { BreachDirection, ExecutionPreviewDto } from '@clmm/application/public';
import { fetchJson } from './http';

type PreviewResponse = {
  preview: ExecutionPreviewDto;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBreachDirection(value: unknown): value is BreachDirection {
  return (
    isRecord(value) &&
    (value['kind'] === 'lower-bound-breach' || value['kind'] === 'upper-bound-breach')
  );
}

function isPostExitAssetPosture(value: unknown): boolean {
  return isRecord(value) && (value['kind'] === 'exit-to-usdc' || value['kind'] === 'exit-to-sol');
}

function isTokenAmountEstimate(value: unknown): boolean {
  return (
    isRecord(value) &&
    (typeof value['raw'] === 'bigint' ||
      typeof value['raw'] === 'string' ||
      typeof value['raw'] === 'number') &&
    typeof value['symbol'] === 'string'
  );
}

function isPreviewStepDto(value: unknown): boolean {
  if (!isRecord(value) || typeof value['kind'] !== 'string') {
    return false;
  }

  if (value['kind'] === 'remove-liquidity') {
    return (
      (value['estimatedAmount'] == null || isTokenAmountEstimate(value['estimatedAmount'])) &&
      value['estimatedFees'] == null
    );
  }

  if (value['kind'] === 'collect-fees') {
    return (
      value['estimatedAmount'] == null &&
      (value['estimatedFees'] == null || isTokenAmountEstimate(value['estimatedFees']))
    );
  }

  return (
    value['kind'] === 'swap-assets' &&
    typeof value['fromAsset'] === 'string' &&
    typeof value['toAsset'] === 'string' &&
    typeof value['policyReason'] === 'string' &&
    (value['estimatedOutput'] == null || isTokenAmountEstimate(value['estimatedOutput']))
  );
}

function isPreviewFreshness(value: unknown): boolean {
  if (!isRecord(value) || typeof value['kind'] !== 'string') {
    return false;
  }

  if (value['kind'] === 'fresh') {
    return typeof value['expiresAt'] === 'number';
  }

  return value['kind'] === 'stale' || value['kind'] === 'expired';
}

function isExecutionPreviewDto(value: unknown): value is ExecutionPreviewDto {
  return (
    isRecord(value) &&
    typeof value['previewId'] === 'string' &&
    typeof value['positionId'] === 'string' &&
    isBreachDirection(value['breachDirection']) &&
    isPostExitAssetPosture(value['postExitPosture']) &&
    Array.isArray(value['steps']) &&
    value['steps'].every(isPreviewStepDto) &&
    isPreviewFreshness(value['freshness']) &&
    typeof value['estimatedAt'] === 'number' &&
    (value['slippageBps'] == null || typeof value['slippageBps'] === 'number') &&
    (value['routeLabel'] == null || typeof value['routeLabel'] === 'string')
  );
}

function isPreviewResponse(value: unknown): value is PreviewResponse {
  return isRecord(value) && isExecutionPreviewDto(value['preview']);
}

async function parsePreviewResponse(
  request: Promise<unknown>,
  failureMessage: string,
): Promise<ExecutionPreviewDto> {
  try {
    const payload = await request;

    if (!isPreviewResponse(payload)) {
      throw new Error('Malformed preview response');
    }

    return payload.preview;
  } catch (cause: unknown) {
    throw new Error(failureMessage, { cause });
  }
}

export function createPreview(triggerId: string): Promise<ExecutionPreviewDto> {
  return parsePreviewResponse(
    fetchJson(`/previews/${triggerId}`, { method: 'POST' }),
    'Could not create execution preview',
  );
}

export function fetchPreview(previewId: string): Promise<ExecutionPreviewDto> {
  return parsePreviewResponse(fetchJson(`/previews/${previewId}`), 'Could not load execution preview');
}

export function refreshPreview(triggerId: string): Promise<ExecutionPreviewDto> {
  return parsePreviewResponse(
    fetchJson(`/previews/${triggerId}/refresh`, { method: 'POST' }),
    'Could not refresh execution preview',
  );
}

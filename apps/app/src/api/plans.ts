import { fetchJson } from './http';

export type PlanAction = { kind: 'HOLD' } | { kind: 'STAND_DOWN' } | { kind: 'REQUEST_EXIT_CLMM' };

export type PlanLifecycleState =
  | { kind: 'requested' }
  | {
      kind: 'advisory-ready';
      advisoryAction: PlanAction;
      regimeResponse: {
        regime: 'UP' | 'DOWN' | 'CHOP';
        suitability: 'ALLOWED' | 'CAUTION' | 'BLOCKED' | 'UNKNOWN';
      };
    }
  | {
      kind: 'exit-previewed';
      previewId: string;
      advisoryAction: PlanAction;
      preview: { freshness: { kind: 'fresh' | 'stale' | 'expired' } };
    }
  | { kind: 'awaiting-signature'; attemptId?: string; advisoryAction: PlanAction }
  | { kind: 'submitted'; attemptId?: string; advisoryAction: PlanAction }
  | { kind: 'result-pending' }
  | { kind: 'reported' }
  | { kind: 'report-failed' }
  | { kind: 'conflict'; priorPlanId: string }
  | { kind: 'superseded' };

export type CurrentPlanDto = {
  planId: string;
  canonicalHash: string;
  positionId: string;
  state: PlanLifecycleState;
} | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlanAction(value: unknown): value is PlanAction {
  if (!isRecord(value)) return false;
  if (value['kind'] === 'HOLD') return true;
  if (value['kind'] === 'STAND_DOWN') return true;
  if (value['kind'] === 'REQUEST_EXIT_CLMM') return true;
  return false;
}

function isRegimeResponse(value: unknown): value is { regime: string; suitability: string } {
  if (!isRecord(value)) return false;
  const regime = value['regime'];
  const suitability = value['suitability'];
  if (regime !== 'UP' && regime !== 'DOWN' && regime !== 'CHOP') return false;
  if (
    suitability !== 'ALLOWED' &&
    suitability !== 'CAUTION' &&
    suitability !== 'BLOCKED' &&
    suitability !== 'UNKNOWN'
  )
    return false;
  return true;
}

function isPlanLifecycleState(value: unknown): value is PlanLifecycleState {
  if (!isRecord(value) || typeof value['kind'] !== 'string') return false;

  const kind = value['kind'];

  if (kind === 'requested') return true;

  if (kind === 'advisory-ready') {
    const advisoryAction = value['advisoryAction'];
    const regimeResponse = value['regimeResponse'];
    return isPlanAction(advisoryAction) && isRegimeResponse(regimeResponse);
  }

  if (kind === 'exit-previewed') {
    const advisoryAction = value['advisoryAction'];
    const preview = value['preview'];
    if (!isRecord(preview)) return false;
    const freshness = preview['freshness'];
    if (!isRecord(freshness)) return false;
    const freshnessKind = freshness['kind'];
    return (
      typeof value['previewId'] === 'string' &&
      isPlanAction(advisoryAction) &&
      (freshnessKind === 'fresh' || freshnessKind === 'stale' || freshnessKind === 'expired')
    );
  }

  if (kind === 'awaiting-signature' || kind === 'submitted') {
    const advisoryAction = value['advisoryAction'];
    return isPlanAction(advisoryAction);
  }

  if (kind === 'result-pending' || kind === 'reported' || kind === 'report-failed') return true;

  if (kind === 'conflict') return typeof value['priorPlanId'] === 'string';
  if (kind === 'superseded') return true;

  return false;
}

function isCurrentPlanDto(value: unknown): value is CurrentPlanDto {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  if (typeof value['planId'] !== 'string') return false;
  if (typeof value['canonicalHash'] !== 'string') return false;
  if (typeof value['positionId'] !== 'string') return false;
  return isPlanLifecycleState(value['state']);
}

export async function fetchCurrentPlan(
  walletId: string,
  positionId: string,
): Promise<CurrentPlanDto> {
  try {
    const payload = await fetchJson(`/plans/${walletId}/${positionId}/current`);

    if (!isCurrentPlanDto(payload)) {
      throw new Error('Malformed current plan response');
    }

    return payload;
  } catch (cause: unknown) {
    throw new Error('Could not load current plan for this position', { cause });
  }
}

export async function recordPlanDecision(
  walletId: string,
  positionId: string,
  planId: string,
  decision:
    | 'acknowledged'
    | 'stand-down'
    | 'executed'
    | 'rejected'
    | 'expired'
    | 'position-changed'
    | 'failed',
): Promise<
  | { kind: 'recorded'; resultId: string }
  | { kind: 'not-found' }
  | { kind: 'conflict-detected' }
  | { kind: 'error'; reason: string }
> {
  try {
    const payload = await fetchJson(`/plans/${walletId}/${positionId}/${planId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    });

    if (!isRecord(payload)) {
      throw new Error('Malformed decision response');
    }

    const kind = payload['kind'] as string;
    if (kind === 'recorded') {
      return { kind: 'recorded', resultId: payload['resultId'] as string };
    }
    if (kind === 'not-found') return { kind: 'not-found' };
    if (kind === 'conflict-detected') return { kind: 'conflict-detected' };
    if (kind === 'error') return { kind: 'error', reason: payload['reason'] as string };

    throw new Error('Malformed decision response');
  } catch (cause: unknown) {
    throw new Error('Could not record plan decision', { cause });
  }
}

export async function requestPlanPreview(
  walletId: string,
  positionId: string,
  planId: string,
): Promise<{ previewId: string }> {
  try {
    const payload = await fetchJson(`/plans/${walletId}/${positionId}/${planId}/preview`, {
      method: 'POST',
    });

    if (!isRecord(payload) || typeof payload['previewId'] !== 'string') {
      throw new Error('Malformed preview response');
    }

    return { previewId: payload['previewId'] };
  } catch (cause: unknown) {
    throw new Error('Could not request plan preview', { cause });
  }
}

export async function approvePlanExit(
  walletId: string,
  positionId: string,
  planId: string,
  previewId: string,
): Promise<{ attemptId: string }> {
  try {
    const payload = await fetchJson(`/plans/${walletId}/${positionId}/${planId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ previewId }),
    });

    if (!isRecord(payload) || typeof payload['attemptId'] !== 'string') {
      throw new Error('Malformed approve response');
    }

    return { attemptId: payload['attemptId'] };
  } catch (cause: unknown) {
    throw new Error('Could not approve plan exit', { cause });
  }
}

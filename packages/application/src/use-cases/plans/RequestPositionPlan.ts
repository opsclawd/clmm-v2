import type {
  SupportedPositionReadPort,
  TriggerRepository,
  PlanRepository,
  RegimePlanPort,
  ClockPort,
  ObservabilityPort,
  IdGeneratorPort,
} from '../../ports/index.js';
import type { WalletId, PositionId, ClockTimestamp, BreachDirection } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';
import type { CanonicalHash } from '@clmm/domain';
import type { RegimePlanRequest, RegimePlanResponse } from '@clmm/application';

const STALENESS_THRESHOLD_MS = 5 * 60 * 1000;

export type PositionPlanRequestResult =
  | {
      readonly status: 'ok';
      readonly conflict: false;
      readonly plan: RegimePlanResponse;
      readonly fingerprint: string;
    }
  | {
      readonly status: 'ok';
      readonly conflict: false;
      readonly reason: 'exact-replay';
      readonly fingerprint: string;
    }
  | { readonly status: 'ok'; readonly conflict: true; readonly reason: 'exact-replay' }
  | { readonly status: 'conflict'; readonly priorPlanId: string; readonly newFingerprint: string }
  | { readonly status: 'unavailable'; readonly reason: 'position-not-found' | 'ownership-mismatch' }
  | { readonly status: 'stale'; readonly reason: 'position-stale' }
  | { readonly status: 'degraded'; readonly reason: string }
  | { readonly status: 'superseded'; readonly breachDirection: BreachDirection }
  | { readonly status: 'error'; readonly reason: string };

function computeFingerprint(params: {
  positionId: PositionId;
  lowerBoundPrice: number;
  upperBoundPrice: number;
  currentPrice: number;
  rangeState: 'in-range' | 'below-range' | 'above-range';
  observedAt: ClockTimestamp;
}): string {
  const fields = [
    params.positionId,
    params.lowerBoundPrice.toString(),
    params.upperBoundPrice.toString(),
    params.currentPrice.toString(),
    params.rangeState,
    params.observedAt.toString(),
  ];
  return fields.join('|');
}

function buildRegimePlanRequest(params: {
  position: {
    positionId: PositionId;
    walletId?: string;
    lowerBoundPrice: number;
    upperBoundPrice: number;
    currentPrice: number;
    rangeState: 'in-range' | 'below-range' | 'above-range';
    breachQualified: boolean;
    observedAtUnixMs: number;
    breachQualifiedAtUnixMs?: number;
  };
  market: {
    symbol: string;
    source: string;
    network: string;
    poolAddress: string;
    timeframe: '15m' | '1h';
  };
}): RegimePlanRequest {
  const positionPart: {
    positionId: string;
    walletId?: string;
    observedAtUnixMs: number;
    breachQualifiedAtUnixMs?: number;
    lowerBoundPrice: number;
    upperBoundPrice: number;
    currentPrice: number;
    rangeState: 'in-range' | 'below-range' | 'above-range';
    breachQualified: boolean;
  } = {
    positionId: params.position.positionId as string,
    observedAtUnixMs: params.position.observedAtUnixMs,
    lowerBoundPrice: params.position.lowerBoundPrice,
    upperBoundPrice: params.position.upperBoundPrice,
    currentPrice: params.position.currentPrice,
    rangeState: params.position.rangeState,
    breachQualified: params.position.breachQualified,
  };

  if (params.position.walletId !== undefined) {
    positionPart.walletId = params.position.walletId;
  }

  if (params.position.breachQualifiedAtUnixMs !== undefined) {
    positionPart.breachQualifiedAtUnixMs = params.position.breachQualifiedAtUnixMs;
  }

  return {
    schemaVersion: 'position-plan.v1',
    asOfUnixMs: Date.now(),
    market: params.market,
    position: positionPart,
  };
}

export async function requestPositionPlan(params: {
  walletId: WalletId;
  positionId: PositionId;
  positionReadPort: SupportedPositionReadPort;
  triggerRepository: TriggerRepository;
  planRepository: PlanRepository;
  regimePlanPort: RegimePlanPort;
  clock: ClockPort;
  idGenerator: IdGeneratorPort;
  observability: ObservabilityPort;
}): Promise<PositionPlanRequestResult> {
  const {
    walletId,
    positionId,
    positionReadPort,
    triggerRepository,
    planRepository,
    regimePlanPort,
    clock,
    idGenerator,
    observability,
  } = params;

  const position = await positionReadPort.getPosition(walletId, positionId);
  if (!position) {
    observability.log('warn', 'RequestPositionPlan: position not found', { walletId, positionId });
    return { status: 'unavailable', reason: 'position-not-found' };
  }

  if (position.walletId !== walletId) {
    observability.log('warn', 'RequestPositionPlan: wallet ownership mismatch', {
      walletId,
      positionId,
      positionWalletId: position.walletId,
    });
    return { status: 'unavailable', reason: 'ownership-mismatch' };
  }

  const now = clock.now();
  const positionAge = now - position.lastObservedAt;
  if (positionAge > STALENESS_THRESHOLD_MS) {
    observability.log('warn', 'RequestPositionPlan: position stale', {
      walletId,
      positionId,
      positionAge,
    });
    return { status: 'stale', reason: 'position-stale' };
  }

  const existingPlan = await planRepository.getCurrentPlan(positionId);

  const positionDetail = await positionReadPort.getPositionDetail(walletId, positionId);
  const poolData = positionDetail
    ? await positionReadPort.getPoolData(positionDetail.position.poolId)
    : null;

  if (!poolData) {
    observability.log('warn', 'RequestPositionPlan: pool data not available', { positionId });
    return { status: 'unavailable', reason: 'position-not-found' };
  }

  const symbol = `${poolData.tokenPair.symbolA}/${poolData.tokenPair.symbolB}`;

  const rangeStateKind = position.rangeState.kind;
  const currentPrice =
    position.rangeState.kind === 'in-range' ||
    position.rangeState.kind === 'below-range' ||
    position.rangeState.kind === 'above-range'
      ? position.rangeState.currentPrice
      : 0;

  const triggers = await triggerRepository.listActionableTriggers(walletId);
  const qualifiedTrigger = triggers.find(
    (t) => t.positionId === positionId && t.confirmationPassed,
  );

  const fingerprint = computeFingerprint({
    positionId: position.positionId,
    lowerBoundPrice: position.bounds.lowerBound,
    upperBoundPrice: position.bounds.upperBound,
    currentPrice,
    rangeState: rangeStateKind,
    observedAt: position.lastObservedAt,
  });

  const breachQualifiedAtUnixMs = qualifiedTrigger
    ? Number(qualifiedTrigger.triggeredAt)
    : undefined;

  if (qualifiedTrigger) {
    observability.log('info', 'RequestPositionPlan: qualified trigger outranks advisory', {
      positionId,
      triggerId: qualifiedTrigger.triggerId,
      breachDirection: qualifiedTrigger.breachDirection.kind,
    });

    return {
      status: 'superseded',
      breachDirection: qualifiedTrigger.breachDirection,
    };
  }

  const market = {
    symbol,
    source: 'clmm',
    network: 'solana',
    poolAddress: position.poolId,
    timeframe: '1h' as const,
  };

  const request = buildRegimePlanRequest({
    position: {
      positionId,
      ...(walletId !== undefined && { walletId: walletId as string }),
      lowerBoundPrice: position.bounds.lowerBound,
      upperBoundPrice: position.bounds.upperBound,
      currentPrice,
      rangeState: rangeStateKind,
      breachQualified: !!qualifiedTrigger,
      observedAtUnixMs: position.lastObservedAt as number,
      ...(breachQualifiedAtUnixMs !== undefined && { breachQualifiedAtUnixMs }),
    },
    market,
  });

  const transportResult = await regimePlanPort.requestPositionPlan(request);

  if (transportResult.kind === 'ok') {
    const response = transportResult.response;
    const planId = idGenerator.generateId() as import('@clmm/domain').PlanId;
    const canonicalHash = fingerprint as CanonicalHash;

    const createResult = await planRepository.createRequest({
      planId,
      canonicalHash,
      positionId,
      walletId,
      requestedAt: makeClockTimestamp(Date.now()),
      action: { kind: 'HOLD' },
      snapshotFingerprint: fingerprint,
    });

    if (createResult.kind === 'exact-replay') {
      observability.log('info', 'RequestPositionPlan: exact replay detected', { positionId });
      return { status: 'ok', conflict: false, reason: 'exact-replay', fingerprint };
    }

    if (createResult.kind === 'conflict') {
      observability.log('warn', 'RequestPositionPlan: conflicting plan detected', {
        positionId,
        fingerprint,
      });
      return {
        status: 'conflict',
        priorPlanId: existingPlan?.planId ?? 'unknown',
        newFingerprint: fingerprint,
      };
    }

    await planRepository.acceptResponse({
      planId,
      regimeResponse: {
        kind: 'regime-response',
        regime: response.regime,
        suitability: 'ALLOWED',
      },
      respondedAt: makeClockTimestamp(response.asOfUnixMs),
      asOfAt: makeClockTimestamp(response.asOfUnixMs),
      expiresAt: makeClockTimestamp(response.expiresAtUnixMs),
    });

    observability.log('info', 'RequestPositionPlan: plan received', {
      positionId,
      planId: response.planId,
      regime: response.regime,
    });

    return {
      status: 'ok',
      conflict: false,
      plan: response,
      fingerprint,
    };
  }

  if (transportResult.kind === 'conflict') {
    observability.log('warn', 'RequestPositionPlan: regime returned conflict', {
      positionId,
      reason: transportResult.reason,
    });
    return {
      status: 'conflict',
      priorPlanId: existingPlan?.planId ?? 'unknown',
      newFingerprint: fingerprint,
    };
  }

  if (transportResult.kind === 'permanent') {
    observability.log('warn', 'RequestPositionPlan: regime returned permanent error', {
      positionId,
      reason: transportResult.reason,
    });
    return {
      status: 'degraded',
      reason: transportResult.reason,
    };
  }

  if (transportResult.kind === 'retryable-degraded') {
    observability.log('warn', 'RequestPositionPlan: regime timeout/unavailable', {
      positionId,
      reason: transportResult.reason,
    });
    return {
      status: 'degraded',
      reason: transportResult.reason,
    };
  }

  return {
    status: 'error',
    reason: 'unknown-transport-result',
  };
}

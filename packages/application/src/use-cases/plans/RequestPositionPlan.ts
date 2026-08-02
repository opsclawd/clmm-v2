import type {
  SupportedPositionReadPort,
  TriggerRepository,
  PlanRepository,
  RegimePlanPort,
  ExecutionHistoryRepository,
  ClockPort,
  ObservabilityPort,
  IdGeneratorPort,
} from '../../ports/index.js';
import type {
  WalletId,
  PositionId,
  ClockTimestamp,
  BreachDirection,
  PlanAction,
  PlanId,
  CanonicalHash,
} from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';
import type {
  RegimePlanResponse,
  RegimePlanExitPosture,
  ResolveRegimePlanRequestConfigResult,
} from '../../dto/regimePlan.js';
import { buildRegimePlanRequest } from './buildRegimePlanRequest.js';

const STALENESS_THRESHOLD_MS = 5 * 60 * 1000;
const CANDLE_INTERVAL_MS = 60 * 60 * 1000;
const MINIMUM_INTERVAL_MS = 15 * 60 * 1000;
const LEASE_DURATION_MS = 2 * 60 * 1000;

function mapRegimeExitPostureToDomain(
  posture: RegimePlanExitPosture,
): 'exit-to-usdc' | 'exit-to-sol' {
  return posture === 'ExitToSOL' ? 'exit-to-sol' : 'exit-to-usdc';
}

function extractAdvisoryAction(response: RegimePlanResponse): PlanAction {
  const requestedAction = response.actions.find(
    (a) => a.type === 'REQUEST_EXIT_CLMM' || a.type === 'HOLD' || a.type === 'STAND_DOWN',
  );
  if (!requestedAction) {
    return { kind: 'HOLD' };
  }
  if (requestedAction.type === 'REQUEST_EXIT_CLMM') {
    const exitIntent = requestedAction.exitIntent?.posture
      ? mapRegimeExitPostureToDomain(requestedAction.exitIntent.posture)
      : undefined;
    return { kind: 'REQUEST_EXIT_CLMM', ...(exitIntent && { exitIntent }) };
  }
  return { kind: requestedAction.type };
}

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
      readonly plan: RegimePlanResponse;
      readonly fingerprint: string;
    }
  | { readonly status: 'ok'; readonly conflict: true; readonly reason: 'exact-replay' }
  | { readonly status: 'conflict'; readonly priorPlanId: string; readonly newFingerprint: string }
  | {
      readonly status: 'unavailable';
      readonly reason:
        | 'position-not-found'
        | 'ownership-mismatch'
        | 'portfolio-unavailable'
        | 'config-unavailable';
    }
  | { readonly status: 'stale'; readonly reason: 'position-stale' }
  | { readonly status: 'degraded'; readonly reason: string }
  | { readonly status: 'superseded'; readonly breachDirection: BreachDirection }
  | { readonly status: 'throttled'; readonly reason: 'active-request' | 'minimum-interval' }
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

export async function requestPositionPlan(params: {
  walletId: WalletId;
  positionId: PositionId;
  positionReadPort: SupportedPositionReadPort;
  triggerRepository: TriggerRepository;
  planRepository: PlanRepository;
  regimePlanPort: RegimePlanPort;
  executionHistoryRepository: ExecutionHistoryRepository;
  config: ResolveRegimePlanRequestConfigResult;
  clock: ClockPort;
  idGenerator?: IdGeneratorPort;
  observability: ObservabilityPort;
}): Promise<PositionPlanRequestResult> {
  const {
    walletId,
    positionId,
    positionReadPort,
    triggerRepository,
    planRepository,
    regimePlanPort,
    executionHistoryRepository,
    config,
    clock,
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

  const rangeStateKind = position.rangeState.kind;
  const closedCandleAt = makeClockTimestamp(
    Math.floor(now / CANDLE_INTERVAL_MS) * CANDLE_INTERVAL_MS,
  );

  const triggers = await triggerRepository.listActionableTriggers(walletId);
  const qualifiedTrigger = triggers.find(
    (t) => t.positionId === positionId && t.confirmationPassed,
  );
  const breachQualifiedAt = qualifiedTrigger ? qualifiedTrigger.triggeredAt : null;

  const claimResult = await planRepository.claimPlanRequest({
    positionId,
    now,
    minimumIntervalMs: MINIMUM_INTERVAL_MS,
    leaseDurationMs: LEASE_DURATION_MS,
    rangeState: rangeStateKind,
    breachQualifiedAt,
    closedCandleAt,
  });

  if (claimResult.kind === 'suppressed') {
    observability.log('info', 'RequestPositionPlan: request throttled', {
      positionId,
      reason: claimResult.reason,
    });
    return { status: 'throttled', reason: claimResult.reason };
  }

  const leaseToken = claimResult.leaseToken;
  let leaseOutcome: 'succeeded' | 'failed' = 'failed';
  let originalResult: PositionPlanRequestResult | undefined;
  let originalError: unknown;
  let finishError: unknown;

  try {
    const executeWork = async (): Promise<PositionPlanRequestResult> => {
      if (config.kind !== 'configured') {
        observability.log('warn', 'RequestPositionPlan: config unavailable', {
          positionId,
          configResult: config.kind,
        });
        return { status: 'unavailable', reason: 'config-unavailable' };
      }

      const positionDetail = await positionReadPort.getPositionDetail(walletId, positionId);
      if (!positionDetail) {
        observability.log('warn', 'RequestPositionPlan: position detail not available', {
          positionId,
        });
        return { status: 'unavailable', reason: 'portfolio-unavailable' };
      }

      const supportedPositions = await positionReadPort.listSupportedPositions(walletId);
      const walletHistory = await executionHistoryRepository.getWalletHistory(walletId);
      const existingPlan = await planRepository.getCurrentPlan(positionId);

      const request = buildRegimePlanRequest({
        positionDetail,
        config: config.config,
        asOfUnixMs: now,
        supportedPositionsCount: supportedPositions.length,
        qualifiedTrigger: qualifiedTrigger ?? null,
        walletHistory,
      });

      if (!request) {
        observability.log('warn', 'RequestPositionPlan: failed to build contract-valid request', {
          positionId,
        });
        return { status: 'unavailable', reason: 'portfolio-unavailable' };
      }

      const currentPrice =
        position.rangeState.kind === 'in-range' ||
        position.rangeState.kind === 'below-range' ||
        position.rangeState.kind === 'above-range'
          ? position.rangeState.currentPrice
          : 0;

      const fingerprint = computeFingerprint({
        positionId: position.positionId,
        lowerBoundPrice: position.bounds.lowerBound,
        upperBoundPrice: position.bounds.upperBound,
        currentPrice,
        rangeState: rangeStateKind,
        observedAt: position.lastObservedAt,
      });

      const transportResult = await regimePlanPort.requestPositionPlan(request);

      if (transportResult.kind === 'ok') {
        const response = transportResult.response;
        const planId = response.planId as PlanId;
        const canonicalHash = response.planHash as CanonicalHash;
        const advisoryActionFromResponse = extractAdvisoryAction(response);

        const createResult = await planRepository.createRequest({
          planId,
          canonicalHash,
          positionId,
          walletId,
          requestedAt: makeClockTimestamp(now),
          action: advisoryActionFromResponse,
          snapshotFingerprint: fingerprint,
        });

        if (createResult.kind === 'exact-replay') {
          leaseOutcome = 'succeeded';
          observability.log('info', 'RequestPositionPlan: exact replay detected', {
            positionId,
            planId,
          });
          return {
            status: 'ok',
            conflict: false,
            reason: 'exact-replay',
            plan: response,
            fingerprint,
          };
        }

        if (createResult.kind === 'conflict') {
          observability.log('warn', 'RequestPositionPlan: conflicting plan detected', {
            positionId,
            planId: response.planId,
          });
          return {
            status: 'conflict',
            priorPlanId: response.planId,
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
          advisoryAction: advisoryActionFromResponse,
          respondedAt: makeClockTimestamp(response.asOfUnixMs),
          asOfAt: makeClockTimestamp(response.asOfUnixMs),
          expiresAt: makeClockTimestamp(response.asOfUnixMs + CANDLE_INTERVAL_MS),
        });

        leaseOutcome = 'succeeded';

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
        if (qualifiedTrigger) {
          observability.log('info', 'RequestPositionPlan: qualified trigger outranks conflict', {
            positionId,
            triggerId: qualifiedTrigger.triggerId,
            breachDirection: qualifiedTrigger.breachDirection.kind,
          });
          return {
            status: 'superseded',
            breachDirection: qualifiedTrigger.breachDirection,
          };
        }
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
        if (qualifiedTrigger) {
          observability.log(
            'info',
            'RequestPositionPlan: qualified trigger outranks permanent error',
            {
              positionId,
              triggerId: qualifiedTrigger.triggerId,
              breachDirection: qualifiedTrigger.breachDirection.kind,
            },
          );
          return {
            status: 'superseded',
            breachDirection: qualifiedTrigger.breachDirection,
          };
        }
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
        if (qualifiedTrigger) {
          observability.log('info', 'RequestPositionPlan: qualified trigger outranks timeout', {
            positionId,
            triggerId: qualifiedTrigger.triggerId,
            breachDirection: qualifiedTrigger.breachDirection.kind,
          });
          return {
            status: 'superseded',
            breachDirection: qualifiedTrigger.breachDirection,
          };
        }
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
    };

    originalResult = await executeWork();
  } catch (err) {
    originalError = err;
  } finally {
    try {
      await planRepository.finishPlanRequest({
        positionId,
        leaseToken,
        outcome: leaseOutcome,
        completedAt: clock.now(),
      });
    } catch (finishErr) {
      observability.log('error', 'RequestPositionPlan: failed to finish plan request lease', {
        positionId,
        leaseToken,
        error: finishErr instanceof Error ? finishErr.message : String(finishErr),
      });
      finishError = finishErr;
    }
  }

  if (originalError) {
    throw originalError;
  }

  if (originalResult) {
    return originalResult;
  }

  if (finishError) {
    throw finishError;
  }

  return {
    status: 'error',
    reason: 'unknown-execution-outcome',
  };
}

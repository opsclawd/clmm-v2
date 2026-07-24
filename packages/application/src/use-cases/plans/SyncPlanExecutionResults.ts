import type {
  PlanRepository,
  RegimePlanPort,
  ClockPort,
  ObservabilityPort,
  PlanResultClaim,
  PlanExecutionResultTransportResult,
} from '../../ports/index.js';
import type { ClockTimestamp } from '@clmm/domain';
import type { RegimeExecutionResult } from '../../dto/regimePlan.js';

export type SyncPlanExecutionResultsDeps = {
  planRepository: PlanRepository;
  regimePlanPort: RegimePlanPort;
  clock: ClockPort;
  observability: ObservabilityPort;
};

const MAX_RESULT_RETRIES = 5;

const BASE_DELAY_MS = 60_000;
const MAX_DELAY_MS = 600_000;

function computeBackoff(attemptCount: number, now: number): ClockTimestamp {
  const exponentialDelay = Math.min(BASE_DELAY_MS * Math.pow(2, attemptCount), MAX_DELAY_MS);
  const jitter = Math.random() * (exponentialDelay / 2);
  return (now + exponentialDelay + jitter) as ClockTimestamp;
}

function mapDecisionKindToStatus(
  decisionKind: string | undefined,
): RegimeExecutionResult['status'] {
  switch (decisionKind) {
    case 'acknowledged':
    case 'stand-down':
    case 'executed':
      return 'SUCCESS';
    case 'failed':
      return 'FAILED';
    case 'expired':
    case 'position-changed':
    case 'rejected':
      return 'SKIPPED';
    default:
      return 'SKIPPED';
  }
}

function mapDecisionKindToReasonCode(decisionKind: string | undefined): string {
  switch (decisionKind) {
    case 'acknowledged':
      return 'ACKNOWLEDGED';
    case 'stand-down':
      return 'STAND_DOWN';
    case 'executed':
      return 'EXECUTED';
    case 'failed':
      return 'FAILED';
    case 'expired':
      return 'EXPIRED';
    case 'position-changed':
      return 'POSITION_CHANGED';
    case 'rejected':
      return 'REJECTED';
    default:
      return 'UNKNOWN';
  }
}

async function deliverResult(
  claim: PlanResultClaim,
  regimePort: RegimePlanPort,
  planRepository: PlanRepository,
  clock: ClockPort,
): Promise<PlanExecutionResultTransportResult> {
  const payload = claim.canonicalResult.payload;
  const planHash = (payload['canonicalHash'] as string) ?? '';
  const positionId = (payload['positionId'] as string) ?? '';
  const decisionKind = (payload['decisionKind'] as string | undefined) ?? 'executed';
  const storedActionKind = await planRepository.getPlanActionKind(claim.planId);
  const requestedAction = storedActionKind ?? 'HOLD';

  const regimeResult: RegimeExecutionResult = {
    schemaVersion: 'execution-result.v1',
    planId: claim.planId as string,
    planHash,
    positionId,
    requestedAction: requestedAction as RegimeExecutionResult['requestedAction'],
    status: mapDecisionKindToStatus(decisionKind),
    reasonCode: mapDecisionKindToReasonCode(decisionKind),
    completedAtUnixMs: clock.now() as number,
    idempotencyKey: claim.idempotencyKey,
  };

  return regimePort.reportExecutionResult(regimeResult);
}

export async function syncPlanExecutionResults(deps: SyncPlanExecutionResultsDeps): Promise<{
  processed: number;
  delivered: number;
  retried: number;
  exhausted: number;
  permanentlyRejected: number;
}> {
  const { planRepository, regimePlanPort, clock, observability } = deps;

  let processed = 0;
  let delivered = 0;
  let retried = 0;
  let exhausted = 0;
  let permanentlyRejected = 0;

  let claim: PlanResultClaim | null = null;
  do {
    claim = await planRepository.claimDueResult();
    if (!claim) {
      break;
    }

    processed++;

    try {
      const transportResult = await deliverResult(claim, regimePlanPort, planRepository, clock);

      if (transportResult.kind === 'ok') {
        await planRepository.completeDelivery({
          resultId: claim.resultId,
          deliveredAt: clock.now(),
        });
        delivered++;
        observability.log('info', 'Plan result delivered', {
          resultId: claim.resultId,
          planId: claim.planId,
          attemptCount: claim.attemptCount,
        });
      } else if (transportResult.kind === 'permanent') {
        await planRepository.recordPermanentFailure({
          planId: claim.planId,
          reason: `permanent:${transportResult.reason}`,
          failedAt: clock.now(),
        });
        await planRepository.abandonDelivery({
          resultId: claim.resultId,
          deliveredAt: clock.now(),
        });
        permanentlyRejected++;
        observability.log('warn', 'Plan result permanently rejected', {
          resultId: claim.resultId,
          planId: claim.planId,
          reason: transportResult.reason,
        });
      } else {
        if (claim.attemptCount >= MAX_RESULT_RETRIES) {
          await planRepository.recordPermanentFailure({
            planId: claim.planId,
            reason: 'exhausted',
            failedAt: clock.now(),
          });
          await planRepository.abandonDelivery({
            resultId: claim.resultId,
            deliveredAt: clock.now(),
          });
          exhausted++;
          observability.log('warn', 'Plan result retry exhausted', {
            resultId: claim.resultId,
            planId: claim.planId,
            attemptCount: claim.attemptCount,
          });
        } else {
          const nextAttemptAt = computeBackoff(claim.attemptCount, clock.now() as number);
          await planRepository.rescheduleRetry({
            resultId: claim.resultId,
            nextAttemptAt,
            lastError: transportResult.reason,
          });
          retried++;
          observability.log('info', 'Plan result retry scheduled', {
            resultId: claim.resultId,
            planId: claim.planId,
            attemptCount: claim.attemptCount,
            nextAttemptAt,
          });
        }
      }
    } catch (error: unknown) {
      observability.log('error', 'Plan result delivery failed with exception', {
        resultId: claim.resultId,
        planId: claim.planId,
        error: error instanceof Error ? error.message : String(error),
      });

      if (claim.attemptCount >= MAX_RESULT_RETRIES) {
        await planRepository.recordPermanentFailure({
          planId: claim.planId,
          reason: 'exhausted',
          failedAt: clock.now(),
        });
        await planRepository.abandonDelivery({
          resultId: claim.resultId,
          deliveredAt: clock.now(),
        });
        exhausted++;
      } else {
        const nextAttemptAt = computeBackoff(claim.attemptCount, clock.now() as number);
        await planRepository.rescheduleRetry({
          resultId: claim.resultId,
          nextAttemptAt,
          lastError: error instanceof Error ? error.message : String(error),
        });
        retried++;
      }
    }
  } while (claim !== null);

  observability.log('info', 'Plan result sync completed', {
    processed,
    delivered,
    retried,
    exhausted,
    permanentlyRejected,
  });

  return { processed, delivered, retried, exhausted, permanentlyRejected };
}

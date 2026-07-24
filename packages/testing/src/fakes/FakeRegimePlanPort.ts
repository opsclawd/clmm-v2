import type {
  RegimePlanPort,
  PlanRequestTransportResult,
  PlanExecutionResultTransportResult,
} from '@clmm/application';
import type {
  RegimePlanRequest,
  RegimePlanResponse,
  RegimeExecutionResult,
} from '@clmm/application';

export class FakeRegimePlanPort implements RegimePlanPort {
  private _planResponse: RegimePlanResponse | null = null;
  private _planError: PlanRequestTransportResult['kind'] | null = null;
  private _resultError: PlanExecutionResultTransportResult['kind'] | null = null;
  private _requests: RegimePlanRequest[] = [];
  private _results: RegimeExecutionResult[] = [];

  setPlanResponse(response: RegimePlanResponse): void {
    this._planResponse = response;
    this._planError = null;
  }

  setPlanError(kind: PlanRequestTransportResult['kind']): void {
    this._planError = kind;
    this._planResponse = null;
  }

  setResultError(kind: PlanExecutionResultTransportResult['kind']): void {
    this._resultError = kind;
  }

  getRequests(): readonly RegimePlanRequest[] {
    return this._requests;
  }

  getResults(): readonly RegimeExecutionResult[] {
    return this._results;
  }

  async requestPositionPlan(request: RegimePlanRequest): Promise<PlanRequestTransportResult> {
    this._requests.push(request);

    if (this._planError) {
      if (this._planError === 'ok') {
        throw new Error('Cannot set ok error kind');
      }
      if (this._planError === 'conflict') {
        return { kind: 'conflict', reason: 'fake-conflict' };
      }
      if (this._planError === 'permanent') {
        return { kind: 'permanent', reason: 'fake-permanent' };
      }
      if (this._planError === 'retryable-degraded') {
        return { kind: 'retryable-degraded', reason: 'fake-retryable' };
      }
    }

    if (this._planResponse) {
      return { kind: 'ok', response: this._planResponse };
    }

    return {
      kind: 'ok',
      response: {
        schemaVersion: 'position-plan.v1',
        planId: 'fake-plan-id',
        planHash: 'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123',
        asOfUnixMs: Date.now(),
        expiresAtUnixMs: Date.now() + 3600000,
        scope: {
          kind: 'position',
          positionId: request.position?.positionId ?? 'fake-position',
          poolAddress: request.market?.poolAddress ?? 'fake-pool',
          symbol: request.market?.symbol ?? 'SOL/USDC',
        },
        regime: 'UP',
        actions: [{ type: 'HOLD', reasonCode: 'FAKE' }],
        constraints: {
          cooldownUntilUnixMs: 0,
          standDownUntilUnixMs: 0,
          notes: ['Fake response'],
        },
        reasons: [{ code: 'FAKE', severity: 'INFO', message: 'Fake response' }],
      },
    };
  }

  async reportExecutionResult(
    result: RegimeExecutionResult,
  ): Promise<PlanExecutionResultTransportResult> {
    this._results.push(result);

    if (this._resultError) {
      if (this._resultError === 'ok') {
        return { kind: 'ok' };
      }
      if (this._resultError === 'permanent') {
        return { kind: 'permanent', reason: 'fake-permanent' };
      }
      if (this._resultError === 'retryable-degraded') {
        return { kind: 'retryable-degraded', reason: 'fake-retryable' };
      }
    }

    return { kind: 'ok' };
  }
}

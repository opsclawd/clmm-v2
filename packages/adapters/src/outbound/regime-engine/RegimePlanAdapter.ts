import type {
  ObservabilityPort,
  RegimePlanPort,
  PlanRequestTransportResult,
  PlanExecutionResultTransportResult,
} from '@clmm/application';
import type { RegimePlanRequest, RegimeExecutionResult } from '@clmm/application';
import { parseRegimePlanResponse } from '@clmm/application';

const REQUEST_TIMEOUT_MS = 5000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error['name'] === 'AbortError';
}

export class RegimePlanAdapter implements RegimePlanPort {
  private disabledLogged = false;

  constructor(
    private readonly baseUrl: string | null,
    private readonly internalToken: string | null,
    private readonly observability: ObservabilityPort,
  ) {}

  async requestPositionPlan(request: RegimePlanRequest): Promise<PlanRequestTransportResult> {
    const startMs = Date.now();

    if (!this.baseUrl || !this.internalToken) {
      if (!this.disabledLogged) {
        this.observability.log(
          'warn',
          'RegimePlan adapter disabled — missing baseUrl or internalToken',
        );
        this.disabledLogged = true;
      }
      return { kind: 'permanent', reason: 'adapter-disabled' };
    }

    let url: URL;
    try {
      url = new URL(`${this.baseUrl.replace(/\/+$/, '')}/v1/position-plan`);
    } catch {
      this.observability.log('warn', 'RegimePlan base URL is malformed', { baseUrl: this.baseUrl });
      return { kind: 'permanent', reason: 'config-error' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CLMM-Internal-Token': this.internalToken,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timer);
      const durationMs = Date.now() - startMs;

      if (response.status === 200) {
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          this.observability.log('warn', 'RegimePlan response was not valid JSON', {
            planId: request.position?.positionId,
            durationMs,
          });
          return { kind: 'permanent', reason: 'malformed-body' };
        }

        const validated = parseRegimePlanResponse(body);
        if (!validated) {
          this.observability.log('warn', 'RegimePlan response failed schema validation', {
            planId: request.position?.positionId,
            durationMs,
          });
          return { kind: 'permanent', reason: 'schema-invalid' };
        }

        this.observability.log('info', 'RegimePlan request succeeded', {
          planId: validated.planId,
          positionId: validated.scope.positionId,
          statusClass: 'ok',
          durationMs,
        });
        return { kind: 'ok', response: validated };
      }

      if (response.status === 409) {
        const envelope = await this.readErrorEnvelope(response);
        this.observability.log('info', 'RegimePlan conflict', {
          planId: request.position?.positionId,
          statusClass: 'conflict',
          durationMs,
          reason: envelope?.message ?? 'unknown',
        });
        return { kind: 'conflict', reason: envelope?.message ?? 'conflict' };
      }

      if (response.status === 401 || response.status === 403) {
        const envelope = await this.readErrorEnvelope(response);
        this.observability.log('error', 'RegimePlan auth failure', {
          planId: request.position?.positionId,
          statusClass: 'permanent',
          durationMs,
          reason: envelope?.message ?? 'unauthorized',
        });
        return { kind: 'permanent', reason: envelope?.message ?? 'unauthorized' };
      }

      if (response.status === 400) {
        const envelope = await this.readErrorEnvelope(response);
        this.observability.log('warn', 'RegimePlan validation error', {
          planId: request.position?.positionId,
          statusClass: 'permanent',
          durationMs,
          reason: envelope?.message ?? 'validation-error',
        });
        return { kind: 'permanent', reason: envelope?.message ?? 'validation-error' };
      }

      if (response.status >= 500) {
        this.observability.log('warn', 'RegimePlan server error', {
          planId: request.position?.positionId,
          statusClass: 'retryable-degraded',
          durationMs,
          status: response.status,
        });
        return { kind: 'retryable-degraded', reason: `server-error-${response.status}` };
      }

      this.observability.log('warn', 'RegimePlan unexpected status', {
        planId: request.position?.positionId,
        statusClass: 'retryable-degraded',
        durationMs,
        status: response.status,
      });
      return { kind: 'retryable-degraded', reason: `unexpected-status-${response.status}` };
    } catch (error: unknown) {
      clearTimeout(timer);
      const durationMs = Date.now() - startMs;

      if (isAbortError(error)) {
        this.observability.log('warn', 'RegimePlan request timeout', {
          planId: request.position?.positionId,
          statusClass: 'retryable-degraded',
          durationMs,
          reason: 'timeout',
        });
        return { kind: 'retryable-degraded', reason: 'timeout' };
      }

      const message = error instanceof Error ? error.message : String(error);
      this.observability.log('warn', 'RegimePlan network error', {
        planId: request.position?.positionId,
        statusClass: 'retryable-degraded',
        durationMs,
        reason: message,
      });
      return { kind: 'retryable-degraded', reason: 'network-error' };
    }
  }

  async reportExecutionResult(
    result: RegimeExecutionResult,
  ): Promise<PlanExecutionResultTransportResult> {
    const startMs = Date.now();

    if (!this.baseUrl || !this.internalToken) {
      if (!this.disabledLogged) {
        this.observability.log(
          'warn',
          'RegimePlan adapter disabled — missing baseUrl or internalToken',
        );
        this.disabledLogged = true;
      }
      return { kind: 'permanent', reason: 'adapter-disabled' };
    }

    let url: URL;
    try {
      url = new URL(`${this.baseUrl.replace(/\/+$/, '')}/v1/execution-result`);
    } catch {
      this.observability.log('warn', 'RegimePlan base URL is malformed', { baseUrl: this.baseUrl });
      return { kind: 'permanent', reason: 'config-error' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CLMM-Internal-Token': this.internalToken,
        },
        body: JSON.stringify(result),
        signal: controller.signal,
      });

      clearTimeout(timer);
      const durationMs = Date.now() - startMs;

      if (response.status === 200 || response.status === 201 || response.status === 202) {
        this.observability.log('info', 'RegimePlan execution result reported', {
          resultId: result.idempotencyKey,
          planId: result.planId,
          positionId: result.positionId,
          statusClass: 'ok',
          durationMs,
        });
        return { kind: 'ok' };
      }

      if (response.status === 401 || response.status === 403) {
        const envelope = await this.readErrorEnvelope(response);
        this.observability.log('error', 'RegimePlan result auth failure', {
          resultId: result.idempotencyKey,
          planId: result.planId,
          positionId: result.positionId,
          statusClass: 'permanent',
          durationMs,
          reason: envelope?.message ?? 'unauthorized',
        });
        return { kind: 'permanent', reason: envelope?.message ?? 'unauthorized' };
      }

      if (response.status === 400) {
        const envelope = await this.readErrorEnvelope(response);
        this.observability.log('warn', 'RegimePlan result validation error', {
          resultId: result.idempotencyKey,
          planId: result.planId,
          positionId: result.positionId,
          statusClass: 'permanent',
          durationMs,
          reason: envelope?.message ?? 'validation-error',
        });
        return { kind: 'permanent', reason: envelope?.message ?? 'validation-error' };
      }

      if (response.status >= 500) {
        this.observability.log('warn', 'RegimePlan result server error', {
          resultId: result.idempotencyKey,
          planId: result.planId,
          positionId: result.positionId,
          statusClass: 'retryable-degraded',
          durationMs,
          status: response.status,
        });
        return { kind: 'retryable-degraded', reason: `server-error-${response.status}` };
      }

      this.observability.log('warn', 'RegimePlan result unexpected status', {
        resultId: result.idempotencyKey,
        planId: result.planId,
        positionId: result.positionId,
        statusClass: 'retryable-degraded',
        durationMs,
        status: response.status,
      });
      return { kind: 'retryable-degraded', reason: `unexpected-status-${response.status}` };
    } catch (error: unknown) {
      clearTimeout(timer);
      const durationMs = Date.now() - startMs;

      if (isAbortError(error)) {
        this.observability.log('warn', 'RegimePlan result request timeout', {
          resultId: result.idempotencyKey,
          planId: result.planId,
          positionId: result.positionId,
          statusClass: 'retryable-degraded',
          durationMs,
          reason: 'timeout',
        });
        return { kind: 'retryable-degraded', reason: 'timeout' };
      }

      const message = error instanceof Error ? error.message : String(error);
      this.observability.log('warn', 'RegimePlan result network error', {
        resultId: result.idempotencyKey,
        planId: result.planId,
        positionId: result.positionId,
        statusClass: 'retryable-degraded',
        durationMs,
        reason: message,
      });
      return { kind: 'retryable-degraded', reason: 'network-error' };
    }
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
    } catch (err: unknown) {
      if (isAbortError(err)) throw err;
      return null;
    }
  }
}

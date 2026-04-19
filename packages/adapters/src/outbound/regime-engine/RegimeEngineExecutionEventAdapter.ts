import type { ObservabilityPort, StoredExecutionAttempt, ClockPort } from '@clmm/application';
import type { ClmmExecutionEventRequest, RegimeEngineEventPort } from './types.js';

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 5000;
const BACKOFF_MS = [500, 1000];

export class RegimeEngineExecutionEventAdapter implements RegimeEngineEventPort {
  private disabledLogged = false;

  constructor(
    private readonly baseUrl: string | null,
    private readonly internalToken: string | null,
    private readonly observability: ObservabilityPort,
  ) {}

  async notifyExecutionEvent(event: ClmmExecutionEventRequest): Promise<void> {
    if (!this.baseUrl || !this.internalToken) {
      if (!this.disabledLogged) {
        this.observability.log('info', 'RegimeEngine event adapter: disabled — missing baseUrl or internalToken');
        this.disabledLogged = true;
      }
      return;
    }

    const url = `${this.baseUrl.replace(/\/+$/, '')}/v1/clmm-execution-result`;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CLMM-Internal-Token': this.internalToken,
          },
          body: JSON.stringify(event),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (res.ok) {
          return;
        }

        if (res.status === 409) {
          this.observability.log('info', 'RegimeEngine: idempotent conflict', {
            correlationId: event.correlationId,
            idempotent: true,
          });
          return;
        }

        if (res.status >= 400 && res.status < 500) {
          this.observability.log('error', `RegimeEngine: client error ${res.status}`, {
            correlationId: event.correlationId,
            status: res.status,
          });
          return;
        }

        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise<void>(r => setTimeout(r, BACKOFF_MS[attempt] ?? 1000));
          continue;
        }

        this.observability.log('error', 'RegimeEngine: terminal failure after retries', {
          correlationId: event.correlationId,
          attempts: MAX_ATTEMPTS,
          lastStatus: res.status,
        });
        return;
      } catch (err: unknown) {
        clearTimeout(timer);

        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise<void>(r => setTimeout(r, BACKOFF_MS[attempt] ?? 1000));
          continue;
        }

        const errName = err instanceof Error ? err.name : 'unknown';
        this.observability.log('error', 'RegimeEngine: terminal failure after retries', {
          correlationId: event.correlationId,
          attempts: MAX_ATTEMPTS,
          lastStatus: errName,
        });
        return;
      }
    }
  }
}

export function buildClmmExecutionEvent(
  attempt: StoredExecutionAttempt,
  finalKind: 'confirmed' | 'failed',
  clock: ClockPort,
  tokenOut: 'USDC' | 'SOL',
): ClmmExecutionEventRequest {
  const isLower = attempt.breachDirection.kind === 'lower-bound-breach';

  let txSignature: string;
  if (finalKind === 'confirmed') {
    const swapRef = attempt.transactionReferences.find(r => r.stepKind === 'swap-assets');
    if (swapRef) {
      txSignature = swapRef.signature;
    } else if (attempt.transactionReferences.length > 0) {
      txSignature = attempt.transactionReferences[attempt.transactionReferences.length - 1]!.signature;
    } else {
      txSignature = '';
    }
  } else {
    if (attempt.transactionReferences.length > 0) {
      txSignature = attempt.transactionReferences[attempt.transactionReferences.length - 1]!.signature;
    } else {
      txSignature = '';
    }
  }

  const result: ClmmExecutionEventRequest = {
    schemaVersion: '1.0',
    correlationId: attempt.attemptId,
    positionId: attempt.positionId,
    breachDirection: isLower ? 'LowerBoundBreach' : 'UpperBoundBreach',
    reconciledAtIso: new Date(clock.now()).toISOString(),
    txSignature,
    tokenOut,
    status: finalKind,
  };

  if (attempt.episodeId != null) {
    result.episodeId = attempt.episodeId;
  }
  if (attempt.previewId != null) {
    result.previewId = attempt.previewId;
  }

  return result;
}

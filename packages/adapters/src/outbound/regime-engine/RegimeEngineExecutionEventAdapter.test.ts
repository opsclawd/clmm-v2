import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ObservabilityPort, ClockPort, StoredExecutionAttempt } from '@clmm/application';
import type { PositionId, BreachEpisodeId } from '@clmm/domain';
import { RegimeEngineExecutionEventAdapter, buildClmmExecutionEvent } from './RegimeEngineExecutionEventAdapter.js';
import type { ClmmExecutionEventRequest } from './types.js';

interface FakeLogEntry {
  level: string;
  message: string;
  context: Record<string, unknown> | undefined;
}

function createFakeObservability() {
  const logs: FakeLogEntry[] = [];
  const port: ObservabilityPort = {
    log(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>) {
      logs.push({ level, message, context });
    },
    recordTiming() {},
    recordDetectionTiming() {},
    recordDeliveryTiming() {},
  };
  return { logs, port };
}

function makeEvent(overrides?: Partial<ClmmExecutionEventRequest>): ClmmExecutionEventRequest {
  return {
    schemaVersion: '1.0',
    correlationId: 'corr-1',
    positionId: 'pos-1',
    breachDirection: 'LowerBoundBreach',
    reconciledAtIso: new Date().toISOString(),
    txSignature: 'sig-1',
    tokenOut: 'USDC',
    status: 'confirmed',
    ...overrides,
  };
}

function makeClock(ms: number): ClockPort {
  return {
    now: () => ms as unknown as ReturnType<ClockPort['now']>,
  };
}

function makeAttempt(overrides: Partial<StoredExecutionAttempt> = {}): StoredExecutionAttempt {
  return {
    attemptId: 'attempt-1',
    positionId: 'pos-1' as unknown as PositionId,
    breachDirection: { kind: 'lower-bound-breach' } as unknown as StoredExecutionAttempt['breachDirection'],
    lifecycleState: { kind: 'confirmed' } as unknown as StoredExecutionAttempt['lifecycleState'],
    completedSteps: ['remove-liquidity', 'collect-fees', 'swap-assets'] as unknown as StoredExecutionAttempt['completedSteps'],
    transactionReferences: [
      { signature: 'sig-remove', stepKind: 'remove-liquidity' },
      { signature: 'sig-collect', stepKind: 'collect-fees' },
      { signature: 'sig-swap', stepKind: 'swap-assets' },
    ] as unknown as StoredExecutionAttempt['transactionReferences'],
    ...overrides,
  };
}

describe('RegimeEngineExecutionEventAdapter', () => {
  let fakeObs: ReturnType<typeof createFakeObservability>;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeObs = createFakeObservability();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('happy path', () => {
    it('POSTs to correct URL with headers and resolves on 200', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, correlationId: 'corr-1' }),
      } as Response);

      const adapter = new RegimeEngineExecutionEventAdapter(
        'https://regime.example.com',
        'secret-token',
        fakeObs.port,
      );

      const event = makeEvent();
      await adapter.notifyExecutionEvent(event);

      expect(global.fetch).toHaveBeenCalledOnce();
      const call = vi.mocked(global.fetch).mock.calls[0]!;
      expect(call[0]).toBe('https://regime.example.com/v1/clmm-execution-result');
      const opts = call[1]!;
      expect(opts.method).toBe('POST');
      expect(opts.headers).toEqual({
        'Content-Type': 'application/json',
        'X-CLMM-Internal-Token': 'secret-token',
      });
      expect(JSON.parse(opts.body as string)).toEqual(event);
    });

    it('resolves on 200 with idempotent flag in response', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, correlationId: 'corr-1', idempotent: true }),
      } as Response);

      const adapter = new RegimeEngineExecutionEventAdapter(
        'https://regime.example.com',
        'secret-token',
        fakeObs.port,
      );

      await adapter.notifyExecutionEvent(makeEvent());
      expect(global.fetch).toHaveBeenCalledOnce();
    });
  });

  describe('retry on server error', () => {
    it('retries on 500 then succeeds on attempt 2', async () => {
      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
        .mockResolvedValueOnce({ ok: true, status: 200 } as Response);

      const adapter = new RegimeEngineExecutionEventAdapter(
        'https://regime.example.com',
        'secret-token',
        fakeObs.port,
      );

      const before = Date.now();
      await adapter.notifyExecutionEvent(makeEvent());
      const elapsed = Date.now() - before;

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(elapsed).toBeGreaterThanOrEqual(400);
    });

    it('retries 3 times on 503 then resolves with error log', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 503 } as Response);

      const adapter = new RegimeEngineExecutionEventAdapter(
        'https://regime.example.com',
        'secret-token',
        fakeObs.port,
      );

      await adapter.notifyExecutionEvent(makeEvent({ correlationId: 'corr-503' }));

      expect(global.fetch).toHaveBeenCalledTimes(3);
      const errorLogs = fakeObs.logs.filter(l => l.level === 'error');
      expect(errorLogs).toHaveLength(1);
      expect(errorLogs[0]!.context).toMatchObject({
        correlationId: 'corr-503',
        attempts: 3,
        lastStatus: 503,
      });
    });
  });

  describe('client errors', () => {
    it('resolves without retry on 409 and logs info with idempotent', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: false, status: 409 } as Response);

      const adapter = new RegimeEngineExecutionEventAdapter(
        'https://regime.example.com',
        'secret-token',
        fakeObs.port,
      );

      await adapter.notifyExecutionEvent(makeEvent({ correlationId: 'corr-409' }));

      expect(global.fetch).toHaveBeenCalledOnce();
      const infoLogs = fakeObs.logs.filter(l => l.level === 'info');
      expect(infoLogs).toHaveLength(1);
      expect(infoLogs[0]!.context).toMatchObject({
        correlationId: 'corr-409',
        idempotent: true,
      });
    });

    it('resolves without retry on 401 and logs error', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: false, status: 401 } as Response);

      const adapter = new RegimeEngineExecutionEventAdapter(
        'https://regime.example.com',
        'secret-token',
        fakeObs.port,
      );

      await adapter.notifyExecutionEvent(makeEvent({ correlationId: 'corr-401' }));

      expect(global.fetch).toHaveBeenCalledOnce();
      const errorLogs = fakeObs.logs.filter(l => l.level === 'error');
      expect(errorLogs).toHaveLength(1);
      expect(errorLogs[0]!.context).toMatchObject({
        correlationId: 'corr-401',
        status: 401,
      });
    });
  });

  describe('network failure', () => {
    it('retries up to 3 on TypeError then resolves', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

      const adapter = new RegimeEngineExecutionEventAdapter(
        'https://regime.example.com',
        'secret-token',
        fakeObs.port,
      );

      await adapter.notifyExecutionEvent(makeEvent({ correlationId: 'corr-net' }));

      expect(global.fetch).toHaveBeenCalledTimes(3);
      const errorLogs = fakeObs.logs.filter(l => l.level === 'error');
      expect(errorLogs).toHaveLength(1);
      expect(errorLogs[0]!.context).toMatchObject({
        correlationId: 'corr-net',
        attempts: 3,
      });
    });
  });

  describe('timeout', () => {
    it('aborts after 5s and retries', async () => {
      vi.useFakeTimers();

      vi.spyOn(global, 'fetch')
        .mockImplementationOnce(() => new Promise((_, reject) => {
          setTimeout(() => reject(new DOMException('The operation was aborted', 'AbortError')), 5500);
        }))
        .mockResolvedValueOnce({ ok: true, status: 200 } as Response);

      const adapter = new RegimeEngineExecutionEventAdapter(
        'https://regime.example.com',
        'secret-token',
        fakeObs.port,
      );

      const p = adapter.notifyExecutionEvent(makeEvent());

      await vi.advanceTimersByTimeAsync(5500);
      await vi.advanceTimersByTimeAsync(500);
      await vi.runAllTimersAsync();

      const result = await p;
      expect(result).toBeUndefined();
      expect(global.fetch).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });

  describe('disabled (no-op) adapter', () => {
    it('logs info once when baseUrl is null then silently resolves subsequent calls', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch');

      const adapter = new RegimeEngineExecutionEventAdapter(null, 'token', fakeObs.port);

      await adapter.notifyExecutionEvent(makeEvent());
      await adapter.notifyExecutionEvent(makeEvent());

      const infoLogs = fakeObs.logs.filter(l => l.message.includes('disabled'));
      expect(infoLogs).toHaveLength(1);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('logs info once when internalToken is null', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch');

      const adapter = new RegimeEngineExecutionEventAdapter('https://regime.example.com', null, fakeObs.port);

      await adapter.notifyExecutionEvent(makeEvent());

      const infoLogs = fakeObs.logs.filter(l => l.message.includes('disabled'));
      expect(infoLogs).toHaveLength(1);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('baseUrl trailing slash', () => {
    it('handles baseUrl with trailing slash without double slash', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: true, status: 200 } as Response);

      const adapter = new RegimeEngineExecutionEventAdapter(
        'https://regime.example.com/',
        'secret-token',
        fakeObs.port,
      );

      await adapter.notifyExecutionEvent(makeEvent());

      const call = vi.mocked(global.fetch).mock.calls[0]!;
      expect(call[0]).toBe('https://regime.example.com/v1/clmm-execution-result');
      expect(call[0]).not.toContain('//v1');
    });

    it('handles baseUrl without trailing slash', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: true, status: 200 } as Response);

      const adapter = new RegimeEngineExecutionEventAdapter(
        'https://regime.example.com',
        'secret-token',
        fakeObs.port,
      );

      await adapter.notifyExecutionEvent(makeEvent());

      const call = vi.mocked(global.fetch).mock.calls[0]!;
      expect(call[0]).toBe('https://regime.example.com/v1/clmm-execution-result');
    });
  });

  describe('never rejects', () => {
    it('always resolves even when fetch throws', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('catastrophic'));

      const adapter = new RegimeEngineExecutionEventAdapter(
        'https://regime.example.com',
        'secret-token',
        fakeObs.port,
      );

      await expect(adapter.notifyExecutionEvent(makeEvent())).resolves.toBeUndefined();
    });
  });
});

describe('buildClmmExecutionEvent', () => {
  const clock = makeClock(1700000000000);

  it('maps lower-bound-breach + confirmed correctly', () => {
    const result = buildClmmExecutionEvent(makeAttempt(), 'confirmed', clock, 'USDC');
    expect(result.breachDirection).toBe('LowerBoundBreach');
    expect(result.tokenOut).toBe('USDC');
    expect(result.status).toBe('confirmed');
  });

  it('maps upper-bound-breach + confirmed correctly', () => {
    const result = buildClmmExecutionEvent(
      makeAttempt({ breachDirection: { kind: 'upper-bound-breach' } as unknown as StoredExecutionAttempt['breachDirection'] }),
      'confirmed',
      clock,
      'SOL',
    );
    expect(result.breachDirection).toBe('UpperBoundBreach');
    expect(result.tokenOut).toBe('SOL');
    expect(result.status).toBe('confirmed');
  });

  it('picks swap-assets signature for confirmed', () => {
    const result = buildClmmExecutionEvent(makeAttempt(), 'confirmed', clock, 'USDC');
    expect(result.txSignature).toBe('sig-swap');
  });

  it('picks last reference for confirmed when no swap-assets ref', () => {
    const result = buildClmmExecutionEvent(
      makeAttempt({
        transactionReferences: [
          { signature: 'sig-a', stepKind: 'remove-liquidity' },
          { signature: 'sig-b', stepKind: 'collect-fees' },
        ] as unknown as StoredExecutionAttempt['transactionReferences'],
      }),
      'confirmed',
      clock,
      'USDC',
    );
    expect(result.txSignature).toBe('sig-b');
  });

  it('picks last reference for failed', () => {
    const result = buildClmmExecutionEvent(
      makeAttempt({
        transactionReferences: [
          { signature: 'sig-a', stepKind: 'remove-liquidity' },
          { signature: 'sig-b', stepKind: 'swap-assets' },
        ] as unknown as StoredExecutionAttempt['transactionReferences'],
      }),
      'failed',
      clock,
      'SOL',
    );
    expect(result.txSignature).toBe('sig-b');
  });

  it('returns empty string for txSignature with empty refs on failed', () => {
    const result = buildClmmExecutionEvent(
      makeAttempt({ transactionReferences: [] as unknown as StoredExecutionAttempt['transactionReferences'] }),
      'failed',
      clock,
      'USDC',
    );
    expect(result.txSignature).toBe('');
  });

  it('returns empty string for txSignature with empty refs on confirmed', () => {
    const result = buildClmmExecutionEvent(
      makeAttempt({ transactionReferences: [] as unknown as StoredExecutionAttempt['transactionReferences'] }),
      'confirmed',
      clock,
      'USDC',
    );
    expect(result.txSignature).toBe('');
  });

  it('forwards episodeId when present', () => {
    const result = buildClmmExecutionEvent(
      makeAttempt({ episodeId: 'ep-1' as unknown as BreachEpisodeId }),
      'confirmed',
      clock,
      'USDC',
    );
    expect(result.episodeId).toBe('ep-1');
  });

  it('omits episodeId when absent', () => {
    const result = buildClmmExecutionEvent(makeAttempt(), 'confirmed', clock, 'USDC');
    expect(result.episodeId).toBeUndefined();
  });

  it('forwards previewId when present', () => {
    const result = buildClmmExecutionEvent(
      makeAttempt({ previewId: 'prev-1' }),
      'confirmed',
      clock,
      'USDC',
    );
    expect(result.previewId).toBe('prev-1');
  });

  it('omits previewId when absent', () => {
    const result = buildClmmExecutionEvent(makeAttempt(), 'confirmed', clock, 'USDC');
    expect(result.previewId).toBeUndefined();
  });

  it('uses clock.now() for reconciledAtIso', () => {
    const result = buildClmmExecutionEvent(makeAttempt(), 'confirmed', clock, 'USDC');
    expect(result.reconciledAtIso).toBe(new Date(1700000000000).toISOString());
  });

  it('sets correlationId from attemptId', () => {
    const result = buildClmmExecutionEvent(makeAttempt(), 'confirmed', clock, 'USDC');
    expect(result.correlationId).toBe('attempt-1');
  });
});

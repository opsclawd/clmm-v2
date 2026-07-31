import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RegimePlanAdapter } from './RegimePlanAdapter.js';
import type {
  ObservabilityPort,
  RegimePlanRequest,
  RegimeExecutionResult,
} from '@clmm/application';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

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

import inRangeFixture from '../../../../../schemas/regime-engine/plan-request.v1/fixtures/valid/in-range.json';

const VALID_PLAN_REQUEST: RegimePlanRequest = inRangeFixture as unknown as RegimePlanRequest;

const VALID_EXECUTION_RESULT: RegimeExecutionResult = {
  schemaVersion: 'execution-result.v1',
  planId: 'plan_exit_987654321',
  planHash: 'f9e8d7c6b5a40123456789abcdef0123456789abcdef0123456789abcdef0123',
  positionId: 'pos_sol_usdc_02',
  requestedAction: 'REQUEST_EXIT_CLMM',
  status: 'SUCCESS',
  reasonCode: 'EXECUTED_BY_USER',
  completedAtUnixMs: 1700000100000,
  idempotencyKey: 'idem_exit_987654321_01',
  attemptId: 'att_12345',
  txSignature: '5w3z2193847293847293847293847293847293847',
  costs: {
    txFeesUsd: 0.001,
    priorityFeesUsd: 0.0005,
    slippageUsd: 0.01,
  },
};

describe('RegimePlanAdapter', () => {
  let obs: ReturnType<typeof createFakeObservability>;

  beforeEach(() => {
    obs = createFakeObservability();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('requestPositionPlan', () => {
    it('posts the exact canonical position-plan request', async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            schemaVersion: 'position-plan.v1',
            planId: 'plan_hold_123456789',
            planHash: 'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123',
            asOfUnixMs: 1700000000000,
            expiresAtUnixMs: 1700003600000,
            scope: {
              kind: 'position',
              positionId: 'pos_sol_usdc_01',
              poolAddress: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
              symbol: 'SOL/USDC',
            },
            regime: 'UP',
            actions: [{ type: 'HOLD', reasonCode: 'IN_RANGE_STABLE' }],
            constraints: {
              cooldownUntilUnixMs: 0,
              standDownUntilUnixMs: 0,
              notes: ['Position in optimal range'],
            },
            reasons: [
              {
                code: 'IN_RANGE_STABLE',
                severity: 'INFO',
                message: 'Position is operating safely within bounds.',
              },
            ],
          }),
          { status: 200 },
        ),
      );

      const adapter = new RegimePlanAdapter('https://regime.example.com', 'test-token', obs.port);
      await adapter.requestPositionPlan(VALID_PLAN_REQUEST);

      const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
      const calledMethod = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.method as string;
      const calledHeaders = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]!
        .headers as Record<string, string>;
      const calledBody = JSON.parse(
        (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.body as string,
      ) as Record<string, unknown>;

      expect(calledUrl).toBe('https://regime.example.com/v1/plan');
      expect(calledMethod).toBe('POST');
      expect(calledHeaders['Content-Type']).toBe('application/json');
      expect(calledHeaders['X-CLMM-Internal-Token']).toBe('test-token');
      expect(calledBody['schemaVersion']).toBe('plan-request.v1');
      expect((calledBody['market'] as Record<string, unknown>)['symbol']).toBe('SOL/USDC');
      expect((calledBody['market'] as Record<string, unknown>)['source']).toBe('geckoterminal');
      expect((calledBody['market'] as Record<string, unknown>)['network']).toBe('solana');
      expect((calledBody['market'] as Record<string, unknown>)['poolAddress']).toBe('Hf2vQZk...');
      expect((calledBody['market'] as Record<string, unknown>)['timeframe']).toBe('1h');
      expect((calledBody['position'] as Record<string, unknown>)['positionId']).toBe(
        'pos-sol-usdc-1',
      );
    });

    it('authenticates both write endpoints', async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            schemaVersion: 'position-plan.v1',
            planId: 'plan_hold_123456789',
            planHash: 'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123',
            asOfUnixMs: 1700000000000,
            expiresAtUnixMs: 1700003600000,
            scope: {
              kind: 'position',
              positionId: 'pos_sol_usdc_01',
              poolAddress: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
              symbol: 'SOL/USDC',
            },
            regime: 'UP',
            actions: [{ type: 'HOLD', reasonCode: 'IN_RANGE_STABLE' }],
            constraints: { cooldownUntilUnixMs: 0, standDownUntilUnixMs: 0, notes: [] },
            reasons: [],
          }),
          { status: 200 },
        ),
      );

      const adapter = new RegimePlanAdapter('https://regime.example.com', 'secret-token', obs.port);
      await adapter.requestPositionPlan(VALID_PLAN_REQUEST);

      const planHeaders = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.headers as Record<
        string,
        string
      >;
      expect(planHeaders['X-CLMM-Internal-Token']).toBe('secret-token');

      vi.mocked(fetch).mockClear();

      vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

      await adapter.reportExecutionResult(VALID_EXECUTION_RESULT);

      const resultHeaders = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]!
        .headers as Record<string, string>;
      expect(resultHeaders['X-CLMM-Internal-Token']).toBe('secret-token');
    });

    it('fails closed on unknown action version and malformed body', async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            schemaVersion: 'position-plan.v1',
            planId: 'plan_invalid_01',
            planHash: 'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123',
            asOfUnixMs: 1700000000000,
            expiresAtUnixMs: 1700003600000,
            scope: {
              kind: 'position',
              positionId: 'pos_sol_usdc_01',
              poolAddress: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
              symbol: 'SOL/USDC',
            },
            regime: 'UP',
            actions: [{ type: 'REQUEST_ENTER_CLMM', reasonCode: 'ENTRY_OPPORTUNITY' }],
            constraints: { cooldownUntilUnixMs: 0, standDownUntilUnixMs: 0, notes: [] },
            reasons: [],
          }),
          { status: 200 },
        ),
      );

      const adapter = new RegimePlanAdapter('https://regime.example.com', 'test-token', obs.port);
      const result = await adapter.requestPositionPlan(VALID_PLAN_REQUEST);

      expect(result.kind).toBe('permanent');
      if (result.kind !== 'permanent') return;
      expect(result.reason).toBe('schema-invalid');
      expect(obs.logs.some((l) => l.message.includes('schema validation'))).toBe(true);
    });

    it('fails closed on malformed JSON body', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response('not json', { status: 200 }));

      const adapter = new RegimePlanAdapter('https://regime.example.com', 'test-token', obs.port);
      const result = await adapter.requestPositionPlan(VALID_PLAN_REQUEST);

      expect(result.kind).toBe('permanent');
      if (result.kind !== 'permanent') return;
      expect(result.reason).toBe('malformed-body');
    });

    it('fails closed on expiresAt before asOf', async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            schemaVersion: 'position-plan.v1',
            planId: 'plan_hold_123456789',
            planHash: 'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123',
            asOfUnixMs: 1700003600000,
            expiresAtUnixMs: 1700000000000,
            scope: {
              kind: 'position',
              positionId: 'pos_sol_usdc_01',
              poolAddress: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
              symbol: 'SOL/USDC',
            },
            regime: 'UP',
            actions: [{ type: 'HOLD', reasonCode: 'IN_RANGE_STABLE' }],
            constraints: { cooldownUntilUnixMs: 0, standDownUntilUnixMs: 0, notes: [] },
            reasons: [],
          }),
          { status: 200 },
        ),
      );

      const adapter = new RegimePlanAdapter('https://regime.example.com', 'test-token', obs.port);
      const result = await adapter.requestPositionPlan(VALID_PLAN_REQUEST);

      expect(result.kind).toBe('permanent');
      if (result.kind !== 'permanent') return;
      expect(result.reason).toBe('schema-invalid');
    });

    it('classifies timeout and server failure as degraded', async () => {
      vi.useFakeTimers();
      vi.mocked(fetch).mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject({ name: 'AbortError' }), 100);
          }),
      );

      const adapter = new RegimePlanAdapter('https://regime.example.com', 'test-token', obs.port);
      const pending = adapter.requestPositionPlan(VALID_PLAN_REQUEST);

      await vi.advanceTimersByTimeAsync(5000);
      const result = await pending;

      expect(result.kind).toBe('retryable-degraded');
      if (result.kind !== 'retryable-degraded') return;
      expect(result.reason).toBe('timeout');
      vi.useRealTimers();

      vi.mocked(fetch).mockClear();
      vi.mocked(fetch).mockResolvedValue(new Response('Server Error', { status: 502 }));

      const adapter2 = new RegimePlanAdapter('https://regime.example.com', 'test-token', obs.port);
      const result2 = await adapter2.requestPositionPlan(VALID_PLAN_REQUEST);

      expect(result2.kind).toBe('retryable-degraded');
      if (result2.kind !== 'retryable-degraded') return;
      expect(result2.reason).toBe('server-error-502');

      vi.mocked(fetch).mockClear();
      vi.mocked(fetch).mockRejectedValue(new Error('ECONNRESET'));

      const adapter3 = new RegimePlanAdapter('https://regime.example.com', 'test-token', obs.port);
      const result3 = await adapter3.requestPositionPlan(VALID_PLAN_REQUEST);

      expect(result3.kind).toBe('retryable-degraded');
      if (result3.kind !== 'retryable-degraded') return;
      expect(result3.reason).toBe('network-error');
    });

    it('classifies auth validation and conflict as permanent', async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'CONFLICT', message: 'Plan already exists' } }),
          {
            status: 409,
          },
        ),
      );

      const adapter = new RegimePlanAdapter('https://regime.example.com', 'test-token', obs.port);
      const result = await adapter.requestPositionPlan(VALID_PLAN_REQUEST);

      expect(result.kind).toBe('conflict');
      if (result.kind !== 'conflict') return;
      expect(result.reason).toBe('Plan already exists');
      expect(obs.logs.some((l) => l.context?.['statusClass'] === 'conflict')).toBe(true);

      vi.mocked(fetch).mockClear();
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }),
          {
            status: 401,
          },
        ),
      );

      const adapter2 = new RegimePlanAdapter('https://regime.example.com', 'test-token', obs.port);
      const result2 = await adapter2.requestPositionPlan(VALID_PLAN_REQUEST);

      expect(result2.kind).toBe('permanent');
      if (result2.kind !== 'permanent') return;
      expect(result2.reason).toBe('Invalid token');
      expect(obs.logs.some((l) => l.context?.['statusClass'] === 'permanent')).toBe(true);

      vi.mocked(fetch).mockClear();
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Bad request' } }),
          {
            status: 400,
          },
        ),
      );

      const adapter3 = new RegimePlanAdapter('https://regime.example.com', 'test-token', obs.port);
      const result3 = await adapter3.requestPositionPlan(VALID_PLAN_REQUEST);

      expect(result3.kind).toBe('permanent');
      if (result3.kind !== 'permanent') return;
      expect(result3.reason).toBe('Bad request');
    });

    it('returns permanent when baseUrl is null', async () => {
      const adapter = new RegimePlanAdapter(null, 'test-token', obs.port);
      const result = await adapter.requestPositionPlan(VALID_PLAN_REQUEST);

      expect(result.kind).toBe('permanent');
      if (result.kind !== 'permanent') return;
      expect(result.reason).toBe('adapter-disabled');
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    });

    it('returns permanent when baseUrl is malformed', async () => {
      const adapter = new RegimePlanAdapter('not-a-url', 'test-token', obs.port);
      const result = await adapter.requestPositionPlan(VALID_PLAN_REQUEST);

      expect(result.kind).toBe('permanent');
      if (result.kind !== 'permanent') return;
      expect(result.reason).toBe('config-error');
    });

    it('strips trailing slash from baseUrl', async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            schemaVersion: 'position-plan.v1',
            planId: 'plan_hold_123456789',
            planHash: 'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123',
            asOfUnixMs: 1700000000000,
            expiresAtUnixMs: 1700003600000,
            scope: {
              kind: 'position',
              positionId: 'pos_sol_usdc_01',
              poolAddress: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
              symbol: 'SOL/USDC',
            },
            regime: 'UP',
            actions: [{ type: 'HOLD', reasonCode: 'IN_RANGE_STABLE' }],
            constraints: { cooldownUntilUnixMs: 0, standDownUntilUnixMs: 0, notes: [] },
            reasons: [],
          }),
          { status: 200 },
        ),
      );

      const adapter = new RegimePlanAdapter('https://regime.example.com/', 'test-token', obs.port);
      await adapter.requestPositionPlan(VALID_PLAN_REQUEST);

      const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
      expect(calledUrl).toBe('https://regime.example.com/v1/plan');
    });

    it('preserves auth timeout client-error and server-error classifications after the route change', async () => {
      // 401 Unauthorized -> permanent
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized access' } }),
          { status: 401 },
        ),
      );
      const adapter = new RegimePlanAdapter('https://regime.example.com', 'test-token', obs.port);
      const res401 = await adapter.requestPositionPlan(VALID_PLAN_REQUEST);
      expect(res401.kind).toBe('permanent');

      // 400 Client Error -> permanent
      vi.mocked(fetch).mockClear();
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'Invalid parameter' } }),
          { status: 400 },
        ),
      );
      const res400 = await adapter.requestPositionPlan(VALID_PLAN_REQUEST);
      expect(res400.kind).toBe('permanent');

      // 500 Server Error -> retryable-degraded
      vi.mocked(fetch).mockClear();
      vi.mocked(fetch).mockResolvedValue(new Response('Internal Server Error', { status: 500 }));
      const res500 = await adapter.requestPositionPlan(VALID_PLAN_REQUEST);
      expect(res500.kind).toBe('retryable-degraded');

      // Timeout -> retryable-degraded
      vi.useFakeTimers();
      vi.mocked(fetch).mockClear();
      vi.mocked(fetch).mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject({ name: 'AbortError' }), 100);
          }),
      );
      const pendingTimeout = adapter.requestPositionPlan(VALID_PLAN_REQUEST);
      await vi.advanceTimersByTimeAsync(5000);
      const resTimeout = await pendingTimeout;
      expect(resTimeout.kind).toBe('retryable-degraded');
      vi.useRealTimers();
    });

    it('logs bounded metadata without secrets', async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            schemaVersion: 'position-plan.v1',
            planId: 'plan_hold_123456789',
            planHash: 'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123',
            asOfUnixMs: 1700000000000,
            expiresAtUnixMs: 1700003600000,
            scope: {
              kind: 'position',
              positionId: 'pos_sol_usdc_01',
              poolAddress: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
              symbol: 'SOL/USDC',
            },
            regime: 'UP',
            actions: [{ type: 'HOLD', reasonCode: 'IN_RANGE_STABLE' }],
            constraints: { cooldownUntilUnixMs: 0, standDownUntilUnixMs: 0, notes: [] },
            reasons: [],
          }),
          { status: 200 },
        ),
      );

      const adapter = new RegimePlanAdapter('https://regime.example.com', 'secret-token', obs.port);
      await adapter.requestPositionPlan(VALID_PLAN_REQUEST);

      const logEntry = obs.logs.find((l) => l.message.includes('succeeded'));
      expect(logEntry).toBeDefined();
      expect(logEntry!.context!['planId']).toBe('plan_hold_123456789');
      expect(logEntry!.context!['positionId']).toBe('pos_sol_usdc_01');
      expect(logEntry!.context!['statusClass']).toBe('ok');
      expect(logEntry!.context!['durationMs']).toBeGreaterThanOrEqual(0);
      expect(Object.keys(logEntry!.context!)).not.toContain('X-CLMM-Internal-Token');
      expect(Object.keys(logEntry!.context!)).not.toContain('Authorization');
    });
  });

  describe('reportExecutionResult', () => {
    it('fails preflight with permanent schema-invalid when reporting an invalid execution result payload', async () => {
      const adapter = new RegimePlanAdapter('https://regime.example.com', 'test-token', obs.port);
      const invalidResult = {
        ...VALID_EXECUTION_RESULT,
        planHash: 'not-a-valid-sha256',
      };

      const result = await adapter.reportExecutionResult(invalidResult as RegimeExecutionResult);

      expect(result.kind).toBe('permanent');
      if (result.kind === 'permanent') {
        expect(result.reason).toBe('schema-invalid');
      }
      expect(fetch).not.toHaveBeenCalled();
    });

    it('posts execution result to correct endpoint', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

      const adapter = new RegimePlanAdapter('https://regime.example.com', 'test-token', obs.port);
      await adapter.reportExecutionResult(VALID_EXECUTION_RESULT);

      const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
      const calledMethod = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.method as string;
      const calledBody = JSON.parse(
        (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.body as string,
      ) as Record<string, unknown>;

      expect(calledUrl).toBe('https://regime.example.com/v1/execution-result');
      expect(calledMethod).toBe('POST');
      expect(calledBody['planId']).toBe('plan_exit_987654321');
      expect(calledBody['idempotencyKey']).toBe('idem_exit_987654321_01');
    });

    it('reuses payload and idempotency identity across result attempts', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));

      const adapter = new RegimePlanAdapter('https://regime.example.com', 'test-token', obs.port);

      await adapter.reportExecutionResult(VALID_EXECUTION_RESULT);
      await adapter.reportExecutionResult(VALID_EXECUTION_RESULT);
      await adapter.reportExecutionResult(VALID_EXECUTION_RESULT);

      const mockFn = fetch as ReturnType<typeof vi.fn>;
      const calls = mockFn.mock.calls as Array<[unknown, { body: string }]>;
      expect(calls.length).toBe(3);

      for (const call of calls) {
        const body = JSON.parse(call[1].body) as Record<string, unknown>;
        expect(body['idempotencyKey']).toBe('idem_exit_987654321_01');
        expect(body['planHash']).toBe(
          'f9e8d7c6b5a40123456789abcdef0123456789abcdef0123456789abcdef0123',
        );
      }
    });

    it('classifies timeout and server failure as degraded for result reporting', async () => {
      vi.useFakeTimers();
      vi.mocked(fetch).mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject({ name: 'AbortError' }), 100);
          }),
      );

      const adapter = new RegimePlanAdapter('https://regime.example.com', 'test-token', obs.port);
      const pending = adapter.reportExecutionResult(VALID_EXECUTION_RESULT);

      await vi.advanceTimersByTimeAsync(5000);
      const result = await pending;

      expect(result.kind).toBe('retryable-degraded');
      if (result.kind !== 'retryable-degraded') return;
      expect(result.reason).toBe('timeout');
      vi.useRealTimers();

      vi.mocked(fetch).mockClear();
      vi.mocked(fetch).mockResolvedValue(new Response('Server Error', { status: 503 }));

      const adapter2 = new RegimePlanAdapter('https://regime.example.com', 'test-token', obs.port);
      const result2 = await adapter2.reportExecutionResult(VALID_EXECUTION_RESULT);

      expect(result2.kind).toBe('retryable-degraded');
      if (result2.kind !== 'retryable-degraded') return;
      expect(result2.reason).toBe('server-error-503');
    });

    it('classifies auth and validation errors as permanent for result reporting', async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }),
          {
            status: 401,
          },
        ),
      );

      const adapter = new RegimePlanAdapter('https://regime.example.com', 'test-token', obs.port);
      const result = await adapter.reportExecutionResult(VALID_EXECUTION_RESULT);

      expect(result.kind).toBe('permanent');
      if (result.kind !== 'permanent') return;
      expect(result.reason).toBe('Invalid token');

      vi.mocked(fetch).mockClear();
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Access denied' } }), {
          status: 403,
        }),
      );

      const adapter2 = new RegimePlanAdapter('https://regime.example.com', 'test-token', obs.port);
      const result2 = await adapter2.reportExecutionResult(VALID_EXECUTION_RESULT);

      expect(result2.kind).toBe('permanent');
      if (result2.kind !== 'permanent') return;
      expect(result2.reason).toBe('Access denied');

      vi.mocked(fetch).mockClear();
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Bad request' } }),
          {
            status: 400,
          },
        ),
      );

      const adapter3 = new RegimePlanAdapter('https://regime.example.com', 'test-token', obs.port);
      const result3 = await adapter3.reportExecutionResult(VALID_EXECUTION_RESULT);

      expect(result3.kind).toBe('permanent');
      if (result3.kind !== 'permanent') return;
      expect(result3.reason).toBe('Bad request');
    });

    it('returns ok on 200/201/202 for result reporting', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

      const adapter = new RegimePlanAdapter('https://regime.example.com', 'test-token', obs.port);
      const result = await adapter.reportExecutionResult(VALID_EXECUTION_RESULT);

      expect(result.kind).toBe('ok');

      vi.mocked(fetch).mockClear();
      vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 201 }));

      const result2 = await adapter.reportExecutionResult(VALID_EXECUTION_RESULT);
      expect(result2.kind).toBe('ok');

      vi.mocked(fetch).mockClear();
      vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 202 }));

      const result3 = await adapter.reportExecutionResult(VALID_EXECUTION_RESULT);
      expect(result3.kind).toBe('ok');
    });

    it('returns permanent when baseUrl is null for result reporting', async () => {
      const adapter = new RegimePlanAdapter(null, 'test-token', obs.port);
      const result = await adapter.reportExecutionResult(VALID_EXECUTION_RESULT);

      expect(result.kind).toBe('permanent');
      if (result.kind !== 'permanent') return;
      expect(result.reason).toBe('adapter-disabled');
    });

    it('logs bounded metadata for result reporting', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

      const adapter = new RegimePlanAdapter('https://regime.example.com', 'secret-token', obs.port);
      await adapter.reportExecutionResult(VALID_EXECUTION_RESULT);

      const logEntry = obs.logs.find((l) => l.message.includes('reported'));
      expect(logEntry).toBeDefined();
      expect(logEntry!.context!['resultId']).toBe('idem_exit_987654321_01');
      expect(logEntry!.context!['planId']).toBe('plan_exit_987654321');
      expect(logEntry!.context!['positionId']).toBe('pos_sol_usdc_02');
      expect(logEntry!.context!['statusClass']).toBe('ok');
      expect(Object.keys(logEntry!.context!)).not.toContain('X-CLMM-Internal-Token');
    });
  });
});

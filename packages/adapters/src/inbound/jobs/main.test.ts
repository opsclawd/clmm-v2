import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  createDbMock,
  checkSchemaReadinessMock,
  createApplicationContextMock,
  exitMock,
  errorMock,
} = vi.hoisted(() => ({
  createDbMock: vi.fn(),
  checkSchemaReadinessMock: vi.fn(),
  createApplicationContextMock: vi.fn(),
  exitMock: vi.fn(),
  errorMock: vi.fn(),
}));

vi.mock('../../outbound/storage/db.js', () => ({
  createDb: createDbMock,
  schema: { walletChallenges: 'fake-table' },
}));

vi.mock('../../outbound/storage/SchemaReadiness.js', () => ({
  checkSchemaReadiness: checkSchemaReadinessMock,
}));

vi.mock('@nestjs/core', () => ({
  NestFactory: {
    createApplicationContext: createApplicationContextMock,
  },
}));

vi.mock('./WorkerModule.js', () => ({
  WorkerModule: class WorkerModule {},
}));

import { bootstrap } from './main.js';

describe('worker bootstrap', () => {
  const originalEnv = process.env;
  const originalExit = process.exit.bind(process);
  const originalError = console.error.bind(console);

  beforeEach(() => {
    process.env = { ...originalEnv, DATABASE_URL: 'postgresql://localhost/clmm' };
    (process as unknown as { exit: typeof exitMock }).exit = exitMock;
    console.error = errorMock;

    createDbMock.mockReset();
    checkSchemaReadinessMock.mockReset();
    createApplicationContextMock.mockReset();
    exitMock.mockReset();
    errorMock.mockReset();

    createDbMock.mockReturnValue({ __isFakeGateDb: true });
    createApplicationContextMock.mockResolvedValue({ close: vi.fn() });
  });

  afterEach(() => {
    process.env = originalEnv;
    (process as unknown as { exit: typeof originalExit }).exit = originalExit;
    console.error = originalError;
  });

  it('proceeds to NestFactory when readiness check passes', async () => {
    checkSchemaReadinessMock.mockResolvedValue({ ready: true });

    await bootstrap();

    expect(createDbMock).toHaveBeenCalledWith('postgresql://localhost/clmm');
    expect(checkSchemaReadinessMock).toHaveBeenCalledTimes(1);
    expect(createApplicationContextMock).toHaveBeenCalledTimes(1);
    expect(exitMock).not.toHaveBeenCalled();
  });

  it('logs fatal and exits 1 when readiness check fails', async () => {
    checkSchemaReadinessMock.mockResolvedValue({
      ready: false,
      missing: ['wallet_challenges'],
    });

    await bootstrap();

    expect(createApplicationContextMock).not.toHaveBeenCalled();
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(errorMock).toHaveBeenCalledTimes(1);

    const errorCalls = errorMock.mock.calls as Array<[string]>;
    const [logLine] = errorCalls[0] ?? [''];
    const parsed = JSON.parse(logLine) as Record<string, unknown>;
    expect(parsed['level']).toBe('fatal');
    expect(parsed['message']).toMatch(/schema readiness check failed/);
    expect(parsed['missing']).toEqual(['wallet_challenges']);
    expect(parsed['timestamp']).toEqual(expect.any(String));
  });

  it('logs fatal and exits 1 when DATABASE_URL is unset', async () => {
    process.env = { ...originalEnv };
    delete process.env['DATABASE_URL'];

    await bootstrap();

    expect(createDbMock).not.toHaveBeenCalled();
    expect(checkSchemaReadinessMock).not.toHaveBeenCalled();
    expect(createApplicationContextMock).not.toHaveBeenCalled();
    expect(exitMock).toHaveBeenCalledWith(1);

    const errorCalls = errorMock.mock.calls as Array<[string]>;
    const [logLine] = errorCalls[0] ?? [''];
    const parsed = JSON.parse(logLine) as Record<string, unknown>;
    expect(parsed['message']).toMatch(/DATABASE_URL not set/);
  });

  it('logs fatal and exits 1 when DATABASE_URL is empty string', async () => {
    process.env = { ...originalEnv, DATABASE_URL: '' };

    await bootstrap();

    expect(createDbMock).not.toHaveBeenCalled();
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it('logs fatal and exits 1 when checkSchemaReadiness throws', async () => {
    checkSchemaReadinessMock.mockRejectedValue(new Error('connection refused'));

    await bootstrap();

    expect(createApplicationContextMock).not.toHaveBeenCalled();
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(errorMock).toHaveBeenCalledTimes(1);

    const errorCalls = errorMock.mock.calls as Array<[string]>;
    const [logLine] = errorCalls[0] ?? [''];
    const parsed = JSON.parse(logLine) as Record<string, unknown>;
    expect(parsed['level']).toBe('fatal');
    expect(parsed['error']).toBe('connection refused');
  });
});

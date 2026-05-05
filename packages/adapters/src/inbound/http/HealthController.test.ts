import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';

const { checkSchemaReadinessMock } = vi.hoisted(() => ({
  checkSchemaReadinessMock: vi.fn(),
}));

vi.mock('../../outbound/storage/SchemaReadiness.js', () => ({
  checkSchemaReadiness: checkSchemaReadinessMock,
}));

vi.mock('../../outbound/storage/db.js', () => ({
  schema: { walletChallenges: 'fake-table' },
}));

import { HealthController } from './HealthController.js';
import type { Db } from '../../outbound/storage/db.js';

const fakeDb = { __isFakeDb: true } as unknown as Db;

describe('HealthController', () => {
  beforeEach(() => {
    checkSchemaReadinessMock.mockReset();
  });

  it('returns { status: "ok" } when schema readiness passes', async () => {
    checkSchemaReadinessMock.mockResolvedValue({ ready: true });
    const controller = new HealthController(fakeDb);

    const result = await controller.health();

    expect(result).toEqual({ status: 'ok' });
    expect(checkSchemaReadinessMock).toHaveBeenCalledWith(fakeDb, {
      walletChallenges: 'fake-table',
    });
  });

  it('throws 503 with missing list when schema readiness fails', async () => {
    checkSchemaReadinessMock.mockResolvedValue({
      ready: false,
      missing: ['wallet_challenges', 'monitored_wallets'],
    });
    const controller = new HealthController(fakeDb);

    await expect(controller.health()).rejects.toThrow(HttpException);

    try {
      await controller.health();
      throw new Error('Expected HttpException');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(HttpException);
      const httpError = error as HttpException;
      expect(httpError.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(httpError.getResponse()).toEqual({
        status: 'not_ready',
        missing: ['wallet_challenges', 'monitored_wallets'],
      });
    }
  });

  it('returns 503 with error status when readiness check throws', async () => {
    checkSchemaReadinessMock.mockRejectedValue(new Error('connection refused'));
    const controller = new HealthController(fakeDb);

    try {
      await controller.health();
      throw new Error('Expected HttpException');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(HttpException);
      const httpError = error as HttpException;
      expect(httpError.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(httpError.getResponse()).toEqual({
        status: 'error',
        message: 'health check failed',
      });
    }
  });
});

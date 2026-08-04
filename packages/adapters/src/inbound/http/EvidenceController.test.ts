import { describe, it, expect, vi } from 'vitest';
import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { EvidenceController } from './EvidenceController.js';
import type {
  EvidenceReadPort,
  EvidenceReadResult,
  EvidenceBundle,
  SupportedPositionReadPort,
} from '@clmm/application';
import {
  makeWalletId,
  makePositionId,
  makePoolId,
  makeClockTimestamp,
  type LiquidityPosition,
} from '@clmm/domain';
import canonicalEvidenceContextual from '../../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/contextual.json';

function fixtureBlock(): EvidenceBundle {
  return canonicalEvidenceContextual as unknown as EvidenceBundle;
}

const positionFixture: LiquidityPosition = {
  positionId: makePositionId('position-1'),
  walletId: makeWalletId('wallet-1'),
  poolId: makePoolId('pool-123'),
  bounds: { lowerBound: 100, upperBound: 200 },
  lastObservedAt: makeClockTimestamp(123456789),
  rangeState: { kind: 'in-range', currentPrice: 150 },
  monitoringReadiness: { kind: 'active' },
};

function makePositionReadPort(
  overrides: Partial<SupportedPositionReadPort> = {},
): SupportedPositionReadPort {
  return {
    listSupportedPositions: vi.fn(),
    getPosition: vi.fn(),
    getPositionDetail: vi.fn(),
    getPoolData: vi.fn(),
    ...overrides,
  };
}

describe('EvidenceController', () => {
  it('maps every evidence read result to the stable BFF envelope', async () => {
    const block = fixtureBlock();
    const cases: Array<{ result: EvidenceReadResult; expected: unknown }> = [
      {
        result: { kind: 'block', block },
        expected: { evidence: block },
      },
      {
        result: { kind: 'not-found' },
        expected: { evidence: null, unavailableReason: 'not-found' },
      },
      {
        result: { kind: 'store-unavailable' },
        expected: { evidence: null, unavailableReason: 'store-unavailable' },
      },
      {
        result: { kind: 'config-error' },
        expected: { evidence: null, unavailableReason: 'config-error' },
      },
      {
        result: { kind: 'malformed' },
        expected: { evidence: null, unavailableReason: 'malformed' },
      },
      {
        result: { kind: 'upstream-error' },
        expected: { evidence: null, unavailableReason: 'upstream-error' },
      },
    ];

    for (const { result, expected } of cases) {
      const fetchCurrent = vi.fn().mockResolvedValue(result);
      const getRawEvidence = vi.fn();
      const port: EvidenceReadPort = { fetchCurrent, getRawEvidence };
      const positionReadPort = makePositionReadPort();
      const controller = new EvidenceController(port, positionReadPort);

      const response = await controller.getCurrent();

      expect(response).toEqual(expected);
      expect(fetchCurrent).toHaveBeenCalledTimes(1);
      expect(fetchCurrent).toHaveBeenCalledWith();
    }
  });

  it('keeps the pair evidence route unscoped', async () => {
    const fetchCurrent = vi.fn().mockResolvedValue({ kind: 'block', block: fixtureBlock() });
    const getRawEvidence = vi.fn();
    const port: EvidenceReadPort = { fetchCurrent, getRawEvidence };
    const positionReadPort = makePositionReadPort();
    const controller = new EvidenceController(port, positionReadPort);

    await controller.getCurrent();
    expect(fetchCurrent).toHaveBeenCalledWith();
  });

  it('forwards an owned position as canonical position evidence scope', async () => {
    const fetchCurrent = vi.fn().mockResolvedValue({ kind: 'block', block: fixtureBlock() });
    const getRawEvidence = vi.fn();
    const port: EvidenceReadPort = { fetchCurrent, getRawEvidence };
    const getPosition = vi.fn().mockResolvedValue(positionFixture);
    const positionReadPort = makePositionReadPort({ getPosition });
    const controller = new EvidenceController(port, positionReadPort);

    await controller.getCurrentForPosition('wallet-1', 'position-1');
    expect(getPosition).toHaveBeenCalledWith(
      makeWalletId('wallet-1'),
      makePositionId('position-1'),
    );
    expect(fetchCurrent).toHaveBeenCalledWith({
      walletAddress: 'wallet-1',
      whirlpoolAddress: positionFixture.poolId,
      positionId: 'position-1',
    });
  });

  it('returns 404 without fetching evidence when the wallet does not own the position', async () => {
    const fetchCurrent = vi.fn().mockResolvedValue({ kind: 'block', block: fixtureBlock() });
    const getRawEvidence = vi.fn();
    const port: EvidenceReadPort = { fetchCurrent, getRawEvidence };
    const getPosition = vi.fn().mockResolvedValue(null);
    const positionReadPort = makePositionReadPort({ getPosition });
    const controller = new EvidenceController(port, positionReadPort);

    await expect(controller.getCurrentForPosition('wallet-1', 'position-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(fetchCurrent).not.toHaveBeenCalled();
  });

  it('GET raw evidence returns the exact successful payload without an envelope', async () => {
    const payload = { schema: 'v1', runId: 'run-123', telemetry: { nested: true } };
    const getRawEvidence = vi.fn().mockResolvedValue({ kind: 'ok', payload });
    const port: EvidenceReadPort = {
      fetchCurrent: vi.fn(),
      getRawEvidence,
    };
    const controller = new EvidenceController(port, makePositionReadPort());
    const result = await controller.getRawEvidence('run-123');
    expect(result).toBe(payload);
  });

  it('GET raw evidence delegates the runId exactly once through EvidenceReadPort', async () => {
    const getRawEvidence = vi.fn().mockResolvedValue({ kind: 'ok', payload: { ok: true } });
    const port: EvidenceReadPort = {
      fetchCurrent: vi.fn(),
      getRawEvidence,
    };
    const controller = new EvidenceController(port, makePositionReadPort());
    await controller.getRawEvidence('run-123');
    expect(getRawEvidence).toHaveBeenCalledTimes(1);
    expect(getRawEvidence).toHaveBeenCalledWith('run-123');
  });

  it('GET raw evidence forwards not-found as HTTP 404', async () => {
    const port: EvidenceReadPort = {
      fetchCurrent: vi.fn(),
      getRawEvidence: vi.fn().mockResolvedValue({ kind: 'not-found' }),
    };
    const controller = new EvidenceController(port, makePositionReadPort());
    try {
      await controller.getRawEvidence('run-missing');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(HttpStatus.NOT_FOUND);
      const response = JSON.stringify(httpErr.getResponse());
      expect(response).not.toContain('X-CLMM-Internal-Token');
      expect(response).not.toContain('secret');
    }
  });

  it('GET raw evidence maps upstream error to HTTP 502 Bad Gateway without status code bleed', async () => {
    const port: EvidenceReadPort = {
      fetchCurrent: vi.fn(),
      getRawEvidence: vi.fn().mockResolvedValue({ kind: 'upstream-error', status: 401 }),
    };
    const controller = new EvidenceController(port, makePositionReadPort());
    try {
      await controller.getRawEvidence('run-401');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
      const response = JSON.stringify(httpErr.getResponse());
      expect(response).not.toContain('X-CLMM-Internal-Token');
      expect(response).not.toContain('secret');
    }
  });

  it('GET raw evidence maps configuration failures to HTTP 503 and transport failures to HTTP 502', async () => {
    const configErrPort: EvidenceReadPort = {
      fetchCurrent: vi.fn(),
      getRawEvidence: vi.fn().mockResolvedValue({ kind: 'config-error' }),
    };
    const controller1 = new EvidenceController(configErrPort, makePositionReadPort());
    try {
      await controller1.getRawEvidence('run-config');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      const response = JSON.stringify(httpErr.getResponse());
      expect(response).not.toContain('X-CLMM-Internal-Token');
      expect(response).not.toContain('secret');
    }
  });
});

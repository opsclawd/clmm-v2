import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
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
      const port: EvidenceReadPort = { fetchCurrent };
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
    const port: EvidenceReadPort = { fetchCurrent };
    const positionReadPort = makePositionReadPort();
    const controller = new EvidenceController(port, positionReadPort);

    await controller.getCurrent();
    expect(fetchCurrent).toHaveBeenCalledWith();
  });

  it('forwards an owned position as canonical position evidence scope', async () => {
    const fetchCurrent = vi.fn().mockResolvedValue({ kind: 'block', block: fixtureBlock() });
    const port: EvidenceReadPort = { fetchCurrent };
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
    const port: EvidenceReadPort = { fetchCurrent };
    const getPosition = vi.fn().mockResolvedValue(null);
    const positionReadPort = makePositionReadPort({ getPosition });
    const controller = new EvidenceController(port, positionReadPort);

    await expect(controller.getCurrentForPosition('wallet-1', 'position-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(fetchCurrent).not.toHaveBeenCalled();
  });
});

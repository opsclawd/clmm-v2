import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { RegimeController } from './RegimeController.js';
import type { RegimeReadPort, RegimeReadResult, RegimeBlock } from '@clmm/application';
import type { RegimePoolEntry } from './RegimeFeedConfig.js';

const POOL_ID = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
const UNSUPPORTED_POOL_ID = 'Pool111111111111111111111111111111111111111';

const testEntry: RegimePoolEntry = {
  symbol: 'SOL/USDC',
  source: 'mco',
  network: 'mainnet',
  poolAddress: POOL_ID,
  timeframe: '1h',
};

const testBlock: RegimeBlock = {
  regime: 'UP',
  trendStrength: 0.75,
  volRatio: 1.2,
  clmmSuitability: { status: 'ALLOWED', reasons: [] },
  marketReasons: [],
  freshness: { capturedAtUnixMs: 1700000000000, softStale: false, hardStale: false },
};

function makeAllowlist(
  entries: Array<[string, RegimePoolEntry]> = [[POOL_ID, testEntry]],
): Map<string, RegimePoolEntry> {
  return new Map(entries);
}

describe('RegimeController', () => {
  it('returns regime for an allowlisted pool when the port resolves a block', async () => {
    const result: RegimeReadResult = { kind: 'block', block: testBlock };
    const fetchCurrent = vi.fn().mockResolvedValue(result);
    const port: RegimeReadPort = { fetchCurrent };
    const controller = new RegimeController(port, makeAllowlist());

    const response = await controller.getCurrent(POOL_ID);

    expect(response).toEqual({ regime: testBlock });
    expect(fetchCurrent).toHaveBeenCalledWith({
      symbol: testEntry.symbol,
      source: testEntry.source,
      network: testEntry.network,
      poolAddress: testEntry.poolAddress,
      timeframe: testEntry.timeframe,
    });
  });

  it('throws NotFoundException for a pool that is not in the allowlist', async () => {
    const fetchCurrent = vi.fn();
    const port: RegimeReadPort = { fetchCurrent };
    const controller = new RegimeController(port, makeAllowlist());

    await expect(controller.getCurrent(UNSUPPORTED_POOL_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(fetchCurrent).not.toHaveBeenCalled();
  });

  it('returns regime null with NO_CANDLES when the port resolves not-found', async () => {
    const result: RegimeReadResult = { kind: 'not-found' };
    const fetchCurrent = vi.fn().mockResolvedValue(result);
    const port: RegimeReadPort = { fetchCurrent };
    const controller = new RegimeController(port, makeAllowlist());

    const response = await controller.getCurrent(POOL_ID);

    expect(response).toEqual({ regime: null, unavailableReason: 'NO_CANDLES' });
  });

  it('returns regime null with CONFIG_ERROR when the port resolves config-error', async () => {
    const result: RegimeReadResult = { kind: 'config-error' };
    const fetchCurrent = vi.fn().mockResolvedValue(result);
    const port: RegimeReadPort = { fetchCurrent };
    const controller = new RegimeController(port, makeAllowlist());

    const response = await controller.getCurrent(POOL_ID);

    expect(response).toEqual({ regime: null, unavailableReason: 'CONFIG_ERROR' });
  });

  it('returns regime null with UPSTREAM_ERROR when the port resolves upstream-error', async () => {
    const result: RegimeReadResult = { kind: 'upstream-error' };
    const fetchCurrent = vi.fn().mockResolvedValue(result);
    const port: RegimeReadPort = { fetchCurrent };
    const controller = new RegimeController(port, makeAllowlist());

    const response = await controller.getCurrent(POOL_ID);

    expect(response).toEqual({ regime: null, unavailableReason: 'UPSTREAM_ERROR' });
  });
});

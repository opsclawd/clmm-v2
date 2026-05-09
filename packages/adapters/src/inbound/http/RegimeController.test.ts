import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { RegimeController } from './RegimeController.js';
import type { RegimeReadPort, RegimeReadResult, RegimeBlock } from '@clmm/application';
import type { RegimePoolEntry } from './RegimeFeedConfig.js';

const POOL_ID = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
const UNSUPPORTED_POOL_ID = 'Pool111111111111111111111111111111111111111';

const testEntry: RegimePoolEntry = {
  symbol: 'SOL/USDC',
};

const testBlock: RegimeBlock = {
  regime: 'UP',
  telemetry: {
    realizedVolShort: 0.007,
    realizedVolLong: 0.0107,
    volRatio: 1.06,
    trendStrength: 0.00018,
    compression: 0.0092,
  },
  clmmSuitability: { status: 'ALLOWED', reasons: [] },
  marketReasons: [],
  freshness: {
    generatedAtUnixMs: 1_700_000_000_000 - 87 * 60_000,
    generatedAtIso: new Date(1_700_000_000_000 - 87 * 60_000).toISOString(),
    lastCandleOpenUnixMs: 1_700_000_000_000 - 87 * 60_000 - 60 * 60_000,
    lastCandleOpenIso: new Date(1_700_000_000_000 - 87 * 60_000 - 60 * 60_000).toISOString(),
    lastCandleCloseUnixMs: 1_700_000_000_000 - 87 * 60_000,
    lastCandleCloseIso: new Date(1_700_000_000_000 - 87 * 60_000).toISOString(),
    ageSeconds: 0,
    softStale: false,
    hardStale: false,
    softStaleSeconds: 75 * 60,
    hardStaleSeconds: 90 * 60,
  },
  metadata: {
    source: 'geckoterminal',
    network: 'solana',
    symbol: 'SOL/USDC',
    timeframe: '1h',
  },
};

function makeAllowlist(
  entries: Array<[string, RegimePoolEntry]> = [[POOL_ID, testEntry]],
): Map<string, RegimePoolEntry> {
  return new Map(entries);
}

const ORIGINAL_ENV = process.env;

describe('RegimeController', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.restoreAllMocks();
  });

  function setFeedEnv(): void {
    process.env['REGIME_ENGINE_SOURCE'] = 'geckoterminal';
    process.env['REGIME_ENGINE_NETWORK'] = 'solana';
    process.env['REGIME_ENGINE_POOL_ADDRESS'] = POOL_ID;
    process.env['REGIME_ENGINE_TIMEFRAME'] = '1h';
  }

  function clearFeedEnv(): void {
    delete process.env['REGIME_ENGINE_SOURCE'];
    delete process.env['REGIME_ENGINE_NETWORK'];
    delete process.env['REGIME_ENGINE_POOL_ADDRESS'];
    delete process.env['REGIME_ENGINE_TIMEFRAME'];
  }

  it('returns regime for an allowlisted pool when the port resolves a block', async () => {
    setFeedEnv();

    const result: RegimeReadResult = { kind: 'block', block: testBlock };
    const fetchCurrent = vi.fn().mockResolvedValue(result);
    const port: RegimeReadPort = { fetchCurrent };
    const controller = new RegimeController(port, makeAllowlist());

    const response = await controller.getCurrent(POOL_ID);

    expect(response).toEqual({ regime: testBlock });
    expect(fetchCurrent).toHaveBeenCalledWith({
      symbol: 'SOL/USDC',
      source: 'geckoterminal',
      network: 'solana',
      poolAddress: POOL_ID,
      timeframe: '1h',
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

  it('returns config-error when REGIME_ENGINE env vars are missing', async () => {
    clearFeedEnv();

    const fetchCurrent = vi.fn();
    const port: RegimeReadPort = { fetchCurrent };
    const controller = new RegimeController(port, makeAllowlist());

    const response = await controller.getCurrent(POOL_ID);

    expect(response).toEqual({ regime: null, unavailableReason: 'config-error' });
    expect(fetchCurrent).not.toHaveBeenCalled();
  });

  it('returns regime null with not-found when the port resolves not-found', async () => {
    setFeedEnv();

    const result: RegimeReadResult = { kind: 'not-found' };
    const fetchCurrent = vi.fn().mockResolvedValue(result);
    const port: RegimeReadPort = { fetchCurrent };
    const controller = new RegimeController(port, makeAllowlist());

    const response = await controller.getCurrent(POOL_ID);

    expect(response).toEqual({ regime: null, unavailableReason: 'not-found' });
  });

  it('returns regime null with config-error when the port resolves config-error', async () => {
    setFeedEnv();

    const result: RegimeReadResult = { kind: 'config-error' };
    const fetchCurrent = vi.fn().mockResolvedValue(result);
    const port: RegimeReadPort = { fetchCurrent };
    const controller = new RegimeController(port, makeAllowlist());

    const response = await controller.getCurrent(POOL_ID);

    expect(response).toEqual({ regime: null, unavailableReason: 'config-error' });
  });

  it('returns regime null with upstream-error when the port resolves upstream-error', async () => {
    setFeedEnv();

    const result: RegimeReadResult = { kind: 'upstream-error' };
    const fetchCurrent = vi.fn().mockResolvedValue(result);
    const port: RegimeReadPort = { fetchCurrent };
    const controller = new RegimeController(port, makeAllowlist());

    const response = await controller.getCurrent(POOL_ID);

    expect(response).toEqual({ regime: null, unavailableReason: 'upstream-error' });
  });
});

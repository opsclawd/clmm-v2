import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { SrThesesController } from './SrThesesController.js';
import type { SrThesesReadPort, SrThesesReadResult, SrThesesBlock } from '@clmm/application';

const SOL_USDC_POOL_ID = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
const UNSUPPORTED_POOL_ID = 'Pool111111111111111111111111111111111111111';

function fixtureBlock(): SrThesesBlock {
  return {
    schemaVersion: '2.0',
    source: 'openclaw',
    symbol: 'SOL/USDC',
    brief: { briefId: 'brief-1', sourceRecordedAtIso: null, summary: null },
    capturedAtIso: '2026-05-07T00:00:00Z',
    capturedAtUnixMs: Date.parse('2026-05-07T00:00:00Z'),
    theses: [],
  };
}

function makeAllowlist(
  entries: Array<[string, { symbol: string; source: string }]> = [
    [SOL_USDC_POOL_ID, { symbol: 'SOL/USDC', source: 'openclaw' }],
  ],
): Map<string, { symbol: string; source: string }> {
  return new Map(entries);
}

describe('SrThesesController', () => {
  it('returns { srTheses: block } for an allowlisted pool when port resolves a block', async () => {
    const block = fixtureBlock();
    const result: SrThesesReadResult = { kind: 'block', block };
    const fetchCurrent = vi.fn().mockResolvedValue(result);
    const port: SrThesesReadPort = { fetchCurrent };
    const controller = new SrThesesController(port, makeAllowlist());

    const response = await controller.getCurrent(SOL_USDC_POOL_ID);

    expect(response).toEqual({ srTheses: block });
    expect(fetchCurrent).toHaveBeenCalledWith('SOL/USDC', 'openclaw');
  });

  it('maps not-found to { srTheses: null, unavailableReason: "not-found" }', async () => {
    const result: SrThesesReadResult = { kind: 'not-found' };
    const fetchCurrent = vi.fn().mockResolvedValue(result);
    const port: SrThesesReadPort = { fetchCurrent };
    const controller = new SrThesesController(port, makeAllowlist());
    const response = await controller.getCurrent(SOL_USDC_POOL_ID);
    expect(response).toEqual({ srTheses: null, unavailableReason: 'not-found' });
  });

  it('maps config-error to { srTheses: null, unavailableReason: "config-error" }', async () => {
    const result: SrThesesReadResult = { kind: 'config-error' };
    const fetchCurrent = vi.fn().mockResolvedValue(result);
    const port: SrThesesReadPort = { fetchCurrent };
    const controller = new SrThesesController(port, makeAllowlist());
    const response = await controller.getCurrent(SOL_USDC_POOL_ID);
    expect(response).toEqual({ srTheses: null, unavailableReason: 'config-error' });
  });

  it('maps upstream-error to { srTheses: null, unavailableReason: "upstream-error" }', async () => {
    const result: SrThesesReadResult = { kind: 'upstream-error' };
    const fetchCurrent = vi.fn().mockResolvedValue(result);
    const port: SrThesesReadPort = { fetchCurrent };
    const controller = new SrThesesController(port, makeAllowlist());
    const response = await controller.getCurrent(SOL_USDC_POOL_ID);
    expect(response).toEqual({ srTheses: null, unavailableReason: 'upstream-error' });
  });

  it('throws NotFoundException for an unsupported pool', async () => {
    const fetchCurrent = vi.fn();
    const port: SrThesesReadPort = { fetchCurrent };
    const controller = new SrThesesController(port, makeAllowlist());
    await expect(controller.getCurrent(UNSUPPORTED_POOL_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(fetchCurrent).not.toHaveBeenCalled();
  });

  it('resolves the (symbol, source) pair from the allowlist entry (defaults to openclaw)', async () => {
    const result: SrThesesReadResult = { kind: 'not-found' };
    const fetchCurrent = vi.fn().mockResolvedValue(result);
    const port: SrThesesReadPort = { fetchCurrent };
    const customAllowlist = makeAllowlist([
      ['CustomPool11111111111111111111111111111111', { symbol: 'BTC/USDC', source: 'openclaw' }],
    ]);
    const controller = new SrThesesController(port, customAllowlist);
    await controller.getCurrent('CustomPool11111111111111111111111111111111');
    expect(fetchCurrent).toHaveBeenCalledWith('BTC/USDC', 'openclaw');
  });
});

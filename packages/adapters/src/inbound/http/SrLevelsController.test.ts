import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { SrLevelsController } from './SrLevelsController.js';
import type { CurrentSrLevelsPort, SrLevelsBlock } from '../../outbound/regime-engine/types.js';

const SOL_USDC_POOL_ID = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
const UNSUPPORTED_POOL_ID = 'Pool111111111111111111111111111111111111111';

function fixtureBlock(): SrLevelsBlock {
  return {
    briefId: 'brief-1',
    sourceRecordedAtIso: '2026-04-27T00:00:00Z',
    summary: 'Bullish continuation.',
    capturedAtUnixMs: 1_745_712_000_000,
    supports: [{ price: 132.4 }, { price: 128 }],
    resistances: [{ price: 148.2 }, { price: 152 }],
  };
}

function makeAllowlist(entries: Array<[string, { symbol: string; source: string }]> = [
  [SOL_USDC_POOL_ID, { symbol: 'SOL/USDC', source: 'mco' }],
]): Map<string, { symbol: string; source: string }> {
  return new Map(entries);
}

describe('SrLevelsController', () => {
  it('returns srLevels for an allowlisted pool when the port resolves a block', async () => {
    const block = fixtureBlock();
    const port: CurrentSrLevelsPort = { fetchCurrent: vi.fn().mockResolvedValue(block) };
    const controller = new SrLevelsController(port, makeAllowlist());

    const result = await controller.getCurrent(SOL_USDC_POOL_ID);

    expect(result).toEqual({ srLevels: block });
    expect(port.fetchCurrent).toHaveBeenCalledWith('SOL/USDC', 'mco');
  });

  it('returns srLevels: null for an allowlisted pool when the port resolves null', async () => {
    const port: CurrentSrLevelsPort = { fetchCurrent: vi.fn().mockResolvedValue(null) };
    const controller = new SrLevelsController(port, makeAllowlist());

    const result = await controller.getCurrent(SOL_USDC_POOL_ID);

    expect(result).toEqual({ srLevels: null });
  });

  it('throws NotFoundException for a pool that is not in the allowlist', async () => {
    const port: CurrentSrLevelsPort = { fetchCurrent: vi.fn() };
    const controller = new SrLevelsController(port, makeAllowlist());

    await expect(controller.getCurrent(UNSUPPORTED_POOL_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(port.fetchCurrent).not.toHaveBeenCalled();
  });

  it('resolves the (symbol, source) pair from the allowlist entry', async () => {
    const port: CurrentSrLevelsPort = { fetchCurrent: vi.fn().mockResolvedValue(null) };
    const customAllowlist = makeAllowlist([
      ['CustomPool11111111111111111111111111111111', { symbol: 'BTC/USDC', source: 'custom' }],
    ]);
    const controller = new SrLevelsController(port, customAllowlist);

    await controller.getCurrent('CustomPool11111111111111111111111111111111');

    expect(port.fetchCurrent).toHaveBeenCalledWith('BTC/USDC', 'custom');
  });
});
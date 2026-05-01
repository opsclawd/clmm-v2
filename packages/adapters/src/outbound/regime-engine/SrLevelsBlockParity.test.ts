import { describe, it, expect } from 'vitest';
import type { SrLevelsBlock as AppSrLevelsBlock, SrLevel as AppSrLevel } from '@clmm/application';
import type { SrLevelsBlock as AdapterSrLevelsBlock, SrLevel as AdapterSrLevel } from '../../outbound/regime-engine/types.js';

describe('SrLevelsBlock structural parity', () => {
  it('application SrLevelsBlock satisfies the adapter SrLevelsBlock shape', () => {
    const appBlock: AppSrLevelsBlock = {
      briefId: 'test',
      sourceRecordedAtIso: '2026-01-01T00:00:00Z',
      summary: 'test',
      capturedAtUnixMs: 1_700_000_000_000,
      supports: [{ price: 130 }],
      resistances: [{ price: 160 }],
    };
    const _adapterCompatible: AdapterSrLevelsBlock = appBlock;
    expect(_adapterCompatible.briefId).toBe('test');
  });

  it('adapter SrLevelsBlock satisfies the application SrLevelsBlock shape', () => {
    const adapterBlock: AdapterSrLevelsBlock = {
      briefId: 'test',
      sourceRecordedAtIso: '2026-01-01T00:00:00Z',
      summary: 'test',
      capturedAtUnixMs: 1_700_000_000_000,
      supports: [{ price: 130 }],
      resistances: [{ price: 160 }],
    };
    const _appCompatible: AppSrLevelsBlock = adapterBlock;
    expect(_appCompatible.briefId).toBe('test');
  });

  it('application SrLevel satisfies the adapter SrLevel shape', () => {
    const appLevel: AppSrLevel = { price: 130 };
    const _adapterCompatible: AdapterSrLevel = appLevel;
    expect(_adapterCompatible.price).toBe(130);
  });

  it('adapter SrLevel satisfies the application SrLevel shape', () => {
    const adapterLevel: AdapterSrLevel = { price: 130 };
    const _appCompatible: AppSrLevel = adapterLevel;
    expect(_appCompatible.price).toBe(130);
  });
});
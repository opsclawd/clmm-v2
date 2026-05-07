import { describe, it, expect } from 'vitest';
import type { SrThesisDto, SrThesesBlock } from './index.js';

describe('public surface — v2 sr-theses', () => {
  it('preserves SrThesesBlock schemaVersion as the literal "2.0"', () => {
    // Compile-time check: schemaVersion must be the literal '2.0'.
    const block: SrThesesBlock = {
      schemaVersion: '2.0',
      source: 'openclaw',
      symbol: 'SOL/USDC',
      brief: { briefId: 'brief-1', sourceRecordedAtIso: null, summary: null },
      capturedAtIso: '2026-05-07T00:00:00Z',
      capturedAtUnixMs: 0,
      theses: [],
    };
    expect(block.schemaVersion).toBe('2.0');
  });

  it('keeps bias, setupType, and sourceReliability open as string | null', () => {
    // Compile-time check: assigning unknown strings must succeed.
    const thesis: SrThesisDto = {
      asset: 'SOL/USDC',
      timeframe: '4h',
      bias: 'mildly-constructive-but-cautious',
      setupType: 'distribution-into-vwap',
      supportLevels: [],
      resistanceLevels: [],
      entryZone: null,
      targets: [],
      invalidation: null,
      trigger: null,
      chartReference: null,
      sourceHandle: 'analyst',
      sourceChannel: null,
      sourceKind: 'twitter',
      sourceReliability: 'tier-experimental-2026',
      rawThesisText: null,
      collectedAt: null,
      publishedAt: null,
      sourceUrl: null,
      notes: null,
    };
    expect(thesis.bias).toBe('mildly-constructive-but-cautious');
    expect(thesis.setupType).toBe('distribution-into-vwap');
    expect(thesis.sourceReliability).toBe('tier-experimental-2026');
  });
});

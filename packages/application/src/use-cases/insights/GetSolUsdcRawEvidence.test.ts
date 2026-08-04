import { describe, expect, it, vi } from 'vitest';
import type { EvidenceReadPort } from '../../ports/index.js';
import { getSolUsdcRawEvidence } from './GetSolUsdcRawEvidence.js';

describe('getSolUsdcRawEvidence', () => {
  it('delegates runId to evidenceReadPort.getRawEvidence', async () => {
    const getRawEvidence = vi.fn().mockResolvedValue({ kind: 'ok', payload: { foo: 'bar' } });
    const evidenceReadPort: EvidenceReadPort = {
      fetchCurrent: vi.fn(),
      getRawEvidence,
    };

    const result = await getSolUsdcRawEvidence({
      runId: 'run-123',
      evidenceReadPort,
    });

    expect(getRawEvidence).toHaveBeenCalledWith('run-123');
    expect(result).toEqual({ kind: 'ok', payload: { foo: 'bar' } });
  });
});

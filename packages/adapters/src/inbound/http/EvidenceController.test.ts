import { describe, it, expect, vi } from 'vitest';
import { EvidenceController } from './EvidenceController.js';
import type { EvidenceReadPort, EvidenceReadResult, EvidenceBundle } from '@clmm/application';
import canonicalEvidenceContextual from '../../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/contextual.json';

function fixtureBlock(): EvidenceBundle {
  return canonicalEvidenceContextual as unknown as EvidenceBundle;
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
      const controller = new EvidenceController(port);

      const response = await controller.getCurrent();

      expect(response).toEqual(expected);
      expect(fetchCurrent).toHaveBeenCalledTimes(1);
      expect(fetchCurrent).toHaveBeenCalledWith();
    }
  });
});

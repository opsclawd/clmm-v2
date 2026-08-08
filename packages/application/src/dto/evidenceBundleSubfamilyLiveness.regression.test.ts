import { describe, expect, it } from 'vitest';
import livenessFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/liveness.json' with { type: 'json' };
import { parseEvidenceBundle } from './evidenceBundleValidator.js';

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

const deterministicSubfamilyLiveness = {
  market_state: { isConfigured: true, lastCollectedAt: '2024-01-15T10:00:00.000Z' },
  price_quality: { isConfigured: true, lastCollectedAt: '2024-01-15T10:00:00.000Z' },
  clmm_economics: { isConfigured: true, lastCollectedAt: '2024-01-15T10:00:00.000Z' },
  position_state: { isConfigured: true, lastCollectedAt: '2024-01-15T10:00:00.000Z' },
  liquidity: { isConfigured: true, lastCollectedAt: '2024-01-15T10:00:00.000Z' },
  risk: { isConfigured: true, lastCollectedAt: '2024-01-15T10:00:00.000Z' },
};

describe('evidenceBundleSubfamilyLiveness regression', () => {
  it('accepts all six deterministic sub-family liveness keys without mutating the payload', () => {
    const payload = deepClone(livenessFixture);
    payload.assessment.liveness = {
      ...payload.assessment.liveness,
      ...deterministicSubfamilyLiveness,
    };

    const parsed = parseEvidenceBundle(payload);
    expect(parsed).toBe(payload);
    expect(parsed?.assessment?.liveness).toMatchObject(deterministicSubfamilyLiveness);
  });
});

import { describe, expect, it } from 'vitest';
import type {
  PolicyInsightBlock,
  PolicyInsightClmmPolicy,
  PolicyInsightLevels,
  PolicyInsightFreshness,
  PolicyInsightRecommendedAction,
  PolicyInsightConfidence,
  PolicyInsightRiskLevel,
  PolicyInsightDataQuality,
  PolicyInsightStatus,
} from './index.js';

describe('@clmm/application/public exports for policy insights', () => {
  it('exposes PolicyInsightBlock and nested DTOs as types', () => {
    const sample: PolicyInsightBlock = {
      schemaVersion: '1.0',
      pair: 'SOL/USDC',
      asOf: '2026-05-07T00:00:00Z',
      source: 'openclaw',
      runId: 'run-1',
      status: 'FRESH' satisfies PolicyInsightStatus,
      marketRegime: 'UP',
      fundamentalRegime: 'NEUTRAL',
      recommendedAction: 'hold' satisfies PolicyInsightRecommendedAction,
      confidence: 'medium' satisfies PolicyInsightConfidence,
      riskLevel: 'normal' satisfies PolicyInsightRiskLevel,
      dataQuality: 'complete' satisfies PolicyInsightDataQuality,
      clmmPolicy: {
        posture: 'wide',
        rangeBias: 'symmetric',
        rebalanceSensitivity: 'low',
        maxCapitalDeploymentPct: 0.5,
      } satisfies PolicyInsightClmmPolicy,
      levels: { supports: [], resistances: [] } satisfies PolicyInsightLevels,
      reasoning: [],
      sourceRefs: [],
      expiresAt: '2026-05-07T01:00:00Z',
      payloadHash: 'abc',
      receivedAtIso: '2026-05-07T00:00:01Z',
      freshness: {
        capturedAtUnixMs: 1_700_000_000_000,
        stale: false,
      } satisfies PolicyInsightFreshness,
    };
    expect(sample.recommendedAction).toBe('hold');
  });
});

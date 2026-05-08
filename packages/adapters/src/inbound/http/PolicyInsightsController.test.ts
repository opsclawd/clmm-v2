import { describe, it, expect, vi } from 'vitest';
import { PolicyInsightsController } from './PolicyInsightsController.js';
import type {
  PolicyInsightsReadPort,
  PolicyInsightsReadResult,
  PolicyInsightBlock,
} from '@clmm/application';

function fixtureBlock(): PolicyInsightBlock {
  return {
    schemaVersion: '1.0',
    pair: 'SOL/USDC',
    asOf: '2026-05-07T00:00:00Z',
    source: 'openclaw',
    runId: 'run-1',
    status: 'FRESH',
    marketRegime: 'UP',
    fundamentalRegime: 'NEUTRAL',
    recommendedAction: 'hold',
    confidence: 'medium',
    riskLevel: 'normal',
    dataQuality: 'complete',
    clmmPolicy: {
      posture: 'wide',
      rangeBias: 'symmetric',
      rebalanceSensitivity: 'low',
      maxCapitalDeploymentPct: 0.5,
    },
    levels: { supports: [], resistances: [] },
    reasoning: [],
    sourceRefs: [],
    expiresAt: '2026-05-07T01:00:00Z',
    payloadHash: 'h',
    receivedAtIso: '2026-05-07T00:00:01Z',
    freshness: { capturedAtUnixMs: Date.parse('2026-05-07T00:00:00Z'), stale: false },
  };
}

describe('PolicyInsightsController', () => {
  it('returns { policyInsight: block } when port resolves a block', async () => {
    const block = fixtureBlock();
    const result: PolicyInsightsReadResult = { kind: 'block', block };
    const fetchCurrent = vi.fn().mockResolvedValue(result);
    const port: PolicyInsightsReadPort = { fetchCurrent };
    const controller = new PolicyInsightsController(port);

    const response = await controller.getCurrent();

    expect(response).toEqual({ policyInsight: block });
    expect(fetchCurrent).toHaveBeenCalledWith();
  });

  it('maps not-found to { policyInsight: null, unavailableReason: "not-found" }', async () => {
    const result: PolicyInsightsReadResult = { kind: 'not-found' };
    const fetchCurrent = vi.fn().mockResolvedValue(result);
    const port: PolicyInsightsReadPort = { fetchCurrent };
    const controller = new PolicyInsightsController(port);
    const response = await controller.getCurrent();
    expect(response).toEqual({ policyInsight: null, unavailableReason: 'not-found' });
  });

  it('maps store-unavailable to { policyInsight: null, unavailableReason: "store-unavailable" }', async () => {
    const result: PolicyInsightsReadResult = { kind: 'store-unavailable' };
    const fetchCurrent = vi.fn().mockResolvedValue(result);
    const port: PolicyInsightsReadPort = { fetchCurrent };
    const controller = new PolicyInsightsController(port);
    const response = await controller.getCurrent();
    expect(response).toEqual({ policyInsight: null, unavailableReason: 'store-unavailable' });
  });

  it('maps config-error to { policyInsight: null, unavailableReason: "config-error" }', async () => {
    const result: PolicyInsightsReadResult = { kind: 'config-error' };
    const fetchCurrent = vi.fn().mockResolvedValue(result);
    const port: PolicyInsightsReadPort = { fetchCurrent };
    const controller = new PolicyInsightsController(port);
    const response = await controller.getCurrent();
    expect(response).toEqual({ policyInsight: null, unavailableReason: 'config-error' });
  });

  it('maps upstream-error to { policyInsight: null, unavailableReason: "upstream-error" }', async () => {
    const result: PolicyInsightsReadResult = { kind: 'upstream-error' };
    const fetchCurrent = vi.fn().mockResolvedValue(result);
    const port: PolicyInsightsReadPort = { fetchCurrent };
    const controller = new PolicyInsightsController(port);
    const response = await controller.getCurrent();
    expect(response).toEqual({ policyInsight: null, unavailableReason: 'upstream-error' });
  });
});

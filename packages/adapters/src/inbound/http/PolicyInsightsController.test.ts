import { describe, it, expect, vi } from 'vitest';
import { PolicyInsightsController } from './PolicyInsightsController.js';
import type {
  PolicyInsightsReadPort,
  PolicyInsightsReadResult,
  PolicyInsightBlock,
} from '@clmm/application';
import canonicalCurrentPair from '../../../../../schemas/regime-engine/policy-insight.v1/fixtures/valid/current-pair.json';

function fixtureBlock(): PolicyInsightBlock {
  return canonicalCurrentPair as PolicyInsightBlock;
}

describe('PolicyInsightsController', () => {
  it('passes through the canonical block without modification', async () => {
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

  it('maps malformed to { policyInsight: null, unavailableReason: "malformed" }', async () => {
    const result: PolicyInsightsReadResult = { kind: 'malformed' };
    const fetchCurrent = vi.fn().mockResolvedValue(result);
    const port: PolicyInsightsReadPort = { fetchCurrent };
    const controller = new PolicyInsightsController(port);
    const response = await controller.getCurrent();
    expect(response).toEqual({ policyInsight: null, unavailableReason: 'malformed' });
  });
});

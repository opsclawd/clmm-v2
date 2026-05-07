import { describe, expect, it } from 'vitest';
import type { PolicyInsightBlock } from '@clmm/application/public';
import { buildPolicyInsightsViewModel } from './PolicyInsightsViewModel.js';

const NOW = Date.parse('2026-05-07T12:30:00Z');

function fixture(overrides: Partial<PolicyInsightBlock> = {}): PolicyInsightBlock {
  return {
    schemaVersion: '1.0',
    pair: 'SOL/USDC',
    asOf: '2026-05-07T12:00:00Z',
    source: 'openclaw',
    runId: 'run-1',
    status: 'FRESH',
    marketRegime: 'UP',
    fundamentalRegime: 'CONSTRUCTIVE',
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
    reasoning: ['Trend constructive', 'Vol muted', 'Funding neutral'],
    sourceRefs: ['msg-1'],
    expiresAt: '2026-05-07T13:00:00Z',
    payloadHash: 'h',
    receivedAtIso: '2026-05-07T12:00:01Z',
    freshness: { capturedAtUnixMs: Date.parse('2026-05-07T12:00:00Z'), stale: false },
    ...overrides,
  };
}

describe('buildPolicyInsightsViewModel', () => {
  it('returns a neutral severity for hold + normal risk', () => {
    const vm = buildPolicyInsightsViewModel(fixture(), NOW);
    expect(vm.severity).toBe('neutral');
  });

  it('returns danger for critical risk regardless of action', () => {
    const vm = buildPolicyInsightsViewModel(
      fixture({ riskLevel: 'critical', recommendedAction: 'hold' }),
      NOW,
    );
    expect(vm.severity).toBe('danger');
  });

  it('returns danger for exit_range action regardless of risk', () => {
    const vm = buildPolicyInsightsViewModel(
      fixture({ recommendedAction: 'exit_range', riskLevel: 'normal' }),
      NOW,
    );
    expect(vm.severity).toBe('danger');
  });

  it('returns warning for elevated risk', () => {
    const vm = buildPolicyInsightsViewModel(fixture({ riskLevel: 'elevated' }), NOW);
    expect(vm.severity).toBe('warning');
  });

  it('returns warning for pause_rebalances action', () => {
    const vm = buildPolicyInsightsViewModel(
      fixture({ recommendedAction: 'pause_rebalances' }),
      NOW,
    );
    expect(vm.severity).toBe('warning');
  });

  it('marks isStale when status is STALE', () => {
    const vm = buildPolicyInsightsViewModel(fixture({ status: 'STALE' }), NOW);
    expect(vm.isStale).toBe(true);
  });

  it('marks isStale when freshness.stale is true', () => {
    const vm = buildPolicyInsightsViewModel(
      fixture({
        freshness: { capturedAtUnixMs: NOW, stale: true },
      }),
      NOW,
    );
    expect(vm.isStale).toBe(true);
  });

  it('formats max capital deployment as a percent', () => {
    const vm = buildPolicyInsightsViewModel(
      fixture({
        clmmPolicy: {
          posture: 'wide',
          rangeBias: 'symmetric',
          rebalanceSensitivity: 'low',
          maxCapitalDeploymentPct: 0.375,
        },
      }),
      NOW,
    );
    expect(vm.maxDeploymentLabel).toBe('38%');
  });

  it('keeps the first 3 non-empty reasoning strings in upstream order', () => {
    const vm = buildPolicyInsightsViewModel(
      fixture({
        reasoning: ['', 'one', '   ', 'two', 'three', 'four'],
      }),
      NOW,
    );
    expect(vm.reasoning).toEqual(['one', 'two', 'three']);
  });

  it('does not surface sourceRefs in the view model fields used for rendering', () => {
    const vm = buildPolicyInsightsViewModel(fixture({ sourceRefs: ['msg-1', 'msg-2'] }), NOW);
    expect((vm as unknown as Record<string, unknown>)['sourceRefs']).toBeUndefined();
  });
});

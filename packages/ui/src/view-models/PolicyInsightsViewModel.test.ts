import { describe, expect, it } from 'vitest';
import type { PolicyInsightBlock } from '@clmm/application/public';
import { buildPolicyInsightsViewModel } from './PolicyInsightsViewModel.js';
import canonicalCurrentPair from '../../../../schemas/regime-engine/policy-insight.v1/fixtures/valid/current-pair.json';
import canonicalCurrentPosition from '../../../../schemas/regime-engine/policy-insight.v1/fixtures/valid/current-position.json';

const NOW = Date.parse('2026-07-19T12:30:00Z');

function fixture(overrides: Partial<PolicyInsightBlock> = {}): PolicyInsightBlock {
  return {
    schemaVersion: 'policy-insight.v1',
    insightId: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1a1',
    rulesetVersion: 'sol-usdc-policy.v1.2026-07',
    pair: 'SOL/USDC',
    position: null,
    generatedAt: '2026-07-19T12:00:00.000Z',
    asOf: '2026-07-19T11:59:00.000Z',
    expiresAt: '2026-07-19T13:00:00.000Z',
    marketRegime: 'UP',
    fundamentalRegime: 'BULLISH',
    posture: 'AGGRESSIVE',
    recommendedAction: 'HOLD',
    riskLevel: 'NORMAL',
    clmmPolicy: {
      rangeBias: 'MEDIUM',
      rebalanceSensitivity: 'NORMAL',
      maxCapitalDeploymentBps: 7500,
    },
    levels: {
      supportsUsdcPerSol: [],
      resistancesUsdcPerSol: [],
    },
    evidence: {
      selectionStatus: 'FULL',
      selectionPolicyVersion: 'selector.v1.2026-07',
      selectedBundleRefs: [],
      selectedSourceRefs: [],
    },
    confidenceBps: 7500,
    dataQuality: 'COMPLETE',
    reasonCodes: ['MARKET_REGIME_UP', 'ADVISORY_ONLY'],
    reasoning:
      'Market regime is UP with bullish fundamental signals. No position-specific triggers present.',
    warnings: [],
    freshness: {
      status: 'FRESH',
      evaluatedAt: '2026-07-19T12:00:00.000Z',
      ageSeconds: 60,
    },
    ...overrides,
  };
}

describe('buildPolicyInsightsViewModel', () => {
  it('returns a neutral severity for HOLD + NORMAL risk', () => {
    const vm = buildPolicyInsightsViewModel(fixture(), NOW);
    expect(vm.severity).toBe('neutral');
  });

  it('returns danger for CRITICAL risk regardless of action', () => {
    const vm = buildPolicyInsightsViewModel(
      fixture({ riskLevel: 'CRITICAL', recommendedAction: 'HOLD' }),
      NOW,
    );
    expect(vm.severity).toBe('danger');
  });

  it('returns danger for EXIT_TO_USDC action regardless of risk', () => {
    const vm = buildPolicyInsightsViewModel(
      fixture({ recommendedAction: 'EXIT_TO_USDC', riskLevel: 'NORMAL' }),
      NOW,
    );
    expect(vm.severity).toBe('danger');
  });

  it('returns danger for EXIT_TO_SOL action regardless of risk', () => {
    const vm = buildPolicyInsightsViewModel(
      fixture({ recommendedAction: 'EXIT_TO_SOL', riskLevel: 'NORMAL' }),
      NOW,
    );
    expect(vm.severity).toBe('danger');
  });

  it('returns warning for ELEVATED risk', () => {
    const vm = buildPolicyInsightsViewModel(fixture({ riskLevel: 'ELEVATED' }), NOW);
    expect(vm.severity).toBe('warning');
  });

  it('returns warning for STAND_DOWN action', () => {
    const vm = buildPolicyInsightsViewModel(fixture({ recommendedAction: 'STAND_DOWN' }), NOW);
    expect(vm.severity).toBe('warning');
  });

  it('marks isStale when freshness.status is STALE', () => {
    const vm = buildPolicyInsightsViewModel(
      fixture({
        freshness: { status: 'STALE', evaluatedAt: '2026-07-19T12:00:00.000Z', ageSeconds: 3600 },
      }),
      NOW,
    );
    expect(vm.isStale).toBe(true);
  });

  it('formats max capital deployment from bps as a percent', () => {
    const vm = buildPolicyInsightsViewModel(
      fixture({
        clmmPolicy: {
          rangeBias: 'TIGHT',
          rebalanceSensitivity: 'HIGH',
          maxCapitalDeploymentBps: 3750,
        },
      }),
      NOW,
    );
    expect(vm.maxDeploymentLabel).toBe('38%');
  });

  it('derives freshness label from ageSeconds', () => {
    const vm = buildPolicyInsightsViewModel(
      fixture({
        freshness: { status: 'FRESH', evaluatedAt: '2026-07-19T12:00:00.000Z', ageSeconds: 60 },
      }),
      NOW,
    );
    expect(vm.freshnessLabel).toBe('1m ago');
  });

  it('renders the canonical pair fixture correctly', () => {
    const vm = buildPolicyInsightsViewModel(canonicalCurrentPair as PolicyInsightBlock, NOW);
    expect(vm.actionLabel).toBe('Hold');
    expect(vm.severity).toBe('neutral');
    expect(vm.freshnessLabel).toBe('1m ago');
  });

  it('renders the canonical position fixture correctly', () => {
    const vm = buildPolicyInsightsViewModel(canonicalCurrentPosition as PolicyInsightBlock, NOW);
    expect(vm.actionLabel).toBe('Exit to SOL');
    expect(vm.severity).toBe('danger');
  });
});

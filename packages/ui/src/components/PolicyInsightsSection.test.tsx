import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { PolicyInsightBlock } from '@clmm/application/public';
import { PolicyInsightsSection } from './PolicyInsightsSection.js';
import canonicalCurrentPair from '../../../../schemas/regime-engine/policy-insight.v1/fixtures/valid/current-pair.json';
import canonicalCurrentPosition from '../../../../schemas/regime-engine/policy-insight.v1/fixtures/valid/current-position.json';

afterEach(() => {
  cleanup();
});

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

describe('PolicyInsightsSection', () => {
  it('returns null when not enabled and no data', () => {
    const { container } = render(
      <PolicyInsightsSection
        policyInsight={undefined}
        isLoading={false}
        isError={false}
        isEnabled={false}
        unavailableReason={null}
        now={NOW}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders title, action, posture, range bias, sensitivity, percent, risk, confidence, data quality, and reasoning', () => {
    render(
      <PolicyInsightsSection
        policyInsight={fixture()}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason={null}
        now={NOW}
      />,
    );
    expect(screen.getByText('PolicyInsights')).toBeTruthy();
    expect(screen.getByText('Advisory CLMM policy signal. Nothing has been applied.')).toBeTruthy();
    expect(screen.getByText('Hold')).toBeTruthy();
    expect(screen.getByText('Posture: AGGRESSIVE')).toBeTruthy();
    expect(screen.getByText('Range bias: MEDIUM')).toBeTruthy();
    expect(screen.getByText('Rebalance sensitivity: NORMAL')).toBeTruthy();
    expect(screen.getByText('75%')).toBeTruthy();
    expect(screen.getByText('Normal risk')).toBeTruthy();
    expect(screen.getByText('75% confidence')).toBeTruthy();
    expect(screen.getByText('Complete data')).toBeTruthy();
    expect(
      screen.getByText(
        'Market regime is UP with bullish fundamental signals. No position-specific triggers present.',
      ),
    ).toBeTruthy();
  });

  it('renders a stale warning line when freshness.status is STALE', () => {
    render(
      <PolicyInsightsSection
        policyInsight={fixture({
          freshness: { status: 'STALE', evaluatedAt: '2026-07-19T12:00:00.000Z', ageSeconds: 3600 },
        })}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason={null}
        now={NOW}
      />,
    );
    expect(screen.getByTestId('policy-insights-stale-warning')).toBeTruthy();
  });

  it('uses danger styling for critical risk', () => {
    render(
      <PolicyInsightsSection
        policyInsight={fixture({ riskLevel: 'CRITICAL' })}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason={null}
        now={NOW}
      />,
    );
    expect(screen.getByTestId('policy-insights-card')).toBeTruthy();
    expect(screen.getByText('Critical risk')).toBeTruthy();
  });

  it('uses warning styling for STAND_DOWN', () => {
    render(
      <PolicyInsightsSection
        policyInsight={fixture({ recommendedAction: 'STAND_DOWN' })}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason={null}
        now={NOW}
      />,
    );
    expect(screen.getByText('Stand down')).toBeTruthy();
  });

  it('renders the canonical pair fixture correctly', () => {
    render(
      <PolicyInsightsSection
        policyInsight={canonicalCurrentPair as PolicyInsightBlock}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason={null}
        now={NOW}
      />,
    );
    expect(screen.getByText('Hold')).toBeTruthy();
    expect(screen.getByText('Normal risk')).toBeTruthy();
  });

  it('renders the canonical position fixture correctly', () => {
    render(
      <PolicyInsightsSection
        policyInsight={canonicalCurrentPosition as PolicyInsightBlock}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason={null}
        now={NOW}
      />,
    );
    expect(screen.getByText('Exit to SOL')).toBeTruthy();
    expect(screen.getByText('Elevated risk')).toBeTruthy();
  });

  it('renders unavailable copy for not-found', () => {
    render(
      <PolicyInsightsSection
        policyInsight={null}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason="not-found"
        now={NOW}
      />,
    );
    expect(screen.getByText('No policy insight available yet.')).toBeTruthy();
  });

  it('renders unavailable copy for store-unavailable', () => {
    render(
      <PolicyInsightsSection
        policyInsight={null}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason="store-unavailable"
        now={NOW}
      />,
    );
    expect(screen.getByText('Policy insights unavailable.')).toBeTruthy();
  });

  it('renders the same unavailable copy for config-error and upstream-error', () => {
    const { rerender } = render(
      <PolicyInsightsSection
        policyInsight={null}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason="config-error"
        now={NOW}
      />,
    );
    expect(screen.getByText('Policy insights unavailable.')).toBeTruthy();

    rerender(
      <PolicyInsightsSection
        policyInsight={null}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason="upstream-error"
        now={NOW}
      />,
    );
    expect(screen.getByText('Policy insights unavailable.')).toBeTruthy();
  });

  it('renders a degraded warning when isError but cached data is shown', () => {
    render(
      <PolicyInsightsSection
        policyInsight={fixture()}
        isLoading={false}
        isError
        isEnabled
        unavailableReason={null}
        now={NOW}
      />,
    );
    expect(screen.getByTestId('policy-insights-degraded')).toBeTruthy();
  });

  it('renders unavailable card when isError is true with no unavailableReason', () => {
    render(
      <PolicyInsightsSection
        policyInsight={null}
        isLoading={false}
        isError
        isEnabled
        unavailableReason={null}
        now={NOW}
      />,
    );
    expect(screen.getByTestId('policy-insights-unavailable')).toBeTruthy();
    expect(screen.getByText('Policy insights unavailable.')).toBeTruthy();
  });

  it('renders unavailable card when isError is true with upstream-error reason', () => {
    render(
      <PolicyInsightsSection
        policyInsight={null}
        isLoading={false}
        isError
        isEnabled
        unavailableReason="upstream-error"
        now={NOW}
      />,
    );
    expect(screen.getByTestId('policy-insights-unavailable')).toBeTruthy();
    expect(screen.getByText('Policy insights unavailable.')).toBeTruthy();
  });

  it('renders a skeleton when loading with no data', () => {
    render(
      <PolicyInsightsSection
        policyInsight={undefined}
        isLoading
        isError={false}
        isEnabled
        unavailableReason={null}
        now={NOW}
      />,
    );
    expect(screen.getByTestId('policy-insights-skeleton')).toBeTruthy();
  });
});

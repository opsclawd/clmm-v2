import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { PolicyInsightBlock } from '@clmm/application/public';
import { PolicyInsightsSection } from './PolicyInsightsSection.js';

afterEach(() => {
  cleanup();
});

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
    expect(screen.getByText('Posture: wide')).toBeTruthy();
    expect(screen.getByText('Range bias: symmetric')).toBeTruthy();
    expect(screen.getByText('Rebalance sensitivity: low')).toBeTruthy();
    expect(screen.getByText('Max capital: 50%')).toBeTruthy();
    expect(screen.getByText('Normal risk')).toBeTruthy();
    expect(screen.getByText('Medium confidence')).toBeTruthy();
    expect(screen.getByText('Complete data')).toBeTruthy();
    expect(screen.getByText('Trend constructive')).toBeTruthy();
    expect(screen.getByText('Vol muted')).toBeTruthy();
    expect(screen.getByText('Funding neutral')).toBeTruthy();
  });

  it('renders a stale warning line when status is STALE', () => {
    render(
      <PolicyInsightsSection
        policyInsight={fixture({ status: 'STALE' })}
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
        policyInsight={fixture({ riskLevel: 'critical' })}
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

  it('uses warning styling for pause_rebalances', () => {
    render(
      <PolicyInsightsSection
        policyInsight={fixture({ recommendedAction: 'pause_rebalances' })}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason={null}
        now={NOW}
      />,
    );
    expect(screen.getByText('Pause rebalances')).toBeTruthy();
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

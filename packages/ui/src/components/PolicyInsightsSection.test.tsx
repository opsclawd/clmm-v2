import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
    expect(
      screen.getByText(
        'Advisory policy context only. Nothing is signed or applied; deterministic stop-loss monitoring continues independently.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Hold')).toBeTruthy();
    expect(screen.getByText('Aggressive')).toBeTruthy();
    expect(screen.getByText('Medium')).toBeTruthy();
    expect(screen.getByText('Normal')).toBeTruthy();
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
    expect(
      screen.getByText(
        'No policy insight is available yet. Position monitoring and deterministic stop-loss protection continue independently.',
      ),
    ).toBeTruthy();
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
    expect(
      screen.getByText(
        'The policy insight store is temporarily unavailable. Position monitoring and deterministic stop-loss protection continue independently.',
      ),
    ).toBeTruthy();
  });

  it('renders distinct unavailable copy for config-error', () => {
    render(
      <PolicyInsightsSection
        policyInsight={null}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason="config-error"
        now={NOW}
      />,
    );
    expect(
      screen.getByText(
        'Policy analysis is not configured. Position monitoring and deterministic stop-loss protection continue independently.',
      ),
    ).toBeTruthy();
  });

  it('renders distinct unavailable copy for upstream-error', () => {
    render(
      <PolicyInsightsSection
        policyInsight={null}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason="upstream-error"
        now={NOW}
      />,
    );
    expect(
      screen.getByText(
        'The policy insight service could not be reached. Position monitoring and deterministic stop-loss protection continue independently.',
      ),
    ).toBeTruthy();
  });

  it('renders fail-closed unavailable copy for malformed', () => {
    render(
      <PolicyInsightsSection
        policyInsight={null}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason="malformed"
        now={NOW}
      />,
    );
    expect(screen.getByTestId('policy-insights-unavailable')).toBeTruthy();
    expect(
      screen.getByText(
        'The policy insight payload was malformed, so guidance was withheld. Position monitoring and deterministic stop-loss protection continue independently.',
      ),
    ).toBeTruthy();
  });

  it('renders distinct bounded copy for every unavailable reason', () => {
    const reasons = [
      'not-found',
      'store-unavailable',
      'config-error',
      'upstream-error',
      'malformed',
    ] as const;
    for (const reason of reasons) {
      cleanup();
      render(
        <PolicyInsightsSection
          policyInsight={null}
          isLoading={false}
          isError={false}
          isEnabled
          unavailableReason={reason}
          now={NOW}
        />,
      );
      expect(screen.getByTestId('policy-insights-unavailable')).toBeTruthy();
    }
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
    expect(
      screen.getByText(
        'The policy insight service could not be reached. Position monitoring and deterministic stop-loss protection continue independently.',
      ),
    ).toBeTruthy();
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

  it('labels cached data as updating during an active refresh', () => {
    render(
      <PolicyInsightsSection
        policyInsight={fixture()}
        isLoading={true}
        isError={false}
        isEnabled
        unavailableReason={null}
        now={NOW}
      />,
    );
    expect(screen.getByTestId('policy-insights-updating')).toBeTruthy();
    expect(screen.getByText('Updating policy insight…')).toBeTruthy();
  });

  it('renders fresh full-evidence insight with current timing context', () => {
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
    expect(screen.getByTestId('policy-insights-card')).toBeTruthy();
    expect(screen.getByTestId('policy-insights-freshness')).toBeTruthy();
    expect(screen.getByText('1m ago')).toBeTruthy();
  });

  it('renders market regimes multiple levels and evidence summary from the canonical position fixture', () => {
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
    expect(screen.getByText('Up market')).toBeTruthy();
    expect(screen.getByText('Bullish')).toBeTruthy();
    expect(screen.getByText('Moderately aggressive')).toBeTruthy();
    expect(screen.getByText('138.5, 135.2 USDC/SOL')).toBeTruthy();
    expect(screen.getByText('142.0, 145.5 USDC/SOL')).toBeTruthy();
    expect(screen.getByText('Partial evidence coverage (1 bundle, 1 source)')).toBeTruthy();
  });

  it('renders one unavailable-level line for empty canonical level arrays', () => {
    render(
      <PolicyInsightsSection
        policyInsight={fixture({
          levels: {
            supportsUsdcPerSol: [],
            resistancesUsdcPerSol: [],
          },
        })}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason={null}
        now={NOW}
      />,
    );
    expect(screen.getByText('No eligible support or resistance levels')).toBeTruthy();
    expect(screen.queryByText('USDC/SOL')).toBeNull();
  });

  it('renders degraded evidence and bounded stable warning copy', () => {
    render(
      <PolicyInsightsSection
        policyInsight={fixture({
          evidence: {
            selectionStatus: 'PARTIAL',
            selectionPolicyVersion: 'selector.v1.2026-07',
            selectedBundleRefs: [],
            selectedSourceRefs: [],
          },
          warnings: [
            { code: 'EVIDENCE_STALE_INPUT', message: 'Some free-form upstream warning message' },
          ],
        })}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason={null}
        now={NOW}
      />,
    );
    expect(screen.getByText('Partial evidence coverage')).toBeTruthy();
    expect(screen.getByText('Evidence stale input')).toBeTruthy();
    expect(screen.queryByText(/free-form/i)).toBeNull();
  });

  it('renders stale as-of and expiry context with weaker treatment', () => {
    render(
      <PolicyInsightsSection
        policyInsight={fixture({
          freshness: { status: 'STALE', evaluatedAt: '2026-07-19T12:00:00.000Z', ageSeconds: 3600 },
          expiresAt: '2026-07-19T12:29:59.000Z',
        })}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason={null}
        now={NOW}
      />,
    );
    expect(screen.getByTestId('policy-insights-card')).toBeTruthy();
    expect(screen.getByTestId('policy-insights-stale-warning')).toBeTruthy();
    expect(screen.getByText(/Stale/)).toBeTruthy();
  });

  it('keeps refresh failure distinct from canonical evidence degradation', () => {
    render(
      <PolicyInsightsSection
        policyInsight={fixture({
          evidence: {
            selectionStatus: 'DEGRADED',
            selectionPolicyVersion: 'selector.v1.2026-07',
            selectedBundleRefs: [],
            selectedSourceRefs: [],
          },
        })}
        isLoading={false}
        isError={true}
        isEnabled
        unavailableReason={null}
        now={NOW}
      />,
    );
    expect(screen.getByTestId('policy-insights-degraded')).toBeTruthy();
    expect(
      screen.getByText('Refresh failed — showing last available policy insight.'),
    ).toBeTruthy();
    expect(screen.getByText('Limited evidence coverage')).toBeTruthy();
  });

  it('keeps EXIT_TO_USDC and EXIT_TO_SOL advisory and non-executable', () => {
    const exitUsdcFixture = fixture({ recommendedAction: 'EXIT_TO_USDC' });
    const { rerender: rerenderUsdc } = render(
      <PolicyInsightsSection
        policyInsight={exitUsdcFixture}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason={null}
        now={NOW}
      />,
    );
    expect(screen.getByText('Exit to USDC')).toBeTruthy();
    expect(screen.queryByTestId('policy-insights-action')).toBeTruthy();

    const exitSolFixture = fixture({ recommendedAction: 'EXIT_TO_SOL' });
    rerenderUsdc(
      <PolicyInsightsSection
        policyInsight={exitSolFixture}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason={null}
        now={NOW}
      />,
    );
    expect(screen.getByText('Exit to SOL')).toBeTruthy();
  });

  it('does not render raw evidence identifiers or upstream warning messages', () => {
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
    expect(screen.queryByText(/abcd1234/)).toBeNull();
    expect(screen.queryByText(/src111111/)).toBeNull();
    expect(screen.queryByText(/locator/i)).toBeNull();
    expect(screen.queryByText(/Support\/resistance evidence conflicts/i)).toBeNull();
  });

  it('shows why this recommendation only for a canonical insight with a callback', () => {
    const onViewSynthesis = vi.fn();
    render(
      <PolicyInsightsSection
        policyInsight={fixture()}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason={null}
        now={NOW}
        onViewSynthesis={onViewSynthesis}
      />,
    );
    expect(screen.getByText('Why this recommendation')).toBeTruthy();

    cleanup();
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
    expect(screen.queryByText('Why this recommendation')).toBeNull();
  });

  it('invokes synthesis navigation without changing recommendation content', () => {
    const onViewSynthesis = vi.fn();
    render(
      <PolicyInsightsSection
        policyInsight={fixture()}
        isLoading={false}
        isError={false}
        isEnabled
        unavailableReason={null}
        now={NOW}
        onViewSynthesis={onViewSynthesis}
      />,
    );

    const button = screen.getByText('Why this recommendation');
    fireEvent.click(button);

    expect(onViewSynthesis).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('policy-insights-card')).toBeTruthy();
    expect(screen.getByText('Hold')).toBeTruthy();
    expect(screen.getByTestId('policy-insights-freshness')).toBeTruthy();
    expect(
      screen.getByText(
        'Advisory policy context only. Nothing is signed or applied; deterministic stop-loss monitoring continues independently.',
      ),
    ).toBeTruthy();
  });

  it('never shows synthesis navigation in loading unavailable or disabled states', () => {
    const onViewSynthesis = vi.fn();

    render(
      <PolicyInsightsSection
        policyInsight={fixture()}
        isLoading={false}
        isError={false}
        isEnabled={false}
        unavailableReason={null}
        now={NOW}
        onViewSynthesis={onViewSynthesis}
      />,
    );
    expect(screen.queryByText('Why this recommendation')).toBeNull();
    cleanup();

    render(
      <PolicyInsightsSection
        policyInsight={undefined}
        isLoading={true}
        isError={false}
        isEnabled={true}
        unavailableReason={null}
        now={NOW}
        onViewSynthesis={onViewSynthesis}
      />,
    );
    expect(screen.queryByText('Why this recommendation')).toBeNull();
    cleanup();

    render(
      <PolicyInsightsSection
        policyInsight={fixture()}
        isLoading={true}
        isError={false}
        isEnabled={true}
        unavailableReason={null}
        now={NOW}
        onViewSynthesis={onViewSynthesis}
      />,
    );
    expect(screen.queryByText('Why this recommendation')).toBeNull();
    cleanup();

    render(
      <PolicyInsightsSection
        policyInsight={null}
        isLoading={false}
        isError={false}
        isEnabled={true}
        unavailableReason="not-found"
        now={NOW}
        onViewSynthesis={onViewSynthesis}
      />,
    );
    expect(screen.queryByText('Why this recommendation')).toBeNull();
  });
});

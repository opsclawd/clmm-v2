import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PolicyInsightBlock, PolicyInsightsUnavailableReason } from '@clmm/application/public';
import { SynthesisScreen } from './SynthesisScreen.js';

afterEach(() => {
  cleanup();
});

function createFixture(overrides: Partial<PolicyInsightBlock> = {}): PolicyInsightBlock {
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
      selectedBundleRefs: [
        {
          bundleHash: 'abcd1234abcd5678abcd9012abcd3456abcd7890abcd1234abcd5678abcd9012',
          publisher: 'sol-usdc-clmm-intelligence',
          sourceId: 'src1111111111111111111111111111111111',
          runId: 'run2222222222222222222222222222222222',
        },
      ],
      selectedSourceRefs: [
        {
          referenceId: 'ref3333333333333333333333333333333333',
          sourceType: 'api',
          locator: 'https://api.example.com/price/sol-usdc',
          observedAt: '2026-07-19T11:58:00.000Z',
        },
      ],
    },
    confidenceBps: 7500,
    dataQuality: 'COMPLETE',
    reasonCodes: ['MARKET_REGIME_UP', 'ADVISORY_ONLY'],
    reasoning:
      'Market regime is UP with bullish fundamental signals. No position-specific triggers present.',
    warnings: [
      {
        code: 'EVIDENCE_STALE_INPUT',
        message: 'Input data is stale by 120s',
      },
    ],
    freshness: {
      status: 'FRESH',
      evaluatedAt: '2026-07-19T12:00:00.000Z',
      ageSeconds: 60,
    },
    ...overrides,
  };
}

describe('SynthesisScreen', () => {
  it('renders loading before an insight is available', () => {
    render(<SynthesisScreen isLoading={true} policyInsight={null} />);

    expect(screen.getByTestId('synthesis-screen-loading')).toBeDefined();
    expect(screen.queryByTestId('synthesis-screen-error')).toBeNull();
    expect(screen.queryByTestId('synthesis-screen-unavailable')).toBeNull();
    expect(screen.queryByTestId('synthesis-screen-canonical')).toBeNull();
  });

  it('renders transport error when refresh fails without an insight', () => {
    const onBack = vi.fn();
    render(
      <SynthesisScreen isLoading={false} isError={true} policyInsight={null} onBack={onBack} />,
    );

    expect(screen.getByTestId('synthesis-screen-error')).toBeDefined();
    expect(screen.getByTestId('synthesis-back-button')).toBeDefined();
    expect(screen.queryByTestId('synthesis-screen-loading')).toBeNull();
    expect(screen.queryByTestId('synthesis-screen-unavailable')).toBeNull();
    expect(screen.queryByTestId('synthesis-screen-canonical')).toBeNull();
  });

  it('renders the specific unavailable reason without an insight', () => {
    const reasons: PolicyInsightsUnavailableReason[] = [
      'not-found',
      'store-unavailable',
      'config-error',
      'malformed',
      'upstream-error',
    ];

    for (const reason of reasons) {
      const { unmount } = render(
        <SynthesisScreen
          isLoading={false}
          isError={false}
          unavailableReason={reason}
          policyInsight={null}
        />,
      );
      expect(screen.getByTestId('synthesis-screen-unavailable')).toBeDefined();
      expect(screen.queryByTestId('synthesis-screen-loading')).toBeNull();
      expect(screen.queryByTestId('synthesis-screen-error')).toBeNull();
      expect(screen.queryByTestId('synthesis-screen-canonical')).toBeNull();
      unmount();
    }
  });

  it('keeps the cached insight visible while a refresh is in flight or fails', () => {
    const block = createFixture();

    // Refresh in flight
    const { rerender } = render(<SynthesisScreen isLoading={true} policyInsight={block} />);
    expect(screen.getByTestId('synthesis-screen-canonical')).toBeDefined();
    expect(screen.getByTestId('synthesis-screen-updating')).toBeDefined();

    // Refresh failed
    rerender(<SynthesisScreen isLoading={false} isError={true} policyInsight={block} />);
    expect(screen.getByTestId('synthesis-screen-canonical')).toBeDefined();
    expect(screen.getByTestId('synthesis-screen-refresh-failed')).toBeDefined();
  });

  it('renders every canonical synthesis section from the view model', () => {
    const block = createFixture();
    render(<SynthesisScreen policyInsight={block} />);

    expect(screen.getByTestId('synthesis-screen-canonical')).toBeDefined();

    // Context & Recommendation
    expect(screen.getByText(/SOL\/USDC/)).toBeDefined();
    expect(screen.getByText(/Hold/)).toBeDefined();
    expect(screen.getByText(/Up market/)).toBeDefined();
    expect(screen.getByText(/Bullish/)).toBeDefined();
    expect(screen.getByText(/75%/)).toBeDefined();
    expect(screen.getByText(/Complete data/)).toBeDefined();

    // Reasoning
    expect(
      screen.getByText(
        'Market regime is UP with bullish fundamental signals. No position-specific triggers present.',
      ),
    ).toBeDefined();
    expect(screen.getByText(/Market regime is upward trending\./)).toBeDefined();
    expect(screen.getByText(/Advisory recommendation only\./)).toBeDefined();

    // 6 Families
    expect(screen.getByTestId('synthesis-family-deterministic')).toBeDefined();
    expect(screen.getByTestId('synthesis-family-supportResistance')).toBeDefined();
    expect(screen.getByTestId('synthesis-family-flows')).toBeDefined();
    expect(screen.getByTestId('synthesis-family-derivatives')).toBeDefined();
    expect(screen.getByTestId('synthesis-family-events')).toBeDefined();
    expect(screen.getByTestId('synthesis-family-newsRegulatory')).toBeDefined();

    // Warnings
    expect(screen.getByText(/Input data is stale by 120s/)).toBeDefined();

    // Selection policy metadata
    expect(screen.getByText(/Full evidence coverage/)).toBeDefined();
    expect(screen.getByText(/selector\.v1\.2026-07/)).toBeDefined();

    // References
    expect(
      screen.getByText(/abcd1234abcd5678abcd9012abcd3456abcd7890abcd1234abcd5678abcd9012/),
    ).toBeDefined();
    expect(screen.getByText(/ref3333333333333333333333333333333333/)).toBeDefined();
  });

  it('renders fallback copy for empty collections', () => {
    const emptyBlock = createFixture({
      warnings: [],
      evidence: {
        selectionStatus: 'FULL',
        selectionPolicyVersion: 'selector.v1.2026-07',
        selectedBundleRefs: [],
        selectedSourceRefs: [],
      },
    });

    render(<SynthesisScreen policyInsight={emptyBlock} />);

    expect(screen.getByText(/No active warnings/)).toBeDefined();
    expect(screen.getByText(/No selected bundles/)).toBeDefined();
    expect(screen.getByText(/No selected sources/)).toBeDefined();
  });

  it('opens evidence only when the callback exists', () => {
    const onViewEvidence = vi.fn();
    const block = createFixture();

    // Callback exists
    const { rerender } = render(
      <SynthesisScreen policyInsight={block} onViewEvidence={onViewEvidence} />,
    );
    const viewButton = screen.getByTestId('synthesis-view-evidence');
    expect(viewButton).toBeDefined();
    fireEvent.click(viewButton);
    expect(onViewEvidence).toHaveBeenCalledTimes(1);

    // Callback omitted
    rerender(<SynthesisScreen policyInsight={block} />);
    expect(screen.queryByTestId('synthesis-view-evidence')).toBeNull();
  });

  it('invokes back navigation once', () => {
    const onBack = vi.fn();
    const block = createFixture();

    render(<SynthesisScreen policyInsight={block} onBack={onBack} />);

    const backButton = screen.getByTestId('synthesis-back-button');
    expect(backButton).toBeDefined();
    fireEvent.click(backButton);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

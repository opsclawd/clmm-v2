import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { PolicyInsightBlock, PolicyInsightReasonCode } from '@clmm/application/public';
import currentPositionFixture from '../../../../schemas/regime-engine/policy-insight.v1/fixtures/valid/current-position.json' with { type: 'json' };
import { ReasonCodesExplainer } from './ReasonCodesExplainer.js';

afterEach(() => {
  cleanup();
});

const EXPECTED_REASON_CODES = [
  'ADVISORY_ONLY',
  'DATA_HARD_STALE',
  'DATA_INSUFFICIENT_SAMPLES',
  'CLMM_BREACH_LOWER',
  'CLMM_BREACH_UPPER',
  'CHURN_STAND_DOWN_ACTIVE',
  'CHURN_COOLDOWN_ACTIVE',
  'MARKET_REGIME_UP',
  'MARKET_REGIME_DOWN',
  'MARKET_REGIME_CHOP',
  'FEATURE_THRESHOLD_BREACHED',
  'CONTEXTUAL_EVIDENCE_VOTE',
  'RESEARCH_BRIEF_ANALYSIS',
  'NO_ELIGIBLE_PRICE_LEVELS',
] as const satisfies readonly PolicyInsightReasonCode[];

describe('ReasonCodesExplainer', () => {
  it('renders every policy reason code with deterministic explanatory copy', () => {
    const baseFixture = JSON.parse(
      JSON.stringify(currentPositionFixture),
    ) as unknown as PolicyInsightBlock;
    const fixture: PolicyInsightBlock = {
      ...baseFixture,
      recommendedAction: 'EXIT_TO_SOL',
      reasonCodes: [...EXPECTED_REASON_CODES],
      reasoning: 'CRITICAL_SECRET_REASONING_TEXT_THAT_MUST_NOT_BE_RENDERED',
    };

    render(<ReasonCodesExplainer policyInsight={fixture} />);

    expect(screen.getByTestId('reason-codes-explainer')).toBeDefined();
    expect(screen.getByText('Exit to SOL')).toBeDefined();

    for (const code of EXPECTED_REASON_CODES) {
      expect(screen.getByTestId(`reason-code-item-${code}`)).toBeDefined();
      expect(screen.getByTestId(`reason-code-explanation-${code}`)).toBeDefined();
    }

    expect(
      screen.getByText(
        'This recommendation is guidance only and cannot execute without your signature.',
      ),
    ).toBeDefined();
    expect(
      screen.getByText('Market data is too stale to support an active recommendation confidently.'),
    ).toBeDefined();
    expect(
      screen.getByText('There are not enough recent samples to support a stronger recommendation.'),
    ).toBeDefined();
    expect(screen.getByText('The position is below its configured price range.')).toBeDefined();
    expect(screen.getByText('The position is above its configured price range.')).toBeDefined();
    expect(
      screen.getByText('The policy is standing down to avoid repeated recommendation changes.'),
    ).toBeDefined();
    expect(
      screen.getByText('A cooldown is active before another recommendation change is allowed.'),
    ).toBeDefined();
    expect(
      screen.getByText('Deterministic market features classify the current regime as upward.'),
    ).toBeDefined();
    expect(
      screen.getByText('Deterministic market features classify the current regime as downward.'),
    ).toBeDefined();
    expect(
      screen.getByText('Deterministic market features classify the current regime as choppy.'),
    ).toBeDefined();
    expect(
      screen.getByText(
        'A monitored feature crossed a policy threshold; the exact feature is not carried by this contract.',
      ),
    ).toBeDefined();
    expect(
      screen.getByText('Selected contextual evidence influenced the policy result.'),
    ).toBeDefined();
    expect(
      screen.getByText('Selected research context influenced the policy result.'),
    ).toBeDefined();
    expect(
      screen.getByText('No eligible support or resistance levels were available to the policy.'),
    ).toBeDefined();

    expect(
      screen.queryByText('CRITICAL_SECRET_REASONING_TEXT_THAT_MUST_NOT_BE_RENDERED'),
    ).toBeNull();
  });

  it('shows insight-level selected evidence without claiming a per-reason trigger', () => {
    const baseFixture = JSON.parse(
      JSON.stringify(currentPositionFixture),
    ) as unknown as PolicyInsightBlock;
    const fixture: PolicyInsightBlock = {
      ...baseFixture,
      reasonCodes: ['MARKET_REGIME_UP'],
      evidence: {
        ...baseFixture.evidence,
        selectedSourceRefs: [
          {
            referenceId: 'ref-test-source-123',
            sourceType: 'api',
            locator: 'https://secret.locator.domain/api/v1/internal-data-source',
            observedAt: '2026-07-19T11:58:00.000Z',
          },
        ],
      },
      reasoning: 'DO_NOT_RENDER_THIS_REASONING_STRING',
    };

    render(<ReasonCodesExplainer policyInsight={fixture} />);

    expect(screen.getByText('Selected evidence for this insight')).toBeDefined();
    expect(
      screen.getByText(
        'The contract does not identify which selected feature triggered this specific reason.',
      ),
    ).toBeDefined();
    expect(screen.getByText('ref-test-source-123')).toBeDefined();
    expect(screen.getByText(/api/i)).toBeDefined();
    expect(screen.getByText(/2026-07-19T11:58:00/)).toBeDefined();

    expect(
      screen.queryByText('https://secret.locator.domain/api/v1/internal-data-source'),
    ).toBeNull();
    expect(screen.queryByText('DO_NOT_RENDER_THIS_REASONING_STRING')).toBeNull();
  });

  it('renders no selected sources state when selectedSourceRefs is empty', () => {
    const baseFixture = JSON.parse(
      JSON.stringify(currentPositionFixture),
    ) as unknown as PolicyInsightBlock;
    const fixture: PolicyInsightBlock = {
      ...baseFixture,
      evidence: {
        ...baseFixture.evidence,
        selectedSourceRefs: [],
      },
    };

    render(<ReasonCodesExplainer policyInsight={fixture} />);

    expect(screen.getByText('No selected evidence sources for this insight')).toBeDefined();
  });

  it('warns when the insight selects a different evidence run', () => {
    const baseFixture = JSON.parse(
      JSON.stringify(currentPositionFixture),
    ) as unknown as PolicyInsightBlock;
    const fixture: PolicyInsightBlock = {
      ...baseFixture,
      evidence: {
        ...baseFixture.evidence,
        selectedBundleRefs: [
          {
            bundleHash: 'abcd1234abcd5678abcd9012abcd3456abcd7890abcd1234abcd5678abcd9012',
            publisher: 'sol-usdc-clmm-intelligence',
            sourceId: 'src1111111111111111111111111111111111',
            runId: 'run-insight-999',
          },
        ],
      },
    };

    // Case 1: evidenceRunId does NOT match selectedBundleRefs[0].runId -> warning banner
    const { rerender } = render(
      <ReasonCodesExplainer policyInsight={fixture} evidenceRunId="run-evidence-111" />,
    );

    const warningElement = screen.getByTestId('bundle-mismatch-warning');
    expect(warningElement).toBeDefined();
    expect(warningElement.textContent).toContain('run-insight-999');
    expect(warningElement.textContent).toContain(
      'abcd1234abcd5678abcd9012abcd3456abcd7890abcd1234abcd5678abcd9012',
    );
    expect(warningElement.textContent).toContain('run-evidence-111');

    // Case 2: evidenceRunId DOES match selectedBundleRefs[0].runId -> no warning banner
    rerender(<ReasonCodesExplainer policyInsight={fixture} evidenceRunId="run-insight-999" />);

    expect(screen.queryByTestId('bundle-mismatch-warning')).toBeNull();
  });

  it('handles null, loading, error, and unavailable policy insight states cleanly', () => {
    // 1. Loading state
    const { rerender } = render(<ReasonCodesExplainer isLoading={true} policyInsight={null} />);
    expect(screen.getByTestId('reason-codes-explainer-loading')).toBeDefined();

    // 2. Error state
    rerender(<ReasonCodesExplainer isError={true} policyInsight={null} />);
    expect(screen.getByTestId('reason-codes-explainer-unavailable')).toBeDefined();
    expect(screen.getByText(/Policy insight unavailable/i)).toBeDefined();

    // 3. Unavailable reason state
    rerender(<ReasonCodesExplainer unavailableReason="store-unavailable" policyInsight={null} />);
    expect(screen.getByTestId('reason-codes-explainer-unavailable')).toBeDefined();
    expect(screen.getByText(/Policy insight unavailable/i)).toBeDefined();

    // 4. Null state with no flags
    rerender(<ReasonCodesExplainer policyInsight={null} />);
    expect(screen.queryByTestId('reason-codes-explainer-card')).toBeNull();
  });
});

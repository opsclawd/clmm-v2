import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import deterministicOnlyFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/deterministic-only.json' with { type: 'json' };
import currentPositionFixture from '../../../../schemas/regime-engine/policy-insight.v1/fixtures/valid/current-position.json' with { type: 'json' };
import type {
  EvidenceBundle,
  EvidenceUnavailableReason,
  PolicyInsightBlock,
} from '@clmm/application/public';
import { EvidenceScreen } from './EvidenceScreen.js';

afterEach(() => {
  cleanup();
});

const FIXED_NOW = Date.parse('2024-01-15T10:30:00.000Z');

describe('EvidenceScreen', () => {
  it('renders one screen state at a time with populated pair-scope risk evidence', () => {
    const onBack = vi.fn();

    // 1. Loading state
    const { rerender } = render(
      <EvidenceScreen isLoading={true} evidence={null} now={FIXED_NOW} onBack={onBack} />,
    );
    expect(screen.getByTestId('evidence-screen-loading')).toBeDefined();
    expect(screen.queryByTestId('evidence-screen-error')).toBeNull();
    expect(screen.queryByTestId('evidence-screen-unavailable')).toBeNull();
    expect(screen.queryByTestId('evidence-screen-canonical')).toBeNull();

    // 2. Transport error state
    rerender(
      <EvidenceScreen
        isLoading={false}
        isError={true}
        evidence={null}
        now={FIXED_NOW}
        onBack={onBack}
      />,
    );
    expect(screen.getByTestId('evidence-screen-error')).toBeDefined();
    expect(screen.queryByTestId('evidence-screen-loading')).toBeNull();
    expect(screen.queryByTestId('evidence-screen-unavailable')).toBeNull();
    expect(screen.queryByTestId('evidence-screen-canonical')).toBeNull();

    // 3. Unavailable reason states
    const reasons: EvidenceUnavailableReason[] = [
      'not-found',
      'store-unavailable',
      'config-error',
      'upstream-error',
      'malformed',
    ];

    for (const reason of reasons) {
      rerender(
        <EvidenceScreen
          isLoading={false}
          isError={false}
          unavailableReason={reason}
          evidence={null}
          now={FIXED_NOW}
          onBack={onBack}
        />,
      );
      expect(screen.getByTestId('evidence-screen-unavailable')).toBeDefined();
      expect(screen.queryByTestId('evidence-screen-loading')).toBeNull();
      expect(screen.queryByTestId('evidence-screen-error')).toBeNull();
      expect(screen.queryByTestId('evidence-screen-canonical')).toBeNull();
    }

    // 4. Canonical data state
    const bundle = JSON.parse(
      JSON.stringify(deterministicOnlyFixture),
    ) as unknown as EvidenceBundle;
    bundle.deterministicFeatures.push(
      {
        featureId: 'basis_spread_bps',
        family: 'risk',
        featureKind: 'number',
        status: 'available',
        value: 64,
        unit: 'basis_points',
        observedAt: '2024-01-15T10:00:00.000Z',
        freshUntil: '2024-01-15T11:00:00.000Z',
        confidenceBps: 9500,
        calculator: { name: 'basis-spread', version: '1.0.0' },
        inputLineage: ['ref-price-source'],
        warnings: [],
      },
      {
        featureId: 'liquidation_cluster_1h',
        family: 'risk',
        featureKind: 'number',
        status: 'available',
        value: 0,
        unit: 'count',
        observedAt: '2024-01-15T10:00:00.000Z',
        freshUntil: '2024-01-15T11:00:00.000Z',
        confidenceBps: 9500,
        calculator: { name: 'liquidation-cluster', version: '1.0.0' },
        inputLineage: ['ref-price-source'],
        warnings: [],
      },
    );
    rerender(
      <EvidenceScreen
        isLoading={false}
        isError={false}
        evidence={bundle}
        now={FIXED_NOW}
        onBack={onBack}
      />,
    );
    expect(screen.getByTestId('evidence-screen-canonical')).toBeDefined();
    expect(screen.queryByTestId('evidence-screen-loading')).toBeNull();
    expect(screen.queryByTestId('evidence-screen-error')).toBeNull();
    expect(screen.queryByTestId('evidence-screen-unavailable')).toBeNull();

    // Assert last-collected label in canonical state
    expect(screen.getByText(/Last collected/i)).toBeDefined();

    const expectedHeadings = [
      'Market state',
      'Risk',
      'Support & resistance',
      'Flows',
      'Derivatives',
      'Events',
      'News & regulatory',
    ];

    for (const heading of expectedHeadings) {
      expect(screen.getByText(heading)).toBeDefined();
    }

    expect(screen.queryByText('Price quality')).toBeNull();
    expect(screen.queryByText('CLMM economics')).toBeNull();
    expect(screen.queryByText('Position state')).toBeNull();
    expect(screen.queryByText('Liquidity')).toBeNull();
    expect(screen.getByText('basis_spread_bps')).toBeDefined();
    expect(screen.getByText('64 basis_points')).toBeDefined();
    expect(screen.getByText('liquidation_cluster_1h')).toBeDefined();
    expect(screen.getByText('0 count')).toBeDefined();

    // 5. Back callback
    const backButton = screen.getByTestId('evidence-back-button');
    fireEvent.click(backButton);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders range location and bound distances from a position-scoped bundle', () => {
    const bundle = JSON.parse(
      JSON.stringify(deterministicOnlyFixture),
    ) as unknown as EvidenceBundle;
    bundle.scope = {
      kind: 'position',
      network: 'solana-mainnet',
      walletAddress: 'wallet-address',
      whirlpoolAddress: 'whirlpool-address',
      positionId: 'position-address',
    };
    bundle.deterministicFeatures.push(
      {
        featureId: 'feat-range_location-15256',
        family: 'position_state',
        featureKind: 'number',
        status: 'available',
        value: 0,
        unit: 'ratio',
        observedAt: '2024-01-15T10:00:00.000Z',
        freshUntil: '2024-01-15T11:00:00.000Z',
        confidenceBps: 9500,
        calculator: { name: 'range-location', version: '1.0.0' },
        inputLineage: ['ref-price-source'],
        warnings: [],
      },
      {
        featureId: 'feat-distance_to_lower-15257',
        family: 'position_state',
        featureKind: 'number',
        status: 'available',
        value: -17327,
        unit: 'count',
        observedAt: '2024-01-15T10:00:00.000Z',
        freshUntil: '2024-01-15T11:00:00.000Z',
        confidenceBps: 9500,
        calculator: { name: 'distance-to-lower', version: '1.0.0' },
        inputLineage: ['ref-price-source'],
        warnings: [],
      },
      {
        featureId: 'feat-distance_to_upper-15258',
        family: 'position_state',
        featureKind: 'number',
        status: 'available',
        value: 24161,
        unit: 'count',
        observedAt: '2024-01-15T10:00:00.000Z',
        freshUntil: '2024-01-15T11:00:00.000Z',
        confidenceBps: 9500,
        calculator: { name: 'distance-to-upper', version: '1.0.0' },
        inputLineage: ['ref-price-source'],
        warnings: [],
      },
    );

    render(<EvidenceScreen evidence={bundle} now={FIXED_NOW} />);

    expect(screen.getByText('Position state')).toBeDefined();
    expect(screen.getByText('feat-range_location-15256')).toBeDefined();
    expect(screen.getByText('feat-distance_to_lower-15257')).toBeDefined();
    expect(screen.getByText('feat-distance_to_upper-15258')).toBeDefined();
    expect(screen.getByText('0 ratio')).toBeDefined();
    expect(screen.getByText('-17327 count')).toBeDefined();
    expect(screen.getByText('24161 count')).toBeDefined();
  });

  it('renders associated warnings inside family cards and only unmatched warnings in the screen fallback', () => {
    const bundle = JSON.parse(
      JSON.stringify(deterministicOnlyFixture),
    ) as unknown as EvidenceBundle;
    bundle.assessment.warnings = [
      {
        code: 'WARN_MARKET',
        message: 'Market state warning',
        affectedFamilies: ['market_state'],
      },
      {
        code: 'WARN_SUPPRES',
        message: 'Support resistance warning',
        affectedFamilies: ['supportResistance'],
      },
      {
        code: 'WARN_MIXED',
        message: 'Mixed warning',
        affectedFamilies: ['market_state', 'unknown_target'],
      },
      {
        code: 'WARN_UNKNOWN',
        message: 'Unknown target warning',
        affectedFamilies: ['unknown_target_only'],
      },
    ];

    render(<EvidenceScreen evidence={bundle} now={FIXED_NOW} />);

    const marketStateCard = screen.getByTestId('evidence-family-card-market_state');
    expect(marketStateCard).toBeDefined();
    expect(marketStateCard.textContent).toContain('Market state warning');
    expect(marketStateCard.textContent).toContain('Mixed warning');

    const supportResistanceCard = screen.getByTestId('evidence-family-card-supportResistance');
    expect(supportResistanceCard).toBeDefined();
    expect(supportResistanceCard.textContent).toContain('Support resistance warning');

    const fallbackBox = screen.getByTestId('evidence-general-warnings');
    expect(fallbackBox).toBeDefined();
    expect(fallbackBox.textContent).toContain('Unknown target warning');
    expect(fallbackBox.textContent).not.toContain('Market state warning');
    expect(fallbackBox.textContent).not.toContain('Support resistance warning');
    expect(fallbackBox.textContent).not.toContain('Mixed warning');
  });

  it('expands a deterministic feature to explain a canonical bundle derivation end to end', () => {
    const bundle = JSON.parse(
      JSON.stringify(deterministicOnlyFixture),
    ) as unknown as EvidenceBundle;

    const hash1 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const hash2 = '1123456789abcdef1123456789abcdef1123456789abcdef1123456789abcdef';

    bundle.sourceReferences = [
      {
        referenceId: 'ref-1',
        sourceType: 'api',
        locator: hash1,
        publishedAt: null,
        observedAt: '2024-01-15T09:59:00.000Z',
        contentHash: null,
      },
      {
        referenceId: 'ref-2',
        sourceType: 'api',
        locator: hash2,
        publishedAt: null,
        observedAt: '2024-01-15T11:00:00.000Z',
        contentHash: null,
      },
    ];

    bundle.deterministicFeatures = [
      {
        featureId: 'feat-price-001',
        family: 'market_state',
        featureKind: 'number',
        status: 'available',
        value: 150.25,
        unit: 'usd',
        observedAt: '2024-01-15T10:00:00.000Z',
        freshUntil: '2024-01-15T11:00:00.000Z',
        confidenceBps: 9500,
        calculator: {
          name: 'price-aggregator',
          version: '1.0.0',
        },
        inputLineage: ['ref-1', 'ref-2'],
        warnings: [],
      },
    ];

    render(<EvidenceScreen evidence={bundle} now={FIXED_NOW} />);

    const toggleButton = screen.getByTestId('evidence-derivation-toggle-feat-price-001');
    fireEvent.click(toggleButton);

    const expectedExplanation =
      'feat-price-001 = 150.25 usd, from 2 observations spanning 61 minutes, computed by price-aggregator v1.0.0, observed 2024-01-15T10:00:00Z, fresh until 2024-01-15T11:00:00Z.';

    expect(screen.getByText(expectedExplanation)).toBeDefined();
    expect(screen.getByText('ref-1')).toBeDefined();
    expect(screen.getByText('ref-2')).toBeDefined();
    expect(screen.queryByText(hash1)).toBeNull();
    expect(screen.queryByText(hash2)).toBeNull();
    expect(screen.queryAllByRole('link')).toEqual([]);
  });

  it('keeps evidence visible when the policy insight query is unavailable', () => {
    const bundle = JSON.parse(
      JSON.stringify(deterministicOnlyFixture),
    ) as unknown as EvidenceBundle;

    render(
      <EvidenceScreen
        evidence={bundle}
        now={FIXED_NOW}
        policyInsight={null}
        isPolicyInsightError={true}
        policyInsightUnavailableReason="store-unavailable"
      />,
    );

    expect(screen.getByTestId('evidence-screen-canonical')).toBeDefined();
    expect(screen.getByText('Market state')).toBeDefined();
    expect(screen.getByTestId('reason-codes-explainer-unavailable')).toBeDefined();
  });

  it('renders ReasonCodesExplainer when policy insight is provided and omits raw reasoning', () => {
    const bundle = JSON.parse(
      JSON.stringify(deterministicOnlyFixture),
    ) as unknown as EvidenceBundle;
    const policyInsight = JSON.parse(
      JSON.stringify(currentPositionFixture),
    ) as unknown as PolicyInsightBlock;
    policyInsight.reasoning = 'SECRET_DEGRADED_REASONING_STRING_DO_NOT_RENDER';

    render(<EvidenceScreen evidence={bundle} now={FIXED_NOW} policyInsight={policyInsight} />);

    expect(screen.getByTestId('evidence-screen-canonical')).toBeDefined();
    expect(screen.getByTestId('reason-codes-explainer')).toBeDefined();
    expect(screen.getByText('Market state')).toBeDefined();
    expect(screen.queryByText('SECRET_DEGRADED_REASONING_STRING_DO_NOT_RENDER')).toBeNull();
  });

  it('passes the current insight selected source references into family contribution state', () => {
    const bundle = JSON.parse(
      JSON.stringify(deterministicOnlyFixture),
    ) as unknown as EvidenceBundle;
    const policyInsight = JSON.parse(
      JSON.stringify(currentPositionFixture),
    ) as unknown as PolicyInsightBlock;
    policyInsight.evidence.selectedBundleRefs = policyInsight.evidence.selectedBundleRefs.map(
      (reference, index) => (index === 0 ? { ...reference, runId: bundle.runId } : reference),
    );
    policyInsight.evidence.selectedSourceRefs = [
      {
        referenceId: 'ref-price-source',
        sourceType: 'api',
        locator: 'a'.repeat(64),
        observedAt: '2024-01-15T10:00:00.000Z',
      },
    ];

    render(<EvidenceScreen evidence={bundle} now={FIXED_NOW} policyInsight={policyInsight} />);

    expect(screen.getByTestId('evidence-family-card-market_state').textContent).toContain(
      'Contributed',
    );
    expect(screen.getByTestId('evidence-family-card-flows').textContent).not.toContain(
      'Contributed',
    );
  });

  it('renders the pipeline explainer after policy reasons and before family cards', () => {
    const bundle = JSON.parse(
      JSON.stringify(deterministicOnlyFixture),
    ) as unknown as EvidenceBundle;
    const policyInsight = JSON.parse(
      JSON.stringify(currentPositionFixture),
    ) as unknown as PolicyInsightBlock;

    const { container } = render(
      <EvidenceScreen evidence={bundle} now={FIXED_NOW} policyInsight={policyInsight} />,
    );
    const text = container.textContent ?? '';
    const policyIndex = text.indexOf('Policy Recommendation');
    const pipelineIndex = text.indexOf('How evidence becomes policy');
    const familyIndex = text.indexOf('Market state');

    expect(policyIndex).toBeGreaterThanOrEqual(0);
    expect(pipelineIndex).toBeGreaterThan(policyIndex);
    expect(familyIndex).toBeGreaterThan(pipelineIndex);
  });
});

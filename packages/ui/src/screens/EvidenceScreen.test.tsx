import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import deterministicOnlyFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/deterministic-only.json' with { type: 'json' };
import type { EvidenceBundle, EvidenceUnavailableReason } from '@clmm/application/public';
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

  it('renders the raw telemetry slot after all evidence family cards in the canonical state', () => {
    const bundle = JSON.parse(
      JSON.stringify(deterministicOnlyFixture),
    ) as unknown as EvidenceBundle;
    const rawTelemetrySlot = <div data-testid="raw-telemetry-slot">raw telemetry</div>;
    render(
      <EvidenceScreen evidence={bundle} now={FIXED_NOW} rawTelemetrySlot={rawTelemetrySlot} />,
    );

    const slot = screen.getByTestId('raw-telemetry-slot');
    const familyCards = screen.getAllByTestId(/^evidence-family-card-/);
    expect(familyCards.length).toBeGreaterThan(0);
    expect(
      (familyCards.at(-1)?.compareDocumentPosition(slot) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('does not render a raw telemetry slot in loading error or unavailable screen states', () => {
    const rawTelemetrySlot = <div data-testid="raw-telemetry-slot">raw telemetry</div>;

    // Loading state
    const { rerender } = render(
      <EvidenceScreen
        isLoading={true}
        evidence={null}
        now={FIXED_NOW}
        rawTelemetrySlot={rawTelemetrySlot}
      />,
    );
    expect(screen.queryByTestId('raw-telemetry-slot')).toBeNull();

    // Transport error state
    rerender(
      <EvidenceScreen
        isLoading={false}
        isError={true}
        evidence={null}
        now={FIXED_NOW}
        rawTelemetrySlot={rawTelemetrySlot}
      />,
    );
    expect(screen.queryByTestId('raw-telemetry-slot')).toBeNull();

    // Unavailable state
    rerender(
      <EvidenceScreen
        isLoading={false}
        isError={false}
        unavailableReason="not-found"
        evidence={null}
        now={FIXED_NOW}
        rawTelemetrySlot={rawTelemetrySlot}
      />,
    );
    expect(screen.queryByTestId('raw-telemetry-slot')).toBeNull();
  });
});

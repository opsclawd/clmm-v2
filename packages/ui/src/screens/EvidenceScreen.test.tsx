import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import contextualFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/contextual.json' with { type: 'json' };
import type { EvidenceBundle, EvidenceUnavailableReason } from '@clmm/application/public';
import { EvidenceScreen } from './EvidenceScreen.js';

afterEach(() => {
  cleanup();
});

const FIXED_NOW = Date.parse('2024-01-15T10:30:00.000Z');

describe('EvidenceScreen', () => {
  it('renders one screen state at a time', () => {
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
    const bundle = contextualFixture as unknown as EvidenceBundle;
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

    // Assert all ten card headings
    const expectedHeadings = [
      'Market state',
      'Price quality',
      'CLMM economics',
      'Position state',
      'Liquidity',
      'Support & resistance',
      'Flows',
      'Derivatives',
      'Events',
      'News & regulatory',
    ];

    for (const heading of expectedHeadings) {
      expect(screen.getByText(heading)).toBeDefined();
    }

    // 5. Back callback
    const backButton = screen.getByTestId('evidence-back-button');
    fireEvent.click(backButton);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

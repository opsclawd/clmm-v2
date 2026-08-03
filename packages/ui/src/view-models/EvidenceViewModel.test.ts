import { describe, expect, it } from 'vitest';
import contextualFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/contextual.json' with { type: 'json' };
import deterministicOnlyFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/deterministic-only.json' with { type: 'json' };
import type { EvidenceBundle } from '@clmm/application/public';
import { buildEvidenceViewModel } from './EvidenceViewModel.js';

describe('buildEvidenceViewModel', () => {
  const FIXED_NOW = Date.parse('2024-01-15T10:30:00.000Z');

  it('projects all evidence families in canonical order', () => {
    const bundle = contextualFixture as unknown as EvidenceBundle;
    const vm = buildEvidenceViewModel(bundle, FIXED_NOW);

    expect(vm.cards).toHaveLength(10);
    const expectedIds = [
      'market_state',
      'price_quality',
      'clmm_economics',
      'position_state',
      'liquidity',
      'supportResistance',
      'flows',
      'derivatives',
      'events',
      'newsRegulatory',
    ];
    expect(vm.cards.map((card) => card.id)).toEqual(expectedIds);
  });

  it('preserves unavailable families instead of dropping them', () => {
    const bundle = deterministicOnlyFixture as unknown as EvidenceBundle;
    const vm = buildEvidenceViewModel(bundle, FIXED_NOW);

    expect(vm.cards).toHaveLength(10);

    const srCard = vm.cards.find((c) => c.id === 'supportResistance');
    expect(srCard).toBeDefined();
    expect(srCard?.availability).toBe('unavailable');
    expect(srCard?.claims).toEqual([]);
    expect(srCard?.rows.some((r) => r.value === '—')).toBe(true);

    const pqCard = vm.cards.find((c) => c.id === 'price_quality');
    expect(pqCard).toBeDefined();
    expect(pqCard?.availability).toBe('unavailable');
    expect(pqCard?.rows.some((r) => r.value === '—')).toBe(true);
  });

  it('marks stale evidence from canonical timestamps', () => {
    const bundle = contextualFixture as unknown as EvidenceBundle;

    // Fresh scenario (FIXED_NOW = 10:30, freshUntil = 11:00)
    const freshVm = buildEvidenceViewModel(bundle, FIXED_NOW);
    expect(freshVm.isStale).toBe(false);

    // Stale scenario (STALE_NOW = 11:30, after freshUntil 11:00)
    const STALE_NOW = Date.parse('2024-01-15T11:30:00.000Z');
    const staleVm = buildEvidenceViewModel(bundle, STALE_NOW);
    expect(staleVm.isStale).toBe(true);

    // Expired claim scenario
    const EXPIRED_NOW = Date.parse('2024-01-15T12:30:00.000Z');
    const expiredVm = buildEvidenceViewModel(bundle, EXPIRED_NOW);
    expect(expiredVm.isStale).toBe(true);
    const srCard = expiredVm.cards.find((c) => c.id === 'supportResistance');
    expect(srCard?.stale).toBe(true);
  });

  it('renders contextual claims without deriving policy', () => {
    const bundle = contextualFixture as unknown as EvidenceBundle;
    const vm = buildEvidenceViewModel(bundle, FIXED_NOW);

    const srCard = vm.cards.find((c) => c.id === 'supportResistance');
    expect(srCard).toBeDefined();
    expect(srCard?.claims).toHaveLength(1);

    const claim = srCard?.claims[0];
    expect(claim).toBeDefined();
    expect(claim?.claim).toBe('Strong support at 148.50');
    expect(claim?.direction).toBe('bullish');
    expect(claim?.confidenceLabel).toBe('75%');
    expect(claim?.observedAtLabel).toBe('2024-01-15T09:30:00Z');
    expect(claim?.expiresAtLabel).toBe('2024-01-15T12:00:00Z');

    // Confirm no policy derivation fields exist on card or claim
    expect(srCard).not.toHaveProperty('posture');
    expect(srCard).not.toHaveProperty('recommendation');
    expect(srCard).not.toHaveProperty('swapDirection');
    expect(claim).not.toHaveProperty('posture');
    expect(claim).not.toHaveProperty('recommendation');
  });

  it('formats last-collected timestamp accurately', () => {
    const bundle = contextualFixture as unknown as EvidenceBundle;
    const vm = buildEvidenceViewModel(bundle, FIXED_NOW);

    expect(vm.lastCollectedLabel).toBe('2024-01-15T10:00:00Z');
  });

  it('projects deterministic feature groups into card rows', () => {
    const bundle = contextualFixture as unknown as EvidenceBundle;
    const vm = buildEvidenceViewModel(bundle, FIXED_NOW);

    const msCard = vm.cards.find((c) => c.id === 'market_state');
    expect(msCard).toBeDefined();
    expect(msCard?.availability).toBe('available');
    expect(msCard?.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'feat-price-001', value: '150.25 usd' }),
      ]),
    );

    const liqCard = vm.cards.find((c) => c.id === 'liquidity');
    expect(liqCard).toBeDefined();
    expect(liqCard?.availability).toBe('available');
    expect(liqCard?.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'feat-vol-001', value: '1000000 usd' }),
      ]),
    );
  });

  it('formats confidence bounds as percentage', () => {
    const bundle = contextualFixture as unknown as EvidenceBundle;
    const vm = buildEvidenceViewModel(bundle, FIXED_NOW);

    expect(vm.overallConfidenceLabel).toBe('75%');
  });

  it('handles null expiry dates gracefully', () => {
    const bundle = contextualFixture as unknown as EvidenceBundle;
    const vm = buildEvidenceViewModel(bundle, FIXED_NOW);

    const eventCard = vm.cards.find((c) => c.id === 'events');
    expect(eventCard).toBeDefined();
    expect(eventCard?.claims[0]?.expiresAtLabel).toBe('—');
  });

  it('projects research brief when available', () => {
    const bundle = contextualFixture as unknown as EvidenceBundle;
    const vm = buildEvidenceViewModel(bundle, FIXED_NOW);

    expect(vm.brief).toEqual({
      summary: 'Analysis suggests bullish sentiment with strong support levels',
      keyFindings: [
        'Support zone at 148.50 holding',
        'Net buying pressure detected',
        'Funding rate remains positive',
      ],
      uncertainties: ['Potential resistance at 155.00', 'Macroeconomic factors unclear'],
      modelLabel: 'openai / gpt-4 (v1.0.0)',
    });
  });
});

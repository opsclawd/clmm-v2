import { describe, expect, it } from 'vitest';
import type { EvidenceBundle } from '@clmm/application/public';
import deterministicOnlyFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/deterministic-only.json' with { type: 'json' };
import contextualFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/contextual.json' with { type: 'json' };
import { buildEvidenceViewModel } from './EvidenceViewModel.js';

const FIXED_NOW = Date.parse('2024-01-15T10:30:00.000Z');

function cloneBundle(fixture: unknown): EvidenceBundle {
  return JSON.parse(JSON.stringify(fixture)) as EvidenceBundle;
}

describe('buildEvidenceViewModel contribution', () => {
  it('marks only deterministic families whose feature lineage intersects selected source references as contributed', () => {
    const vm = buildEvidenceViewModel(
      cloneBundle(deterministicOnlyFixture),
      FIXED_NOW,
      new Set(['ref-price-source', 'unrelated-reference']),
    );

    expect(vm.cards.find((card) => card.id === 'market_state')?.contributed).toBe(true);
    expect(
      vm.cards.filter((card) => card.id !== 'market_state').every((card) => !card.contributed),
    ).toBe(true);
  });

  it('marks only contextual families whose claim sources intersect selected source references as contributed', () => {
    const vm = buildEvidenceViewModel(
      cloneBundle(contextualFixture),
      FIXED_NOW,
      new Set(['ref-tx-001', 'unrelated-reference']),
    );

    expect(vm.cards.find((card) => card.id === 'flows')?.contributed).toBe(true);
    expect(vm.cards.find((card) => card.id === 'supportResistance')?.contributed).toBe(false);
    expect(vm.cards.find((card) => card.id === 'market_state')?.contributed).toBe(false);
  });

  it('treats missing or empty selected source references as merely available rather than erroneous', () => {
    const bundle = cloneBundle(deterministicOnlyFixture);
    const withoutSelection = buildEvidenceViewModel(bundle, FIXED_NOW);
    const withEmptySelection = buildEvidenceViewModel(bundle, FIXED_NOW, new Set());

    expect(withoutSelection.cards.every((card) => !card.contributed)).toBe(true);
    expect(withEmptySelection.cards.every((card) => !card.contributed)).toBe(true);
    expect(withoutSelection.cards.find((card) => card.id === 'market_state')?.availability).toBe(
      'available',
    );
  });
});

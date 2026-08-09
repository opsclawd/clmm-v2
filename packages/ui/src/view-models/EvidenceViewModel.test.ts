import { describe, expect, it } from 'vitest';
import contextualFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/contextual.json' with { type: 'json' };
import deterministicOnlyFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/deterministic-only.json' with { type: 'json' };
import type { EvidenceBundle } from '@clmm/application/public';
import { buildEvidenceViewModel, formatLastCollectedLabel } from './EvidenceViewModel.js';

describe('buildEvidenceViewModel', () => {
  const FIXED_NOW = Date.parse('2024-01-15T10:30:00.000Z');

  it('renders only populated deterministic families in canonical order, including risk', () => {
    const bundle = JSON.parse(JSON.stringify(contextualFixture)) as unknown as EvidenceBundle;
    bundle.deterministicFeatures.push({
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
    });

    const vm = buildEvidenceViewModel(bundle, FIXED_NOW);

    expect(vm.cards.map((card) => card.id)).toEqual([
      'market_state',
      'liquidity',
      'risk',
      'supportResistance',
      'flows',
      'derivatives',
      'events',
      'newsRegulatory',
    ]);
    expect(vm.cards.find((card) => card.id === 'risk')).toMatchObject({
      title: 'Risk',
      availability: 'available',
      rows: [{ label: 'basis_spread_bps', value: '64 basis_points' }],
    });
  });

  it('omits empty deterministic families but preserves unavailable contextual families', () => {
    const bundle = deterministicOnlyFixture as unknown as EvidenceBundle;
    const vm = buildEvidenceViewModel(bundle, FIXED_NOW);

    expect(vm.cards.map((card) => card.id)).toEqual([
      'market_state',
      'supportResistance',
      'flows',
      'derivatives',
      'events',
      'newsRegulatory',
    ]);
    expect(vm.cards.find((card) => card.id === 'clmm_economics')).toBeUndefined();
    expect(vm.cards.find((card) => card.id === 'position_state')).toBeUndefined();

    const srCard = vm.cards.find((card) => card.id === 'supportResistance');
    expect(srCard).toMatchObject({
      availability: 'liveness_unknown',
      claims: [],
      rows: [{ label: 'Claims', value: '—' }],
    });
  });

  it('renders a populated all-unavailable risk family as unavailable', () => {
    const bundle = JSON.parse(
      JSON.stringify(deterministicOnlyFixture),
    ) as unknown as EvidenceBundle;
    bundle.deterministicFeatures = [
      {
        featureId: 'oi_trend_4h',
        family: 'risk',
        featureKind: 'number',
        status: 'unavailable',
        value: null,
        unit: null,
        observedAt: null,
        freshUntil: null,
        confidenceBps: 0,
        calculator: { name: 'oi-trend', version: '1.0.0' },
        inputLineage: [],
        warnings: ['source unavailable'],
      },
      {
        featureId: 'funding_rate_annualized',
        family: 'risk',
        featureKind: 'number',
        status: 'unavailable',
        value: null,
        unit: null,
        observedAt: null,
        freshUntil: null,
        confidenceBps: 0,
        calculator: { name: 'funding-rate', version: '1.0.0' },
        inputLineage: [],
        warnings: ['source unavailable'],
      },
    ];

    const vm = buildEvidenceViewModel(bundle, FIXED_NOW);
    const riskCard = vm.cards.find((card) => card.id === 'risk');

    expect(riskCard).toMatchObject({
      title: 'Risk',
      availability: 'liveness_unknown',
      freshnessLabel: 'Fresh',
      stale: false,
      rows: [
        { label: 'oi_trend_4h', value: '—' },
        { label: 'funding_rate_annualized', value: '—' },
      ],
      claims: [],
    });
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

  it('does not mark card as stale when deterministic feature is unavailable or invalid unless expired', () => {
    const bundle = JSON.parse(
      JSON.stringify(deterministicOnlyFixture),
    ) as unknown as EvidenceBundle;
    bundle.deterministicFeatures[0]!.status = 'unavailable';
    const vm = buildEvidenceViewModel(bundle, FIXED_NOW);
    const msCard = vm.cards.find((c) => c.id === 'market_state');
    expect(msCard?.availability).toBe('liveness_unknown');
    expect(msCard?.stale).toBe(false);
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

  it('suppresses lastCollectedLabel for contextual families when availability is available', () => {
    const bundle = JSON.parse(JSON.stringify(contextualFixture)) as unknown as EvidenceBundle;
    bundle.assessment.coverage.supportResistance = 'available';
    bundle.assessment.liveness = {
      supportResistance: { isConfigured: true, lastCollectedAt: '2024-01-15T10:00:00.000Z' },
    };
    const vm = buildEvidenceViewModel(bundle, FIXED_NOW);
    const srCard = vm.cards.find((c) => c.id === 'supportResistance');
    expect(srCard?.availability).toBe('available');
    expect(srCard?.lastCollectedLabel).toBeNull();

    bundle.contextualEvidence.supportResistance = [];
    const vmEmpty = buildEvidenceViewModel(bundle, FIXED_NOW);
    const srCardEmpty = vmEmpty.cards.find((c) => c.id === 'supportResistance');
    expect(srCardEmpty?.availability).toBe('available');
    expect(srCardEmpty?.lastCollectedLabel).toBeNull();
  });

  it('classifies unavailable family as collection_stopped if lastCollectedAt is unparseable (NaN)', () => {
    const bundle = JSON.parse(JSON.stringify(contextualFixture)) as unknown as EvidenceBundle;
    bundle.assessment.coverage.supportResistance = 'unavailable';
    bundle.assessment.liveness = {
      supportResistance: { isConfigured: true, lastCollectedAt: 'invalid-date-string' },
    };
    const vm = buildEvidenceViewModel(bundle, FIXED_NOW);
    const srCard = vm.cards.find((c) => c.id === 'supportResistance');
    expect(srCard?.availability).toBe('collection_stopped');
  });

  it('formats last-collected timestamp accurately', () => {
    const bundle = contextualFixture as unknown as EvidenceBundle;
    const vm = buildEvidenceViewModel(bundle, FIXED_NOW);

    expect(vm.lastCollectedLabel).toBe('2024-01-15T10:00:00Z');
  });

  it('selects latest observation timestamp when observations occur before bundle.asOf', () => {
    const bundle = JSON.parse(JSON.stringify(contextualFixture)) as unknown as EvidenceBundle;
    bundle.asOf = '2024-01-15T10:00:00.000Z';
    for (const f of bundle.deterministicFeatures) {
      if (f.observedAt) f.observedAt = '2024-01-15T09:55:00.000Z';
    }
    for (const s of bundle.sourceReferences) {
      if (s.observedAt) s.observedAt = '2024-01-15T09:50:00.000Z';
    }
    if (bundle.contextualEvidence) {
      const categories = [
        bundle.contextualEvidence.supportResistance,
        bundle.contextualEvidence.flows,
        bundle.contextualEvidence.derivatives,
        bundle.contextualEvidence.events,
        bundle.contextualEvidence.newsRegulatory,
      ];
      for (const claims of categories) {
        if (Array.isArray(claims)) {
          for (const claim of claims) {
            if (claim.observedAt) {
              (claim as { observedAt: string }).observedAt = '2024-01-15T09:40:00.000Z';
            }
          }
        }
      }
    }

    const vm = buildEvidenceViewModel(bundle, FIXED_NOW);
    expect(vm.lastCollectedLabel).toBe('2024-01-15T09:55:00Z');
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

  it('projects derivation breadth, lineage timestamps, calculator, and per-feature freshness', () => {
    const bundle = JSON.parse(
      JSON.stringify(deterministicOnlyFixture),
    ) as unknown as EvidenceBundle;
    const HASH_A = 'a'.repeat(64);
    const HASH_B = 'b'.repeat(64);

    bundle.sourceReferences = [
      {
        referenceId: 'ref-a',
        sourceType: 'api',
        locator: HASH_A,
        publishedAt: null,
        observedAt: '2024-01-15T03:59:00.000Z',
        contentHash: null,
      },
      {
        referenceId: 'ref-b',
        sourceType: 'api',
        locator: HASH_B,
        publishedAt: null,
        observedAt: '2024-01-15T05:00:00.000Z',
        contentHash: null,
      },
    ];

    bundle.deterministicFeatures = [
      {
        featureId: 'realized_volatility_1h',
        family: 'market_state',
        featureKind: 'number',
        status: 'available',
        value: 19,
        unit: 'basis_points',
        observedAt: '2024-01-15T05:00:00.000Z',
        freshUntil: '2024-01-15T05:03:00.000Z',
        confidenceBps: 9500,
        calculator: {
          name: 'mvp-calculator',
          version: '1.0',
        },
        inputLineage: ['ref-a', 'ref-b'],
        warnings: [],
      },
    ];

    const NOW = Date.parse('2024-01-15T05:01:00.000Z');
    const vm = buildEvidenceViewModel(bundle, NOW);
    const card = vm.cards.find((c) => c.id === 'market_state');
    const row = card?.rows.find((r) => r.label === 'realized_volatility_1h');

    expect(row).toMatchObject({
      label: 'realized_volatility_1h',
      value: '19 basis_points',
      warnings: [],
      derivation: {
        inputCount: 2,
        timeSpanLabel: '61 minutes',
        calculatorLabel: 'mvp-calculator v1.0',
        observedAtLabel: '2024-01-15T05:00:00Z',
        freshUntilLabel: '2024-01-15T05:03:00Z',
        isStale: false,
        inputs: [
          {
            referenceId: 'ref-a',
            sourceTypeLabel: 'API',
            observedAtLabel: '2024-01-15T03:59:00Z',
            isResolved: true,
          },
          {
            referenceId: 'ref-b',
            sourceTypeLabel: 'API',
            observedAtLabel: '2024-01-15T05:00:00Z',
            isResolved: true,
          },
        ],
      },
    });
  });

  it('uses safe derivation fallbacks for empty or unparseable matched lineage timestamps', () => {
    const bundle = JSON.parse(
      JSON.stringify(deterministicOnlyFixture),
    ) as unknown as EvidenceBundle;
    bundle.sourceReferences = [
      {
        referenceId: 'ref-unparseable',
        sourceType: 'api',
        locator: 'https://example.com/unparseable',
        publishedAt: null,
        observedAt: 'not-a-date',
        contentHash: null,
      },
      {
        referenceId: 'ref-valid-1',
        sourceType: 'api',
        locator: 'https://example.com/valid1',
        publishedAt: null,
        observedAt: '2024-01-15T05:00:00.000Z',
        contentHash: null,
      },
      {
        referenceId: 'ref-valid-2',
        sourceType: 'api',
        locator: 'https://example.com/valid2',
        publishedAt: null,
        observedAt: '2024-01-15T05:00:00.000Z',
        contentHash: null,
      },
    ];

    bundle.deterministicFeatures = [
      {
        featureId: 'feat_empty_lineage',
        family: 'market_state',
        featureKind: 'number',
        status: 'available',
        value: 10,
        unit: 'usd',
        observedAt: '2024-01-15T05:00:00.000Z',
        freshUntil: '2024-01-15T05:10:00.000Z',
        confidenceBps: 9000,
        calculator: { name: 'calc', version: '1.0.0' },
        inputLineage: [],
        warnings: [],
      },
      {
        featureId: 'feat_unresolved_ref',
        family: 'market_state',
        featureKind: 'number',
        status: 'available',
        value: 20,
        unit: 'usd',
        observedAt: '2024-01-15T05:00:00.000Z',
        freshUntil: '2024-01-15T05:10:00.000Z',
        confidenceBps: 9000,
        calculator: { name: 'calc', version: '1.0.0' },
        inputLineage: ['missing-ref-id'],
        warnings: [],
      },
      {
        featureId: 'feat_unparseable_ref',
        family: 'market_state',
        featureKind: 'number',
        status: 'available',
        value: 30,
        unit: 'usd',
        observedAt: '2024-01-15T05:00:00.000Z',
        freshUntil: '2024-01-15T05:10:00.000Z',
        confidenceBps: 9000,
        calculator: { name: 'calc', version: '1.0.0' },
        inputLineage: ['ref-unparseable'],
        warnings: [],
      },
      {
        featureId: 'feat_zero_span',
        family: 'market_state',
        featureKind: 'number',
        status: 'available',
        value: 40,
        unit: 'usd',
        observedAt: '2024-01-15T05:00:00.000Z',
        freshUntil: '2024-01-15T05:10:00.000Z',
        confidenceBps: 9000,
        calculator: { name: 'calc', version: '1.0.0' },
        inputLineage: ['ref-valid-1', 'ref-valid-2'],
        warnings: [],
      },
      {
        featureId: 'feat_unavailable_nulls',
        family: 'market_state',
        featureKind: 'number',
        status: 'unavailable',
        value: null,
        unit: null,
        observedAt: null,
        freshUntil: null,
        confidenceBps: 0,
        calculator: { name: 'calc', version: '1.0.0' },
        inputLineage: [],
        warnings: [],
      },
    ];

    const NOW = Date.parse('2024-01-15T05:01:00.000Z');
    const vm = buildEvidenceViewModel(bundle, NOW);
    const card = vm.cards.find((c) => c.id === 'market_state');

    const emptyRow = card?.rows.find((r) => r.label === 'feat_empty_lineage');
    expect(emptyRow?.derivation).toMatchObject({
      inputCount: 0,
      inputs: [],
      timeSpanLabel: 'Unknown time span',
    });

    const unresolvedRow = card?.rows.find((r) => r.label === 'feat_unresolved_ref');
    expect(unresolvedRow?.derivation).toMatchObject({
      inputCount: 1,
      inputs: [
        {
          referenceId: 'missing-ref-id',
          sourceTypeLabel: 'Unknown source type',
          observedAtLabel: '—',
          isResolved: false,
        },
      ],
      timeSpanLabel: 'Unknown time span',
    });

    const unparseableRow = card?.rows.find((r) => r.label === 'feat_unparseable_ref');
    expect(unparseableRow?.derivation).toMatchObject({
      inputCount: 1,
      inputs: [
        {
          referenceId: 'ref-unparseable',
          sourceTypeLabel: 'API',
          observedAtLabel: 'not-a-date',
          isResolved: true,
        },
      ],
      timeSpanLabel: 'Unknown time span',
    });

    const zeroSpanRow = card?.rows.find((r) => r.label === 'feat_zero_span');
    expect(zeroSpanRow?.derivation).toMatchObject({
      inputCount: 2,
      timeSpanLabel: '0 minutes',
    });

    const unavailRow = card?.rows.find((r) => r.label === 'feat_unavailable_nulls');
    expect(unavailRow?.derivation).toMatchObject({
      observedAtLabel: '—',
      freshUntilLabel: '—',
      isStale: false,
    });
  });

  it('associates assessment warnings with known families and feature IDs and retains unknown targets as fallback warnings', () => {
    const bundle = JSON.parse(JSON.stringify(contextualFixture)) as unknown as EvidenceBundle;
    bundle.deterministicFeatures[0]!.warnings = ['Native feature warning'];

    bundle.assessment.warnings = [
      {
        code: 'WARN_SR',
        message: 'Warning for SR family',
        affectedFamilies: ['supportResistance'],
      },
      {
        code: 'WARN_MARKET',
        message: 'Warning for market state',
        affectedFamilies: ['market_state'],
      },
      {
        code: 'WARN_FEATURE',
        message: 'Warning for price feature',
        affectedFamilies: ['feat-price-001'],
      },
      {
        code: 'WARN_TARGETLESS',
        message: 'Targetless warning',
        affectedFamilies: [],
      },
      {
        code: 'WARN_BRIEF',
        message: 'Research brief warning',
        affectedFamilies: ['researchBrief'],
      },
      {
        code: 'WARN_MIXED',
        message: 'Mixed target warning',
        affectedFamilies: ['market_state', 'unknown_target_xyz'],
      },
      {
        code: 'WARN_DUPLICATE',
        message: 'Warning for market state',
        affectedFamilies: ['market_state'],
      },
    ];

    const vm = buildEvidenceViewModel(bundle, FIXED_NOW);

    const srCard = vm.cards.find((c) => c.id === 'supportResistance');
    expect(srCard?.warnings).toEqual(['Warning for SR family']);

    const msCard = vm.cards.find((c) => c.id === 'market_state');
    expect(msCard?.warnings).toEqual(['Warning for market state', 'Mixed target warning']);

    const row = msCard?.rows.find((r) => r.label === 'feat-price-001');
    expect(row?.warnings).toEqual(['Native feature warning', 'Warning for price feature']);

    expect(vm.warnings).toEqual(['Targetless warning', 'Research brief warning']);
  });

  it('maps deterministic umbrella warnings to every deterministic family without duplicating fallback', () => {
    const bundle = JSON.parse(JSON.stringify(contextualFixture)) as unknown as EvidenceBundle;
    bundle.assessment.warnings = [
      {
        code: 'DETERMINISTIC_DEGRADED',
        message: 'Deterministic pipeline degraded',
        affectedFamilies: ['deterministic'],
      },
    ];

    const vm = buildEvidenceViewModel(bundle, FIXED_NOW);

    const marketStateCard = vm.cards.find((c) => c.id === 'market_state');
    const liquidityCard = vm.cards.find((c) => c.id === 'liquidity');
    const srCard = vm.cards.find((c) => c.id === 'supportResistance');

    expect(marketStateCard?.warnings).toEqual(['Deterministic pipeline degraded']);
    expect(liquidityCard?.warnings).toEqual(['Deterministic pipeline degraded']);
    expect(srCard?.warnings).toEqual([]);
    expect(vm.warnings).toEqual([]);
  });
});

describe('formatLastCollectedLabel', () => {
  const NOW = Date.parse('2024-01-15T18:00:00.000Z');

  it('formats missing or unconfigured liveness correctly', () => {
    expect(formatLastCollectedLabel(undefined, NOW)).toBe('Collector status unavailable');
    expect(formatLastCollectedLabel({ isConfigured: false, lastCollectedAt: null }, NOW)).toBe(
      'No collector configured',
    );
  });

  it('formats null lastCollectedAt as No successful run recorded', () => {
    expect(formatLastCollectedLabel({ isConfigured: true, lastCollectedAt: null }, NOW)).toBe(
      'No successful run recorded',
    );
  });

  it('formats minutes under 60 with a minimum of 1m', () => {
    expect(
      formatLastCollectedLabel(
        { isConfigured: true, lastCollectedAt: '2024-01-15T17:15:00.000Z' },
        NOW,
      ),
    ).toBe('Last run 45m ago');

    // Future clock skew
    expect(
      formatLastCollectedLabel(
        { isConfigured: true, lastCollectedAt: '2024-01-15T18:05:00.000Z' },
        NOW,
      ),
    ).toBe('Last run 1m ago');
  });

  it('formats whole hours for 60 minutes or more', () => {
    expect(
      formatLastCollectedLabel(
        { isConfigured: true, lastCollectedAt: '2024-01-15T10:00:00.000Z' },
        NOW,
      ),
    ).toBe('Last run 8h ago');
  });
});

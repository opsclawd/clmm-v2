import { describe, expect, it } from 'vitest';
import type { PolicyInsightBlock, PolicyInsightReasonCode } from '@clmm/application/public';
import { buildSynthesisViewModel } from './SynthesisViewModel.js';
import canonicalCurrentPair from '../../../../schemas/regime-engine/policy-insight.v1/fixtures/valid/current-pair.json';
import canonicalCurrentPosition from '../../../../schemas/regime-engine/policy-insight.v1/fixtures/valid/current-position.json';

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
    warnings: [],
    freshness: {
      status: 'FRESH',
      evaluatedAt: '2026-07-19T12:00:00.000Z',
      ageSeconds: 60,
    },
    ...overrides,
  };
}

describe('buildSynthesisViewModel', () => {
  it('marks every family available when no family exception warning exists', () => {
    const vm = buildSynthesisViewModel(fixture({ warnings: [] }));

    expect(vm.families).toHaveLength(6);
    expect(vm.families.map((f) => f.id)).toEqual([
      'deterministic',
      'supportResistance',
      'flows',
      'derivatives',
      'events',
      'newsRegulatory',
    ]);

    for (const family of vm.families) {
      expect(family.status).toBe('AVAILABLE');
      expect(family.statusLabel).toBe('Available');
    }

    expect(vm.familyStatusesReliable).toBe(true);
    expect(vm.familyStatusCaveat).toBeNull();
  });

  it('maps named family warnings to human-readable exception statuses', () => {
    const vm = buildSynthesisViewModel(
      fixture({
        warnings: [
          {
            code: 'EVIDENCE_MISSING_FAMILY',
            message: 'Deterministic family input is missing',
          },
          {
            code: 'EVIDENCE_REJECTED_FAMILY',
            message: 'Support/resistance evidence was rejected',
          },
          {
            code: 'EVIDENCE_CONFLICTED_FAMILY',
            message: 'Support & resistance evidence is conflicted with momentum',
          },
          {
            code: 'EVIDENCE_MISSING_FAMILY',
            message: 'Flows data missing from bundle',
          },
          {
            code: 'EVIDENCE_REJECTED_FAMILY',
            message: 'Derivatives features failed quality checks',
          },
          {
            code: 'EVIDENCE_MISSING_FAMILY',
            message: 'Events family failed to arrive',
          },
          {
            code: 'EVIDENCE_MISSING_FAMILY',
            message: 'News/regulatory feed missing',
          },
          {
            code: 'EVIDENCE_CONFLICTED_FAMILY',
            message: 'News & regulatory signals conflicted',
          },
        ],
      }),
    );

    const familyMap = new Map(vm.families.map((f) => [f.id, f]));

    expect(familyMap.get('deterministic')?.status).toBe('MISSING');
    expect(familyMap.get('deterministic')?.statusLabel).toBe('Missing');

    expect(familyMap.get('supportResistance')?.status).toBe('CONFLICTED');
    expect(familyMap.get('supportResistance')?.statusLabel).toBe('Conflicted');

    expect(familyMap.get('flows')?.status).toBe('MISSING');
    expect(familyMap.get('flows')?.statusLabel).toBe('Missing');

    expect(familyMap.get('derivatives')?.status).toBe('REJECTED');
    expect(familyMap.get('derivatives')?.statusLabel).toBe('Rejected');

    expect(familyMap.get('events')?.status).toBe('MISSING');
    expect(familyMap.get('events')?.statusLabel).toBe('Missing');

    expect(familyMap.get('newsRegulatory')?.status).toBe('CONFLICTED');
    expect(familyMap.get('newsRegulatory')?.statusLabel).toBe('Conflicted');

    expect(vm.familyStatusesReliable).toBe(true);
    expect(vm.familyStatusCaveat).toBeNull();
  });

  it('uses conflicted then rejected then missing precedence for repeated family warnings', () => {
    // Test precedence order: CONFLICTED > REJECTED > MISSING > AVAILABLE
    // Independent of input order
    const vmOrderA = buildSynthesisViewModel(
      fixture({
        warnings: [
          { code: 'EVIDENCE_MISSING_FAMILY', message: 'Flows family missing' },
          { code: 'EVIDENCE_REJECTED_FAMILY', message: 'Flows family rejected' },
          { code: 'EVIDENCE_CONFLICTED_FAMILY', message: 'Flows family conflicted' },
        ],
      }),
    );
    const flowsA = vmOrderA.families.find((f) => f.id === 'flows');
    expect(flowsA?.status).toBe('CONFLICTED');

    const vmOrderB = buildSynthesisViewModel(
      fixture({
        warnings: [
          { code: 'EVIDENCE_CONFLICTED_FAMILY', message: 'Derivatives family conflicted' },
          { code: 'EVIDENCE_MISSING_FAMILY', message: 'Derivatives family missing' },
        ],
      }),
    );
    const derivativesB = vmOrderB.families.find((f) => f.id === 'derivatives');
    expect(derivativesB?.status).toBe('CONFLICTED');

    const vmOrderC = buildSynthesisViewModel(
      fixture({
        warnings: [
          { code: 'EVIDENCE_MISSING_FAMILY', message: 'Events family missing' },
          { code: 'EVIDENCE_REJECTED_FAMILY', message: 'Events family rejected' },
        ],
      }),
    );
    const eventsC = vmOrderC.families.find((f) => f.id === 'events');
    expect(eventsC?.status).toBe('REJECTED');

    const vmOrderD = buildSynthesisViewModel(
      fixture({
        warnings: [
          { code: 'EVIDENCE_REJECTED_FAMILY', message: 'Events family rejected' },
          { code: 'EVIDENCE_MISSING_FAMILY', message: 'Events family missing' },
        ],
      }),
    );
    const eventsD = vmOrderD.families.find((f) => f.id === 'events');
    expect(eventsD?.status).toBe('REJECTED');
  });

  it('flags incomplete family attribution without inventing a family', () => {
    // 1. Ambiguous warning naming two families
    const vmAmbiguous = buildSynthesisViewModel(
      fixture({
        warnings: [
          {
            code: 'EVIDENCE_CONFLICTED_FAMILY',
            message: 'Flows and derivatives signals are conflicted',
          },
        ],
      }),
    );

    expect(vmAmbiguous.familyStatusesReliable).toBe(false);
    expect(vmAmbiguous.familyStatusCaveat).toContain('incomplete');
    // None of the families should have been changed away from AVAILABLE
    for (const family of vmAmbiguous.families) {
      expect(family.status).toBe('AVAILABLE');
    }
    expect(vmAmbiguous.warningLabels).toContain(
      'Evidence conflicted family: Flows and derivatives signals are conflicted',
    );

    // 2. Family warning naming zero canonical families
    const vmUnmatched = buildSynthesisViewModel(
      fixture({
        warnings: [
          {
            code: 'EVIDENCE_MISSING_FAMILY',
            message: 'Some unspecified family data missing from bundle',
          },
        ],
      }),
    );

    expect(vmUnmatched.familyStatusesReliable).toBe(false);
    expect(vmUnmatched.familyStatusCaveat).toContain('incomplete');
    for (const family of vmUnmatched.families) {
      expect(family.status).toBe('AVAILABLE');
    }
    expect(vmUnmatched.warningLabels).toContain(
      'Evidence missing family: Some unspecified family data missing from bundle',
    );
  });

  it('translates every PolicyInsight reason code into a sentence', () => {
    const allReasonCodes: PolicyInsightReasonCode[] = [
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
    ];

    const vm = buildSynthesisViewModel(fixture({ reasonCodes: allReasonCodes }));

    expect(vm.reasonBullets).toHaveLength(allReasonCodes.length);
    for (const sentence of vm.reasonBullets) {
      expect(sentence).toBeTypeOf('string');
      expect(sentence.length).toBeGreaterThan(0);
      expect(sentence).not.toContain('_');
      for (const code of allReasonCodes) {
        expect(sentence).not.toBe(code);
      }
    }
  });

  it('preserves selected evidence references without deriving family ownership', () => {
    const block = fixture();
    const vm = buildSynthesisViewModel(block);

    expect(vm.bundleReferences).toEqual([
      {
        bundleHash: 'abcd1234abcd5678abcd9012abcd3456abcd7890abcd1234abcd5678abcd9012',
        publisher: 'sol-usdc-clmm-intelligence',
        sourceId: 'src1111111111111111111111111111111111',
        runId: 'run2222222222222222222222222222222222',
      },
    ]);

    expect(vm.sourceReferences).toEqual([
      {
        referenceId: 'ref3333333333333333333333333333333333',
        sourceTypeLabel: 'API',
        locator: 'https://api.example.com/price/sol-usdc',
        observedAtLabel: '2026-07-19T11:58:00Z',
      },
    ]);

    // Check canonical position fixture references
    const positionVm = buildSynthesisViewModel(canonicalCurrentPosition as PolicyInsightBlock);
    expect(positionVm.bundleReferences).toHaveLength(1);
    expect(positionVm.sourceReferences).toHaveLength(1);
    expect(positionVm.bundleReferences[0]?.bundleHash).toBe(
      'abcd1234abcd5678abcd9012abcd3456abcd7890abcd1234abcd5678abcd9012',
    );
  });

  it('formats confidence and empty collections deterministically', () => {
    const vm75 = buildSynthesisViewModel(fixture({ confidenceBps: 7500 }));
    expect(vm75.confidenceLabel).toBe('75%');

    const vm0 = buildSynthesisViewModel(fixture({ confidenceBps: 0 }));
    expect(vm0.confidenceLabel).toBe('0%');

    const vmEmptyCollections = buildSynthesisViewModel(
      fixture({
        warnings: [],
        evidence: {
          selectionStatus: 'FULL',
          selectionPolicyVersion: 'selector.v1.2026-07',
          selectedBundleRefs: [],
          selectedSourceRefs: [],
        },
      }),
    );

    expect(vmEmptyCollections.warningLabels).toEqual(['No active warnings']);
    expect(vmEmptyCollections.bundleReferences).toEqual([]);
    expect(vmEmptyCollections.sourceReferences).toEqual([]);

    // Check pair fixture
    const pairVm = buildSynthesisViewModel(canonicalCurrentPair as PolicyInsightBlock);
    expect(pairVm.confidenceLabel).toBe('75%');
    expect(pairVm.bundleReferences).toEqual([]);
    expect(pairVm.sourceReferences).toEqual([]);
  });
});

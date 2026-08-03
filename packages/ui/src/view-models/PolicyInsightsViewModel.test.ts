import { describe, expect, it } from 'vitest';
import type { PolicyInsightBlock } from '@clmm/application/public';
import { buildPolicyInsightsViewModel } from './PolicyInsightsViewModel.js';
import canonicalCurrentPair from '../../../../schemas/regime-engine/policy-insight.v1/fixtures/valid/current-pair.json';
import canonicalCurrentPosition from '../../../../schemas/regime-engine/policy-insight.v1/fixtures/valid/current-position.json';
import canonicalHistory from '../../../../schemas/regime-engine/policy-insight.v1/fixtures/valid/history.json';

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

describe('buildPolicyInsightsViewModel', () => {
  it('returns a neutral severity for HOLD + NORMAL risk', () => {
    const vm = buildPolicyInsightsViewModel(fixture(), NOW);
    expect(vm.severity).toBe('neutral');
  });

  it('returns danger for CRITICAL risk regardless of action', () => {
    const vm = buildPolicyInsightsViewModel(
      fixture({ riskLevel: 'CRITICAL', recommendedAction: 'HOLD' }),
      NOW,
    );
    expect(vm.severity).toBe('danger');
  });

  it('returns danger for EXIT_TO_USDC action regardless of risk', () => {
    const vm = buildPolicyInsightsViewModel(
      fixture({ recommendedAction: 'EXIT_TO_USDC', riskLevel: 'NORMAL' }),
      NOW,
    );
    expect(vm.severity).toBe('danger');
  });

  it('returns danger for EXIT_TO_SOL action regardless of risk', () => {
    const vm = buildPolicyInsightsViewModel(
      fixture({ recommendedAction: 'EXIT_TO_SOL', riskLevel: 'NORMAL' }),
      NOW,
    );
    expect(vm.severity).toBe('danger');
  });

  it('returns warning for ELEVATED risk', () => {
    const vm = buildPolicyInsightsViewModel(fixture({ riskLevel: 'ELEVATED' }), NOW);
    expect(vm.severity).toBe('warning');
  });

  it('returns warning for STAND_DOWN action', () => {
    const vm = buildPolicyInsightsViewModel(fixture({ recommendedAction: 'STAND_DOWN' }), NOW);
    expect(vm.severity).toBe('warning');
  });

  it('marks isStale when freshness.status is STALE', () => {
    const vm = buildPolicyInsightsViewModel(
      fixture({
        freshness: { status: 'STALE', evaluatedAt: '2026-07-19T12:00:00.000Z', ageSeconds: 3600 },
      }),
      NOW,
    );
    expect(vm.isStale).toBe(true);
  });

  it('formats max capital deployment from bps as a percent', () => {
    const vm = buildPolicyInsightsViewModel(
      fixture({
        clmmPolicy: {
          rangeBias: 'TIGHT',
          rebalanceSensitivity: 'HIGH',
          maxCapitalDeploymentBps: 3750,
        },
      }),
      NOW,
    );
    expect(vm.maxDeploymentLabel).toBe('37.5%');
  });

  it('derives freshness label from ageSeconds', () => {
    const vm = buildPolicyInsightsViewModel(
      fixture({
        freshness: { status: 'FRESH', evaluatedAt: '2026-07-19T12:00:00.000Z', ageSeconds: 60 },
      }),
      NOW,
    );
    expect(vm.freshnessLabel).toBe('1m ago');
  });

  it('renders the canonical pair fixture correctly', () => {
    const vm = buildPolicyInsightsViewModel(canonicalCurrentPair as PolicyInsightBlock, NOW);
    expect(vm.actionLabel).toBe('Hold');
    expect(vm.severity).toBe('neutral');
    expect(vm.freshnessLabel).toBe('1m ago');
  });

  it('renders the canonical position fixture correctly', () => {
    const vm = buildPolicyInsightsViewModel(canonicalCurrentPosition as PolicyInsightBlock, NOW);
    expect(vm.actionLabel).toBe('Exit to SOL');
    expect(vm.severity).toBe('danger');
  });

  describe('basis points formatting', () => {
    it('formats basis points exactly without rounding away precision', () => {
      expect(
        buildPolicyInsightsViewModel(
          fixture({
            clmmPolicy: {
              rangeBias: 'MEDIUM',
              rebalanceSensitivity: 'NORMAL',
              maxCapitalDeploymentBps: 0,
            },
          }),
          NOW,
        ).maxDeploymentLabel,
      ).toBe('0%');
      expect(
        buildPolicyInsightsViewModel(
          fixture({
            clmmPolicy: {
              rangeBias: 'MEDIUM',
              rebalanceSensitivity: 'NORMAL',
              maxCapitalDeploymentBps: 1,
            },
          }),
          NOW,
        ).maxDeploymentLabel,
      ).toBe('0.01%');
      expect(
        buildPolicyInsightsViewModel(
          fixture({
            clmmPolicy: {
              rangeBias: 'MEDIUM',
              rebalanceSensitivity: 'NORMAL',
              maxCapitalDeploymentBps: 3750,
            },
          }),
          NOW,
        ).maxDeploymentLabel,
      ).toBe('37.5%');
      expect(
        buildPolicyInsightsViewModel(
          fixture({
            clmmPolicy: {
              rangeBias: 'MEDIUM',
              rebalanceSensitivity: 'NORMAL',
              maxCapitalDeploymentBps: 10000,
            },
          }),
          NOW,
        ).maxDeploymentLabel,
      ).toBe('100%');
    });
  });

  describe('enum label mapping', () => {
    it('maps market and fundamental regimes to display-ready labels', () => {
      expect(
        buildPolicyInsightsViewModel(
          fixture({ marketRegime: 'UP', fundamentalRegime: 'BULLISH' }),
          NOW,
        ).marketRegimeLabel,
      ).toBe('Up market');
      expect(
        buildPolicyInsightsViewModel(
          fixture({ marketRegime: 'DOWN', fundamentalRegime: 'BEARISH' }),
          NOW,
        ).marketRegimeLabel,
      ).toBe('Down market');
      expect(
        buildPolicyInsightsViewModel(
          fixture({ marketRegime: 'CHOP', fundamentalRegime: 'NEUTRAL' }),
          NOW,
        ).marketRegimeLabel,
      ).toBe('Choppy market');
      expect(
        buildPolicyInsightsViewModel(
          fixture({ marketRegime: 'UP', fundamentalRegime: 'UNKNOWN' }),
          NOW,
        ).fundamentalRegimeLabel,
      ).toBe('Unknown');
    });

    it('maps posture, range bias, and sensitivity to title/sentence case', () => {
      const vmAggressive = buildPolicyInsightsViewModel(fixture({ posture: 'AGGRESSIVE' }), NOW);
      expect(vmAggressive.postureLabel).toBe('Aggressive');

      const vmModAggressive = buildPolicyInsightsViewModel(
        fixture({ posture: 'MODERATELY_AGGRESSIVE' }),
        NOW,
      );
      expect(vmModAggressive.postureLabel).toBe('Moderately aggressive');

      const vmNeutral = buildPolicyInsightsViewModel(fixture({ posture: 'NEUTRAL' }), NOW);
      expect(vmNeutral.postureLabel).toBe('Neutral');

      const vmDefensive = buildPolicyInsightsViewModel(fixture({ posture: 'DEFENSIVE' }), NOW);
      expect(vmDefensive.postureLabel).toBe('Defensive');

      const vmPaused = buildPolicyInsightsViewModel(fixture({ posture: 'PAUSED' }), NOW);
      expect(vmPaused.postureLabel).toBe('Paused');
    });
  });

  describe('level filtering and unavailable labeling', () => {
    it('preserves canonical decimal levels while filtering zero placeholders', () => {
      const vm = buildPolicyInsightsViewModel(
        fixture({
          levels: {
            supportsUsdcPerSol: ['138.5', '0', '135.2', '0.0', '0.00'],
            resistancesUsdcPerSol: ['142.0', '145.5'],
          },
        }),
        NOW,
      );
      expect(vm.supportsLabel).toBe('138.5, 135.2 USDC/SOL');
      expect(vm.resistancesLabel).toBe('142.0, 145.5 USDC/SOL');
    });

    it('marks both empty level arrays unavailable instead of rendering zero', () => {
      const vm = buildPolicyInsightsViewModel(
        fixture({
          levels: {
            supportsUsdcPerSol: [],
            resistancesUsdcPerSol: [],
          },
        }),
        NOW,
      );
      expect(vm.supportsLabel).toBeNull();
      expect(vm.resistancesLabel).toBeNull();
      expect(vm.levelsUnavailableLabel).toBe('No eligible support or resistance levels');
    });
  });

  describe('evidence summary', () => {
    it('summarizes evidence coverage and aggregate counts without raw identifiers', () => {
      const vmFull = buildPolicyInsightsViewModel(
        fixture({
          evidence: {
            selectionStatus: 'FULL',
            selectionPolicyVersion: 'selector.v1.2026-07',
            selectedBundleRefs: [],
            selectedSourceRefs: [],
          },
        }),
        NOW,
      );
      expect(vmFull.evidenceSummary).toBe('Full evidence coverage');

      const vmPartial = buildPolicyInsightsViewModel(
        canonicalCurrentPosition as PolicyInsightBlock,
        NOW,
      );
      expect(vmPartial.evidenceSummary).toBe('Partial evidence coverage (1 bundle, 1 source)');
    });

    it('marks partial degraded and low-confidence insights as visually weaker', () => {
      const vmPartial = buildPolicyInsightsViewModel(
        fixture({
          evidence: {
            selectionStatus: 'PARTIAL',
            selectionPolicyVersion: 'selector.v1.2026-07',
            selectedBundleRefs: [],
            selectedSourceRefs: [],
          },
          confidenceBps: 5000,
          dataQuality: 'PARTIAL',
        }),
        NOW,
      );
      expect(vmPartial.isDegraded).toBe(true);
      expect(vmPartial.isLowConfidence).toBe(false);

      const vmLowConf = buildPolicyInsightsViewModel(fixture({ confidenceBps: 4999 }), NOW);
      expect(vmLowConf.isLowConfidence).toBe(true);

      const vmDegraded = buildPolicyInsightsViewModel(
        fixture({
          evidence: {
            selectionStatus: 'DEGRADED',
            selectionPolicyVersion: 'selector.v1.2026-07',
            selectedBundleRefs: [],
            selectedSourceRefs: [],
          },
        }),
        NOW,
      );
      expect(vmDegraded.isDegraded).toBe(true);
    });
  });

  describe('staleness and expiry', () => {
    it('marks an expired insight stale even when freshness.status is FRESH', () => {
      const pastTime = Date.parse('2026-07-19T12:30:00Z') + 1;
      const vm = buildPolicyInsightsViewModel(
        fixture({
          freshness: { status: 'FRESH', evaluatedAt: '2026-07-19T12:00:00.000Z', ageSeconds: 60 },
          expiresAt: '2026-07-19T12:29:59.000Z',
        }),
        pastTime,
      );
      expect(vm.isStale).toBe(true);
    });

    it('produces display-ready UTC as-of and expiry labels', () => {
      const vm = buildPolicyInsightsViewModel(
        fixture({
          asOf: '2026-07-19T11:59:00.000Z',
          expiresAt: '2026-07-19T13:00:00.000Z',
        }),
        NOW,
      );
      expect(vm.asOfLabel).toBe('2026-07-19T11:59:00Z');
      expect(vm.expiresLabel).toBe('2026-07-19T13:00:00Z');
    });
  });

  describe('warning and reason code handling', () => {
    it('prioritizes mapped warnings, excludes advisory-only, deduplicates copy, and caps summary bullets at three', () => {
      const vm = buildPolicyInsightsViewModel(
        fixture({
          warnings: [
            { code: 'EVIDENCE_CONFLICTED_FAMILY', message: 'IDENTIFIER: hidden-1' },
            { code: 'EVIDENCE_STALE_INPUT', message: 'IDENTIFIER: hidden-2' },
            { code: 'NO_ELIGIBLE_PRICE_LEVELS', message: 'IDENTIFIER: hidden-3' },
          ],
          reasonCodes: ['ADVISORY_ONLY', 'NO_ELIGIBLE_PRICE_LEVELS', 'MARKET_REGIME_UP'],
        }),
        NOW,
      );

      expect(vm.summaryBullets).toEqual([
        'Some supporting data sources disagreed.',
        'Some supporting data may be out of date.',
        'No usable support or resistance levels were available.',
      ]);
    });

    it('maps EVIDENCE_MISSING_FAMILY to plain-language availability copy', () => {
      const vm = buildPolicyInsightsViewModel(
        fixture({
          warnings: [{ code: 'EVIDENCE_MISSING_FAMILY', message: 'Family deterministic missing' }],
          reasonCodes: ['ADVISORY_ONLY'],
        }),
        NOW,
      );

      expect(vm.summaryBullets).toEqual([
        "Some position or market data wasn't available for this recommendation.",
      ]);
    });

    it('does not derive summary bullets from raw reasoning or identifiers', () => {
      const first = buildPolicyInsightsViewModel(
        fixture({
          warnings: [],
          reasonCodes: ['MARKET_REGIME_CHOP'],
          reasoning: 'IDENTIFIER: mco-sol-secret | CONTEXTUAL_EVIDENCE_VOTE',
        }),
        NOW,
      );
      const second = buildPolicyInsightsViewModel(
        fixture({
          warnings: [],
          reasonCodes: ['MARKET_REGIME_CHOP'],
          reasoning: 'Completely different prose and values',
        }),
        NOW,
      );

      expect(first.summaryBullets).toEqual(['Market conditions are choppy.']);
      expect(second.summaryBullets).toEqual(first.summaryBullets);
      expect(first.summaryBullets.join(' ')).not.toMatch(/IDENTIFIER|CONTEXTUAL_EVIDENCE_VOTE/);
    });

    it('returns one generic bullet when only advisory-only or unknown runtime codes remain', () => {
      const advisoryOnly = buildPolicyInsightsViewModel(
        fixture({ warnings: [], reasonCodes: ['ADVISORY_ONLY'] }),
        NOW,
      );
      const runtimeUnknown = buildPolicyInsightsViewModel(
        fixture({ reasonCodes: ['FUTURE_INTERNAL_CODE' as never] }),
        NOW,
      );

      expect(advisoryOnly.summaryBullets).toEqual([
        'This recommendation reflects the latest available market and position context.',
      ]);
      expect(runtimeUnknown.summaryBullets).toEqual(advisoryOnly.summaryBullets);
    });

    it('maps deduplicates and bounds warning and reason-code copy', () => {
      const vm = buildPolicyInsightsViewModel(
        fixture({
          warnings: [
            { code: 'EVIDENCE_CONFLICTED_FAMILY', message: 'Some free-form message' },
            { code: 'EVIDENCE_STALE_INPUT', message: 'Another free-form message' },
            { code: 'NO_ELIGIBLE_PRICE_LEVELS', message: 'Yet another message' },
          ],
          reasonCodes: ['MARKET_REGIME_UP', 'ADVISORY_ONLY', 'MARKET_REGIME_UP'],
        }),
        NOW,
      );
      expect(vm.warningLabels).toEqual([
        'Evidence conflicted family',
        'Evidence stale input',
        'No eligible price levels',
      ]);
      expect(vm.warningLabels.length).toBeLessThanOrEqual(3);
    });

    it('includes mapped reason codes in warningLabels output', () => {
      const vm = buildPolicyInsightsViewModel(
        fixture({
          warnings: [],
          reasonCodes: ['MARKET_REGIME_UP', 'ADVISORY_ONLY'],
        }),
        NOW,
      );
      expect(vm.warningLabels).toContain('Market regime up');
      expect(vm.warningLabels).toContain('Advisory only');
    });
  });

  describe('reasoning bounds', () => {
    it('bounds long reasoning for display', () => {
      const longReasoning = 'A'.repeat(300);
      const vm = buildPolicyInsightsViewModel(fixture({ reasoning: longReasoning }), NOW);
      expect(vm.reasoning.length).toBe(240);
      expect(vm.reasoning.endsWith('…')).toBe(true);
      expect(vm.reasoning.slice(0, 239)).toBe('A'.repeat(239));
    });

    it('keeps reasoning unchanged through 240 characters', () => {
      const shortReasoning = 'A'.repeat(240);
      const vm = buildPolicyInsightsViewModel(fixture({ reasoning: shortReasoning }), NOW);
      expect(vm.reasoning).toBe(shortReasoning);
    });
  });

  describe('severity precedence', () => {
    it('keeps critical and exit actions at danger precedence', () => {
      const vmCritical = buildPolicyInsightsViewModel(
        fixture({
          riskLevel: 'CRITICAL',
          recommendedAction: 'STAND_DOWN',
        }),
        NOW,
      );
      expect(vmCritical.severity).toBe('danger');

      const vmExitStale = buildPolicyInsightsViewModel(
        fixture({
          recommendedAction: 'EXIT_TO_SOL',
          freshness: { status: 'STALE', evaluatedAt: '2026-07-19T12:00:00.000Z', ageSeconds: 3600 },
        }),
        NOW,
      );
      expect(vmExitStale.severity).toBe('danger');

      const vmExitDegraded = buildPolicyInsightsViewModel(
        fixture({
          recommendedAction: 'EXIT_TO_USDC',
          evidence: {
            selectionStatus: 'DEGRADED',
            selectionPolicyVersion: 'selector.v1.2026-07',
            selectedBundleRefs: [],
            selectedSourceRefs: [],
          },
          confidenceBps: 2500,
        }),
        NOW,
      );
      expect(vmExitDegraded.severity).toBe('danger');

      const vmStaleWarning = buildPolicyInsightsViewModel(
        fixture({
          recommendedAction: 'STAND_DOWN',
          freshness: { status: 'STALE', evaluatedAt: '2026-07-19T12:00:00.000Z', ageSeconds: 3600 },
        }),
        NOW,
      );
      expect(vmStaleWarning.severity).toBe('warning');
    });
  });

  describe('canonical fixture coverage', () => {
    it('covers history.json item 2 for degraded and stale', () => {
      const historyItem = JSON.parse(
        JSON.stringify(canonicalHistory.items[1]),
      ) as PolicyInsightBlock;
      const vm = buildPolicyInsightsViewModel(historyItem, Date.parse('2026-07-19T12:00:00Z'));
      expect(vm.severity).toBe('warning');
      expect(vm.isStale).toBe(true);
      expect(vm.isDegraded).toBe(true);
      expect(vm.evidenceSummary).toBe('Limited evidence coverage');
    });
  });
});

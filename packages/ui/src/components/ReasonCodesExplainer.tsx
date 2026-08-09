import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import type {
  PolicyInsightBlock,
  PolicyInsightReasonCode,
  PolicyInsightRecommendedAction,
  PolicyInsightsUnavailableReason,
} from '@clmm/application/public';
import { colors, typography } from '../design-system/index.js';

export interface ReasonCodesExplainerProps {
  policyInsight?: PolicyInsightBlock | null;
  isLoading?: boolean;
  isError?: boolean;
  unavailableReason?: PolicyInsightsUnavailableReason | null;
  evidenceRunId?: string;
}

const REASON_EXPLANATIONS = {
  ADVISORY_ONLY: 'This recommendation is guidance only and cannot execute without your signature.',
  DATA_HARD_STALE: 'Market data is too stale to support an active recommendation confidently.',
  DATA_INSUFFICIENT_SAMPLES:
    'There are not enough recent samples to support a stronger recommendation.',
  CLMM_BREACH_LOWER: 'The position is below its configured price range.',
  CLMM_BREACH_UPPER: 'The position is above its configured price range.',
  CHURN_STAND_DOWN_ACTIVE: 'The policy is standing down to avoid repeated recommendation changes.',
  CHURN_COOLDOWN_ACTIVE: 'A cooldown is active before another recommendation change is allowed.',
  MARKET_REGIME_UP: 'Deterministic market features classify the current regime as upward.',
  MARKET_REGIME_DOWN: 'Deterministic market features classify the current regime as downward.',
  MARKET_REGIME_CHOP: 'Deterministic market features classify the current regime as choppy.',
  FEATURE_THRESHOLD_BREACHED:
    'A monitored feature crossed a policy threshold; the exact feature is not carried by this contract.',
  CONTEXTUAL_EVIDENCE_VOTE: 'Selected contextual evidence influenced the policy result.',
  RESEARCH_BRIEF_ANALYSIS: 'Selected research context influenced the policy result.',
  NO_ELIGIBLE_PRICE_LEVELS:
    'No eligible support or resistance levels were available to the policy.',
} satisfies Record<PolicyInsightReasonCode, string>;

const REASON_CODE_LABELS: Record<PolicyInsightReasonCode, string> = {
  ADVISORY_ONLY: 'Advisory only',
  DATA_HARD_STALE: 'Data hard stale',
  DATA_INSUFFICIENT_SAMPLES: 'Data insufficient samples',
  CLMM_BREACH_LOWER: 'CLMM breach lower',
  CLMM_BREACH_UPPER: 'CLMM breach upper',
  CHURN_STAND_DOWN_ACTIVE: 'Churn stand-down active',
  CHURN_COOLDOWN_ACTIVE: 'Churn cooldown active',
  MARKET_REGIME_UP: 'Market regime up',
  MARKET_REGIME_DOWN: 'Market regime down',
  MARKET_REGIME_CHOP: 'Market regime chop',
  FEATURE_THRESHOLD_BREACHED: 'Feature threshold breached',
  CONTEXTUAL_EVIDENCE_VOTE: 'Contextual evidence vote',
  RESEARCH_BRIEF_ANALYSIS: 'Research brief analysis',
  NO_ELIGIBLE_PRICE_LEVELS: 'No eligible price levels',
};

const ACTION_LABELS: Record<PolicyInsightRecommendedAction, string> = {
  HOLD: 'Hold',
  MONITOR_LOWER_BOUND: 'Monitor lower bound',
  MONITOR_UPPER_BOUND: 'Monitor upper bound',
  EXIT_TO_USDC: 'Exit to USDC',
  EXIT_TO_SOL: 'Exit to SOL',
  STAND_DOWN: 'Stand down',
};

const cardStyle = {
  padding: 16,
  backgroundColor: colors.surface,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: colors.border,
  marginBottom: 16,
} as const;

export function ReasonCodesExplainer({
  policyInsight,
  isLoading = false,
  isError = false,
  unavailableReason = null,
  evidenceRunId,
}: ReasonCodesExplainerProps): JSX.Element | null {
  if (isLoading && policyInsight == null) {
    return (
      <View
        testID="reason-codes-explainer-loading"
        style={{ ...cardStyle, alignItems: 'center', justifyContent: 'center' }}
      >
        <ActivityIndicator color={colors.safe} size="small" />
        <Text
          style={{ color: colors.textSecondary, marginTop: 8, fontSize: typography.fontSize.xs }}
        >
          Loading policy insight recommendations…
        </Text>
      </View>
    );
  }

  if (policyInsight == null) {
    if (!isError && !unavailableReason) {
      return null;
    }
    return (
      <View testID="reason-codes-explainer-unavailable" style={cardStyle}>
        <Text
          style={{
            color: colors.textPrimary,
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.bold,
          }}
        >
          Policy Insight Summary
        </Text>
        <Text
          style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs, marginTop: 4 }}
        >
          Policy insight unavailable. Position monitoring continues independently.
        </Text>
      </View>
    );
  }

  const selectedBundleRefs = policyInsight.evidence?.selectedBundleRefs ?? [];
  const selectedSourceRefs = policyInsight.evidence?.selectedSourceRefs ?? [];
  const isAligned = Boolean(
    evidenceRunId && selectedBundleRefs.some((ref) => ref.runId === evidenceRunId),
  );
  const showMismatchWarning = selectedBundleRefs.length > 0 && evidenceRunId && !isAligned;
  const actionLabel =
    ACTION_LABELS[policyInsight.recommendedAction] ?? policyInsight.recommendedAction;

  return (
    <View testID="reason-codes-explainer" style={cardStyle}>
      {/* Policy Action Header */}
      <View style={{ marginBottom: 12 }}>
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.xs,
            fontWeight: typography.fontWeight.medium,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          Policy Recommendation
        </Text>
        <Text
          testID="reason-codes-explainer-recommendation"
          style={{
            color: colors.textPrimary,
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.bold,
            marginTop: 2,
          }}
        >
          {actionLabel}
        </Text>
      </View>

      {/* Selected Run Details */}
      {selectedBundleRefs.length > 0 ? (
        <View
          style={{
            padding: 8,
            backgroundColor: colors.surfaceRecessed,
            borderRadius: 6,
            marginBottom: 12,
            gap: 2,
          }}
        >
          <Text style={{ color: colors.textTertiary, fontSize: typography.fontSize.xs }}>
            Selected Run: {selectedBundleRefs[0]?.runId}
          </Text>
          <Text style={{ color: colors.textTertiary, fontSize: typography.fontSize.xs }}>
            Bundle Hash: {selectedBundleRefs[0]?.bundleHash}
          </Text>
        </View>
      ) : null}

      {/* Run Mismatch Warning */}
      {showMismatchWarning ? (
        <View
          testID="bundle-mismatch-warning"
          style={{
            padding: 10,
            backgroundColor: colors.surface,
            borderColor: colors.warn,
            borderWidth: 1,
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          <Text
            style={{
              color: colors.warn,
              fontSize: typography.fontSize.xs,
              fontWeight: typography.fontWeight.bold,
              marginBottom: 4,
            }}
          >
            Evidence Run Mismatch
          </Text>
          <Text style={{ color: colors.warn, fontSize: typography.fontSize.xs }}>
            This policy insight was synthesized against evidence run {selectedBundleRefs[0]?.runId}{' '}
            (bundleHash: {selectedBundleRefs[0]?.bundleHash}), but the screen is displaying evidence
            run {evidenceRunId}. Current evidence contribution cannot be confirmed.
          </Text>
        </View>
      ) : null}

      {/* Reason Codes & Explanations */}
      <Text
        style={{
          color: colors.textPrimary,
          fontSize: typography.fontSize.sm,
          fontWeight: typography.fontWeight.bold,
          marginBottom: 8,
        }}
      >
        Recommendation Reasons
      </Text>

      <View style={{ gap: 12 }}>
        {policyInsight.reasonCodes.map((code) => {
          const label = REASON_CODE_LABELS[code] ?? code;
          const explanation = REASON_EXPLANATIONS[code] ?? 'No explanation available.';

          return (
            <View
              key={code}
              testID={`reason-code-item-${code}`}
              style={{
                padding: 10,
                backgroundColor: colors.surfaceRecessed,
                borderRadius: 6,
                borderLeftWidth: 3,
                borderLeftColor: colors.primary,
              }}
            >
              <Text
                testID={`reason-code-label-${code}`}
                style={{
                  color: colors.textPrimary,
                  fontSize: typography.fontSize.xs,
                  fontWeight: typography.fontWeight.bold,
                }}
              >
                {label}
              </Text>
              <Text
                testID={`reason-code-explanation-${code}`}
                style={{
                  color: colors.textSecondary,
                  fontSize: typography.fontSize.xs,
                  marginTop: 2,
                }}
              >
                {explanation}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Insight-Level Selected Evidence Sources */}
      <View
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: colors.borderSubtle,
        }}
      >
        <Text
          style={{
            color: colors.textPrimary,
            fontSize: typography.fontSize.xs,
            fontWeight: typography.fontWeight.semibold,
            marginBottom: 4,
          }}
        >
          Selected evidence for this insight
        </Text>

        {selectedSourceRefs.length > 0 ? (
          <>
            <Text
              style={{
                color: colors.textTertiary,
                fontSize: typography.fontSize.xs,
                marginBottom: 8,
                fontStyle: 'italic',
              }}
            >
              The contract does not identify which selected feature triggered this specific reason.
            </Text>
            <View style={{ gap: 6 }}>
              {selectedSourceRefs.map((source) => (
                <View
                  key={source.referenceId}
                  testID={`selected-source-item-${source.referenceId}`}
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    padding: 6,
                    backgroundColor: colors.surfaceRecessed,
                    borderRadius: 4,
                  }}
                >
                  <Text
                    style={{
                      color: colors.textPrimary,
                      fontSize: typography.fontSize.xs,
                      fontWeight: typography.fontWeight.medium,
                    }}
                  >
                    {source.referenceId}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs }}>
                    {source.sourceType} • Observed: {source.observedAt}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs }}>
            No selected evidence sources for this insight
          </Text>
        )}
      </View>
    </View>
  );
}

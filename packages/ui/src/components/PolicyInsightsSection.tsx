import { View, Text, ActivityIndicator } from 'react-native';
import {
  type PolicyInsightBlock,
  type PolicyInsightsUnavailableReason,
} from '@clmm/application/public';
import { colors, typography } from '../design-system/index.js';
import { buildPolicyInsightsViewModel } from '../view-models/PolicyInsightsViewModel.js';

type Props = {
  policyInsight: PolicyInsightBlock | null | undefined;
  isLoading: boolean;
  isError: boolean;
  isEnabled: boolean;
  unavailableReason?: PolicyInsightsUnavailableReason | null;
  now: number;
};

const cardStyle = {
  marginHorizontal: 16,
  marginTop: 14,
  padding: 16,
  backgroundColor: colors.surface,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: colors.border,
} as const;

function severityBorder(severity: 'danger' | 'warning' | 'neutral'): string {
  switch (severity) {
    case 'danger':
      return colors.breachAccent;
    case 'warning':
      return colors.warn;
    case 'neutral':
      return colors.border;
  }
}

function unavailableCopy(reason: PolicyInsightsUnavailableReason): string {
  switch (reason) {
    case 'not-found':
      return 'No policy insight available yet.';
    case 'store-unavailable':
    case 'config-error':
    case 'upstream-error':
      return 'Policy insights unavailable.';
  }
}

export function PolicyInsightsSection({
  policyInsight,
  isLoading,
  isError,
  isEnabled,
  unavailableReason,
  now,
}: Props): JSX.Element | null {
  if (!isEnabled) return null;

  if (isLoading && policyInsight == null) {
    return (
      <View testID="policy-insights-skeleton" style={{ ...cardStyle, alignItems: 'center' }}>
        <ActivityIndicator color={colors.safe} />
      </View>
    );
  }

  if (policyInsight == null) {
    if (!unavailableReason && !isError) return null;
    return (
      <View testID="policy-insights-unavailable" style={cardStyle}>
        <Text
          style={{
            color: colors.textPrimary,
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.semibold,
          }}
        >
          PolicyInsights
        </Text>
        <Text
          style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}
        >
          {unavailableReason ? unavailableCopy(unavailableReason) : 'Policy insights unavailable.'}
        </Text>
      </View>
    );
  }

  const vm = buildPolicyInsightsViewModel(policyInsight, now);
  return (
    <View
      testID="policy-insights-card"
      accessibilityLabel={`Policy insights: ${vm.severity} severity`}
      style={{ ...cardStyle, borderColor: severityBorder(vm.severity) }}
    >
      <Text
        style={{
          color: colors.textPrimary,
          fontSize: typography.fontSize.sm,
          fontWeight: typography.fontWeight.semibold,
        }}
      >
        PolicyInsights
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs, marginTop: 2 }}>
        {vm.subtitle}
      </Text>
      <Text
        testID="policy-insights-action"
        accessibilityLabel={`Action: ${vm.actionLabel}`}
        style={{
          color: colors.textPrimary,
          fontSize: typography.fontSize.md,
          fontWeight: typography.fontWeight.semibold,
          marginTop: 8,
        }}
      >
        {vm.actionLabel}
      </Text>
      {vm.isStale ? (
        <Text
          testID="policy-insights-stale-warning"
          accessibilityLabel="Stale policy insight"
          style={{ color: colors.warn, fontSize: typography.fontSize.xs, marginTop: 2 }}
        >
          Stale — last update {vm.freshnessLabel}
        </Text>
      ) : (
        <Text
          testID="policy-insights-freshness"
          accessibilityLabel={`Freshness: ${vm.freshnessLabel}`}
          style={{ color: colors.textTertiary, fontSize: typography.fontSize.xs, marginTop: 2 }}
        >
          {vm.freshnessLabel}
        </Text>
      )}
      <Text
        testID="policy-insights-posture"
        accessibilityLabel={vm.postureLabel}
        style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 6 }}
      >
        {vm.postureLabel}
      </Text>
      <Text
        testID="policy-insights-range-bias"
        accessibilityLabel={vm.rangeBiasLabel}
        style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 2 }}
      >
        {vm.rangeBiasLabel}
      </Text>
      <Text
        testID="policy-insights-rebalance-sensitivity"
        accessibilityLabel={vm.rebalanceSensitivityLabel}
        style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 2 }}
      >
        {vm.rebalanceSensitivityLabel}
      </Text>
      <Text
        testID="policy-insights-max-capital"
        accessibilityLabel={`Max capital: ${vm.maxDeploymentLabel}`}
        style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 2 }}
      >
        Max capital: {vm.maxDeploymentLabel}
      </Text>
      <Text
        testID="policy-insights-risk"
        accessibilityLabel={vm.riskLabel}
        style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 6 }}
      >
        {vm.riskLabel}
      </Text>
      <Text
        testID="policy-insights-confidence"
        accessibilityLabel={vm.confidenceLabel}
        style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 2 }}
      >
        {vm.confidenceLabel}
      </Text>
      <Text
        testID="policy-insights-data-quality"
        accessibilityLabel={vm.dataQualityLabel}
        style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 2 }}
      >
        {vm.dataQualityLabel}
      </Text>
      {vm.reasoning.map((reason, idx) => (
        <Text
          key={`policy-insight-reason-${idx}`}
          style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}
        >
          {reason}
        </Text>
      ))}
      {isError ? (
        <Text
          testID="policy-insights-degraded"
          style={{ color: colors.warn, fontSize: typography.fontSize.xs, marginTop: 6 }}
        >
          Refresh failed — showing last available policy insight.
        </Text>
      ) : null}
    </View>
  );
}

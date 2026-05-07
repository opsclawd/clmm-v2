import { View, Text, ActivityIndicator } from 'react-native';
import type { PolicyInsightBlock } from '@clmm/application/public';
import { colors, typography } from '../design-system/index.js';
import { buildPolicyInsightsViewModel } from '../view-models/PolicyInsightsViewModel.js';

type PolicyInsightsUnavailableReason =
  | 'not-found'
  | 'store-unavailable'
  | 'config-error'
  | 'upstream-error';

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
    if (!unavailableReason) return null;
    return (
      <View style={cardStyle}>
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
          {unavailableCopy(unavailableReason)}
        </Text>
      </View>
    );
  }

  const vm = buildPolicyInsightsViewModel(policyInsight, now);
  return (
    <View
      testID="policy-insights-card"
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
          style={{ color: colors.warn, fontSize: typography.fontSize.xs, marginTop: 2 }}
        >
          Stale — last update {vm.freshnessLabel}
        </Text>
      ) : (
        <Text
          style={{ color: colors.textTertiary, fontSize: typography.fontSize.xs, marginTop: 2 }}
        >
          {vm.freshnessLabel}
        </Text>
      )}
      <Text style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 6 }}>
        {vm.postureLabel}
      </Text>
      <Text style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 2 }}>
        {vm.rangeBiasLabel}
      </Text>
      <Text style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 2 }}>
        {vm.rebalanceSensitivityLabel}
      </Text>
      <Text style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 2 }}>
        Max capital: {vm.maxDeploymentLabel}
      </Text>
      <Text style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 6 }}>
        {vm.riskLabel}
      </Text>
      <Text style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 2 }}>
        {vm.confidenceLabel}
      </Text>
      <Text style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 2 }}>
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

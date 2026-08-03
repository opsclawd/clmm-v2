import { View, Text, ActivityIndicator, Pressable } from 'react-native';
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
  onViewSynthesis?: () => void;
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
  const suffix =
    ' Position monitoring and deterministic stop-loss protection continue independently.';
  switch (reason) {
    case 'not-found':
      return 'No policy insight is available yet.' + suffix;
    case 'store-unavailable':
      return 'The policy insight store is temporarily unavailable.' + suffix;
    case 'config-error':
      return 'Policy analysis is not configured.' + suffix;
    case 'malformed':
      return 'The policy insight payload was malformed, so guidance was withheld.' + suffix;
    case 'upstream-error':
      return 'The policy insight service could not be reached.' + suffix;
  }
}

export function PolicyInsightsSection({
  policyInsight,
  isLoading,
  isError,
  isEnabled,
  unavailableReason,
  now,
  onViewSynthesis,
}: Props): JSX.Element | null {
  if (!isEnabled) return null;

  if (isLoading && policyInsight == null) {
    return (
      <View testID="policy-insights-skeleton" style={{ ...cardStyle, alignItems: 'center' }}>
        <ActivityIndicator color={colors.safe} />
      </View>
    );
  }

  if (isLoading && policyInsight != null) {
    return (
      <View
        testID="policy-insights-card"
        accessibilityLabel="Policy insights: updating"
        style={{ ...cardStyle, borderColor: severityBorder('neutral') }}
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
        <Text
          style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs, marginTop: 2 }}
        >
          {buildPolicyInsightsViewModel(policyInsight, now).subtitle}
        </Text>
        <Text
          testID="policy-insights-updating"
          style={{ color: colors.textTertiary, fontSize: typography.fontSize.xs, marginTop: 8 }}
        >
          Updating policy insight…
        </Text>
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
  const evidenceTextColor = vm.isDegraded || vm.isLowConfidence ? colors.warn : colors.textBody;

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
        testID="policy-insights-market-regime"
        accessibilityLabel={vm.marketRegimeLabel}
        style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 6 }}
      >
        {vm.marketRegimeLabel}
      </Text>
      <Text
        testID="policy-insights-fundamental-regime"
        accessibilityLabel={vm.fundamentalRegimeLabel}
        style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 2 }}
      >
        {vm.fundamentalRegimeLabel}
      </Text>
      <Text
        testID="policy-insights-posture"
        accessibilityLabel={vm.postureLabel}
        style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 2 }}
      >
        {vm.postureLabel}
      </Text>
      <Text
        testID="policy-insights-range-bias"
        accessibilityLabel={vm.rangeBiasLabel}
        style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 6 }}
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
        {vm.maxDeploymentLabel}
      </Text>
      <Text
        testID="policy-insights-risk"
        accessibilityLabel={vm.riskLabel}
        style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 6 }}
      >
        {vm.riskLabel}
      </Text>
      {vm.supportsLabel != null ? (
        <Text
          testID="policy-insights-supports"
          accessibilityLabel={vm.supportsLabel}
          style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 6 }}
        >
          {vm.supportsLabel}
        </Text>
      ) : null}
      {vm.resistancesLabel != null ? (
        <Text
          testID="policy-insights-resistances"
          accessibilityLabel={vm.resistancesLabel}
          style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 2 }}
        >
          {vm.resistancesLabel}
        </Text>
      ) : null}
      {vm.levelsUnavailableLabel != null ? (
        <Text
          testID="policy-insights-levels-unavailable"
          accessibilityLabel={vm.levelsUnavailableLabel}
          style={{ color: colors.textBody, fontSize: typography.fontSize.sm, marginTop: 6 }}
        >
          {vm.levelsUnavailableLabel}
        </Text>
      ) : null}
      <Text
        testID="policy-insights-evidence-summary"
        accessibilityLabel={vm.evidenceSummary}
        style={{ color: evidenceTextColor, fontSize: typography.fontSize.sm, marginTop: 6 }}
      >
        {vm.evidenceSummary}
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
      {vm.warningLabels.length > 0 ? (
        <View style={{ marginTop: 4 }}>
          {vm.warningLabels.slice(0, 3).map((label, index) => (
            <Text
              key={index}
              style={{ color: colors.warn, fontSize: typography.fontSize.xs, marginTop: 2 }}
            >
              {label}
            </Text>
          ))}
        </View>
      ) : null}
      <Text
        testID="policy-insights-as-of"
        accessibilityLabel={`As of ${vm.asOfLabel}`}
        style={{ color: colors.textTertiary, fontSize: typography.fontSize.xs, marginTop: 6 }}
      >
        As of {vm.asOfLabel}
      </Text>
      <Text
        testID="policy-insights-expires"
        accessibilityLabel={`Expires ${vm.expiresLabel}`}
        style={{ color: colors.textTertiary, fontSize: typography.fontSize.xs, marginTop: 2 }}
      >
        Expires {vm.expiresLabel}
      </Text>
      {vm.reasoning ? (
        <Text
          style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}
        >
          {vm.reasoning}
        </Text>
      ) : null}
      {isError ? (
        <Text
          testID="policy-insights-degraded"
          style={{ color: colors.warn, fontSize: typography.fontSize.xs, marginTop: 6 }}
        >
          Refresh failed — showing last available policy insight.
        </Text>
      ) : null}
      {onViewSynthesis != null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Why this recommendation"
          onPress={onViewSynthesis}
          style={{ marginTop: 8 }}
        >
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: typography.fontSize.xs,
            }}
          >
            Why this recommendation
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

import { View, Text, ActivityIndicator } from 'react-native';
import type { RegimeBlock } from '@clmm/application/public';
import { colors, typography } from '../design-system/index.js';
import { buildRegimeViewModelBlock } from '../view-models/RegimeViewModel.js';

type Props = {
  regime: RegimeBlock | null | undefined;
  isLoading: boolean;
  isError: boolean;
  isUnsupported: boolean;
  unavailableReason?: string | null;
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

function suitabilityColor(status: string): string {
  switch (status) {
    case 'ALLOWED':
      return colors.safe;
    case 'CAUTION':
      return colors.warn;
    case 'BLOCKED':
      return colors.breachAccent;
    default:
      return colors.textTertiary;
  }
}

export function RegimeSection({
  regime,
  isLoading,
  isError,
  isUnsupported,
  unavailableReason,
  now,
}: Props): JSX.Element | null {
  if (!isLoading && regime === undefined && !isError && !isUnsupported) {
    return null;
  }

  if (isLoading && regime == null) {
    return (
      <View testID="regime-section-skeleton" style={{ ...cardStyle, alignItems: 'center' }}>
        <ActivityIndicator color={colors.safe} />
      </View>
    );
  }

  if (isUnsupported && regime == null) {
    return (
      <View style={cardStyle}>
        <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
          Regime analysis unavailable
        </Text>
        {unavailableReason ? (
          <Text
            style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}
          >
            {unavailableReason}
          </Text>
        ) : null}
      </View>
    );
  }

  if (regime == null) {
    return (
      <View style={cardStyle}>
        <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
          Regime analysis unavailable
        </Text>
        {unavailableReason ? (
          <Text
            style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}
          >
            {unavailableReason}
          </Text>
        ) : null}
      </View>
    );
  }

  const vm = buildRegimeViewModelBlock(regime, now);
  const showDegraded = isError && !isUnsupported;

  return (
    <View style={cardStyle}>
      <Text
        style={{
          color: colors.textPrimary,
          fontSize: typography.fontSize.sm,
          fontWeight: typography.fontWeight.semibold,
        }}
      >
        {vm.regimeLabel}
      </Text>
      <Text
        style={{
          color: vm.isStale ? colors.warn : colors.textTertiary,
          fontSize: typography.fontSize.xs,
          marginTop: 2,
        }}
      >
        {vm.freshnessLabel}
        {vm.isStale ? ' · stale' : ''}
      </Text>
      <Text
        style={{
          color: suitabilityColor(vm.suitabilityStatus),
          fontSize: typography.fontSize.sm,
          marginTop: 6,
        }}
      >
        {vm.suitabilityLabel}
      </Text>
      {vm.suitabilityReason ? (
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.xs,
            marginTop: 2,
          }}
        >
          {vm.suitabilityReason}
        </Text>
      ) : null}
      <Text
        style={{
          color: colors.textBody,
          fontSize: typography.fontSize.sm,
          marginTop: 4,
        }}
      >
        {vm.trendLabel} · {vm.volLabel}
      </Text>
      <Text
        style={{
          color: colors.textBody,
          fontSize: typography.fontSize.sm,
          marginTop: 4,
        }}
      >
        {vm.marketReasonSummary}
      </Text>
      {showDegraded ? (
        <Text style={{ color: colors.warn, fontSize: typography.fontSize.xs, marginTop: 4 }}>
          Refresh failed — showing last available analysis.
        </Text>
      ) : null}
    </View>
  );
}

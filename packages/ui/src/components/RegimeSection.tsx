import { useState } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import type { RegimeBlock } from '@clmm/application/public';
import { colors, typography } from '../design-system/index.js';
import { buildRegimeViewModelBlock, type RegimeDetailRow } from '../view-models/RegimeViewModel.js';

type RegimeUnavailableReason = 'not-found' | 'config-error' | 'upstream-error';

type Props = {
  regime: RegimeBlock | null | undefined;
  isLoading: boolean;
  isError: boolean;
  isUnsupported: boolean;
  unavailableReason?: RegimeUnavailableReason | null;
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

function mapUnavailableCopy(reason: RegimeUnavailableReason): string {
  switch (reason) {
    case 'not-found':
      return 'Market data not available yet';
    case 'config-error':
    case 'upstream-error':
      return 'Market context unavailable';
  }
}

function toneColor(
  tone: 'default' | 'muted' | 'warning' | 'danger' | 'success' | undefined,
): string {
  switch (tone) {
    case 'success':
      return colors.safe;
    case 'warning':
      return colors.warn;
    case 'danger':
      return colors.breachAccent;
    case 'muted':
      return colors.textTertiary;
    default:
      return colors.textBody;
  }
}

function DetailRows({ rows }: { rows: RegimeDetailRow[] }): JSX.Element {
  return (
    <View>
      {rows.map((row) => (
        <View
          key={row.label}
          style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}
        >
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: typography.fontSize.xs,
            }}
          >
            {row.label}
          </Text>
          <Text style={{ color: toneColor(row.tone), fontSize: typography.fontSize.xs }}>
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function RegimeSection({
  regime,
  isLoading,
  isError,
  isUnsupported,
  unavailableReason,
  now,
}: Props): JSX.Element | null {
  const [expanded, setExpanded] = useState(false);

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

  if (regime == null) {
    return (
      <View style={cardStyle}>
        <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
          Regime analysis unavailable
        </Text>
        {unavailableReason ? (
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: typography.fontSize.sm,
              marginTop: 4,
            }}
          >
            {mapUnavailableCopy(unavailableReason)}
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
          fontSize: typography.fontSize.sm,
          marginTop: 4,
        }}
      >
        <Text style={{ color: toneColor(vm.suitabilityTone) }}>{vm.suitabilityLabel}</Text>
        <Text style={{ color: colors.textSecondary }}> · </Text>
        <Text style={{ color: toneColor(vm.dataQualityTone) }}>
          data {vm.dataQualityLabel.toLowerCase()}
        </Text>
      </Text>
      {!expanded && vm.primaryDisplayReason ? (
        <Text
          style={{
            color: colors.textBody,
            fontSize: typography.fontSize.xs,
            marginTop: 4,
          }}
        >
          {vm.primaryDisplayReason.text}
        </Text>
      ) : null}
      <Text
        style={{
          color: colors.textBody,
          fontSize: typography.fontSize.xs,
          marginTop: 4,
        }}
      >
        {vm.latestCandleAgeLabel}
      </Text>
      <Text
        style={{
          color: colors.textBody,
          fontSize: typography.fontSize.xs,
          marginTop: 4,
        }}
      >
        {vm.compactTelemetryLabel}
      </Text>
      <Text
        style={{
          color: colors.textTertiary,
          fontSize: typography.fontSize.xs,
          marginTop: 4,
        }}
      >
        {vm.generatedAgeLabel} · Source: {vm.sourceLabel}
      </Text>
      {expanded && vm.displayReasons.length > 0 ? (
        <View style={{ marginTop: 8 }}>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: typography.fontSize.xs,
              fontWeight: typography.fontWeight.semibold,
            }}
          >
            Reasons
          </Text>
          {vm.displayReasons.map((reason) => (
            <Text
              key={`${reason.severity}-${reason.text}`}
              style={{
                color: colors.textBody,
                fontSize: typography.fontSize.xs,
                marginTop: 2,
              }}
            >
              {reason.text}
            </Text>
          ))}
        </View>
      ) : null}
      {expanded ? (
        <View style={{ marginTop: 8 }}>
          <DetailRows rows={vm.expandedTelemetryRows} />
          <View style={{ marginTop: 8 }}>
            <DetailRows rows={vm.expandedSampleRows} />
          </View>
          <View style={{ marginTop: 8 }}>
            <DetailRows rows={vm.expandedFreshnessRows} />
          </View>
        </View>
      ) : null}
      <Pressable
        onPress={() => setExpanded((prev) => !prev)}
        style={{ marginTop: 8 }}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Hide regime details' : 'Show regime details'}
      >
        <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs }}>
          {expanded ? 'Hide details' : 'Show details'}
        </Text>
      </Pressable>
      {showDegraded ? (
        <Text style={{ color: colors.warn, fontSize: typography.fontSize.xs, marginTop: 4 }}>
          Refresh failed — showing last available analysis.
        </Text>
      ) : null}
    </View>
  );
}

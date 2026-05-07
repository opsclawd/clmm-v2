import { View, Text, ActivityIndicator } from 'react-native';
import type { SrLevelsBlock, SrThesesBlock } from '@clmm/application/public';
import { colors, typography } from '../design-system/index.js';
import { buildSrLevelsViewModelBlock } from '../view-models/SrLevelsViewModel.js';
import { buildSrThesesViewModel } from '../view-models/SrThesesViewModel.js';
import { MarketThesisCard } from './MarketThesisCard.js';
import { SrLevelsCard } from './SrLevelsCard.js';
import { SrThesesPanel } from './SrThesesPanel.js';

type SrThesesUnavailableReason = 'not-found' | 'config-error' | 'upstream-error';

type Props = {
  srLevels: SrLevelsBlock | null | undefined;
  isLoading: boolean;
  isError: boolean;
  isUnsupported: boolean;
  isMixedPools: boolean;
  poolLabel: string | null;
  now: number;
  srTheses?: SrThesesBlock | null | undefined;
  srThesesLoading?: boolean;
  srThesesError?: boolean;
  srThesesUnsupported?: boolean;
  srThesesUnavailableReason?: SrThesesUnavailableReason | null;
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

function unavailableCopy(reason: SrThesesUnavailableReason | null | undefined, hasV1Data: boolean) {
  if (hasV1Data) return null;
  if (reason === 'not-found') return 'No S/R analysis available yet';
  if (reason === 'config-error' || reason === 'upstream-error') return 'S/R analysis unavailable';
  return null;
}

export function SrInsightsSection({
  srLevels,
  isLoading,
  isError,
  isUnsupported,
  isMixedPools,
  poolLabel,
  now,
  srTheses,
  srThesesLoading = false,
  srThesesError = false,
  srThesesUnsupported = false,
  srThesesUnavailableReason = null,
}: Props): JSX.Element | null {
  if (isMixedPools) {
    return (
      <View style={cardStyle}>
        <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
          Market context unavailable for mixed pools
        </Text>
      </View>
    );
  }

  if (srTheses != null && srTheses.theses.length > 0) {
    const vm = buildSrThesesViewModel(srTheses, now);
    return (
      <View style={{ marginHorizontal: 16 }}>
        {poolLabel ? (
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: typography.fontSize.xs,
              marginBottom: 4,
            }}
          >
            {poolLabel}
          </Text>
        ) : null}
        <SrThesesPanel vm={vm} />
        {srThesesError ? (
          <Text style={{ color: colors.warn, fontSize: typography.fontSize.xs, marginTop: 4 }}>
            Refresh failed - showing last available analysis.
          </Text>
        ) : null}
      </View>
    );
  }

  if (srThesesLoading && srTheses == null && srLevels == null && !isLoading) {
    return (
      <View testID="sr-insights-section-skeleton" style={{ ...cardStyle, alignItems: 'center' }}>
        <ActivityIndicator color={colors.safe} />
      </View>
    );
  }

  if (srLevels != null) {
    const vm = buildSrLevelsViewModelBlock(srLevels, now);
    const showDegraded = isError && !isUnsupported;
    return (
      <View style={{ marginHorizontal: 16 }}>
        {poolLabel ? (
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: typography.fontSize.xs,
              marginBottom: 4,
            }}
          >
            {poolLabel}
          </Text>
        ) : null}
        <SrLevelsCard srLevels={vm} />
        {vm.summary ? <MarketThesisCard summary={vm.summary} /> : null}
        {showDegraded ? (
          <Text style={{ color: colors.warn, fontSize: typography.fontSize.xs, marginTop: 4 }}>
            Refresh failed — showing last available analysis.
          </Text>
        ) : null}
      </View>
    );
  }

  if (isLoading && srLevels == null) {
    return (
      <View testID="sr-insights-section-skeleton" style={{ ...cardStyle, alignItems: 'center' }}>
        <ActivityIndicator color={colors.safe} />
      </View>
    );
  }

  const v2Copy = unavailableCopy(srThesesUnavailableReason, false);
  if (v2Copy != null) {
    return (
      <View style={cardStyle}>
        <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
          {v2Copy}
        </Text>
      </View>
    );
  }

  if (isUnsupported || srThesesUnsupported) {
    return (
      <View style={cardStyle}>
        <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
          S/R analysis unavailable
        </Text>
      </View>
    );
  }

  if (!isLoading && srLevels === undefined && !isError) {
    return null;
  }

  return (
    <View style={cardStyle}>
      <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
        S/R analysis unavailable
      </Text>
    </View>
  );
}

import { View, Text, ActivityIndicator } from 'react-native';
import type { SrLevelsBlock } from '@clmm/application/public';
import { colors, typography } from '../design-system/index.js';
import { buildSrLevelsViewModelBlock } from '../view-models/SrLevelsViewModel.js';
import { MarketThesisCard } from './MarketThesisCard.js';
import { SrLevelsCard } from './SrLevelsCard.js';

type Props = {
  srLevels: SrLevelsBlock | null | undefined;
  isLoading: boolean;
  isError: boolean;
  isUnsupported: boolean;
  isMixedPools: boolean;
  poolLabel: string | null;
  now: number;
};

export function MarketContextPanel({ srLevels, isLoading, isError, isUnsupported, isMixedPools, poolLabel, now }: Props): JSX.Element | null {
  if (isMixedPools) {
    return (
      <View
        style={{
          marginHorizontal: 16,
          marginTop: 14,
          padding: 16,
          backgroundColor: colors.surface,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
          Market context unavailable for mixed pools
        </Text>
      </View>
    );
  }

  if (isUnsupported && srLevels == null) {
    return (
      <View
        style={{
          marginHorizontal: 16,
          marginTop: 14,
          padding: 16,
          backgroundColor: colors.surface,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
          Market context unavailable
        </Text>
      </View>
    );
  }

  if (!isLoading && srLevels === undefined && !isError && !isUnsupported) {
    return null;
  }

  if (isLoading && srLevels == null) {
    return (
      <View
        testID="market-context-panel-skeleton"
        style={{
          marginHorizontal: 16,
          marginTop: 14,
          padding: 16,
          backgroundColor: colors.surface,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
        }}
      >
        <ActivityIndicator color={colors.safe} />
      </View>
    );
  }

  if (srLevels == null) {
    return (
      <View
        style={{
          marginHorizontal: 16,
          marginTop: 14,
          padding: 16,
          backgroundColor: colors.surface,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
          Market context unavailable
        </Text>
      </View>
    );
  }

  const vm = buildSrLevelsViewModelBlock(srLevels, now);
  const showDegraded = isError && !isUnsupported;

  return (
    <View style={{ marginHorizontal: 16 }}>
      {poolLabel ? (
        <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs, marginBottom: 4 }}>
          {poolLabel}
        </Text>
      ) : null}
      {vm.summary ? <MarketThesisCard summary={vm.summary} /> : null}
      <SrLevelsCard srLevels={vm} />
      {showDegraded ? (
        <Text style={{ color: colors.warn, fontSize: typography.fontSize.xs, marginTop: 4 }}>
          Refresh failed — showing last available analysis.
        </Text>
      ) : null}
    </View>
  );
}
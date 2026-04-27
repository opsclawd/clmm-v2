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
  now: number;
};

export function MarketContextPanel({ srLevels, isLoading, isError, isUnsupported, now }: Props): JSX.Element | null {
  const showUnavailable = isError || isUnsupported || srLevels === null;

  if (showUnavailable && srLevels == null) {
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

  if (!isLoading && srLevels === undefined) {
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

  const block = srLevels as SrLevelsBlock;
  const vm = buildSrLevelsViewModelBlock(block, now);

  return (
    <View style={{ marginHorizontal: 16 }}>
      {vm.summary ? <MarketThesisCard summary={vm.summary} /> : null}
      <SrLevelsCard srLevels={vm} />
    </View>
  );
}
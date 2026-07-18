import { View, Text, TouchableOpacity } from 'react-native';
import type { PositionListItemViewModel } from '../view-models/PositionListViewModel.js';
import { colors, typography } from '../design-system/index.js';
import { Chip } from './Chip.js';
import { PairGlyph } from './PairGlyph.js';
import { RangeBar } from './RangeBar.js';
import {
  formatPoolId,
  getBreachSide,
  getMonitoringDisplay,
  getStatusChipProps,
  isNearEdge,
  splitTokenPair,
} from './PositionCardUtils.js';

type Props = {
  item: PositionListItemViewModel;
  onPress?: () => void;
};

function monitoringDotColor(tone: 'safe' | 'warn' | 'faint'): string {
  if (tone === 'safe') return colors.safe;
  if (tone === 'warn') return colors.warn;
  return colors.textFaint;
}

export function PositionCard({ item, onPress }: Props): JSX.Element {
  const {
    poolId,
    poolLabel,
    currentPrice,
    currentPriceLabel,
    lowerBoundPrice,
    upperBoundPrice,
    lowerBoundLabel,
    upperBoundLabel,
    rangeStatusKind,
    hasAlert,
    monitoringStatus,
    poolTvl,
    poolFees24h,
  } = item;

  const tokens = splitTokenPair(poolLabel);
  const truncatedPoolId = formatPoolId(poolId);
  const nearEdge = isNearEdge({ currentPrice, lowerBoundPrice, upperBoundPrice });
  const chip = getStatusChipProps({ rangeStatusKind, hasAlert, nearEdge });
  const monitoring = getMonitoringDisplay(monitoringStatus);

  const breachSide = getBreachSide(hasAlert, rangeStatusKind);

  const tvlValueColor = poolTvl.kind === 'available' ? colors.textPrimary : colors.textTertiary;
  const feesValueColor =
    poolFees24h.kind === 'available' ? colors.textPrimary : colors.textTertiary;

  return (
    <TouchableOpacity
      testID={`position-card-${poolId}`}
      accessibilityRole="button"
      accessibilityLabel={`Position card for ${poolLabel}, ${chip.label}`}
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        padding: 16,
        marginBottom: 10,
        marginHorizontal: 20,
      }}
    >
      {/* Top row: pair glyph + label + pool id, chip on the right */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <PairGlyph a={tokens.a} b={tokens.b} size={30} />
          <View>
            <Text
              style={{
                fontWeight: typography.fontWeight.semibold,
                fontSize: typography.fontSize.md,
                color: colors.textPrimary,
                letterSpacing: -0.01 * typography.fontSize.md,
              }}
            >
              {poolLabel}
            </Text>
            <Text
              style={{
                fontFamily: typography.fontFamily.mono,
                fontSize: 11,
                color: colors.textTertiary,
              }}
            >
              {truncatedPoolId}
            </Text>
          </View>
        </View>
        <Chip tone={chip.tone}>{chip.label}</Chip>
      </View>

      {/* Range bar */}
      <RangeBar
        lowerBoundPrice={lowerBoundPrice}
        upperBoundPrice={upperBoundPrice}
        currentPrice={currentPrice}
        lowerBoundLabel={lowerBoundLabel}
        upperBoundLabel={upperBoundLabel}
        currentPriceLabel={currentPriceLabel}
        {...(breachSide ? { breachSide } : {})}
      />

      {/* Bottom row: TVL · Fees 24h · Monitor */}
      <View
        style={{
          flexDirection: 'row',
          marginTop: 4,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: 0.08,
              color: colors.textTertiary,
              fontWeight: typography.fontWeight.semibold,
            }}
          >
            Pool TVL
          </Text>
          <Text
            style={{
              fontFamily: typography.fontFamily.mono,
              fontSize: 14,
              marginTop: 2,
              color: tvlValueColor,
            }}
          >
            {poolTvl.label}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: 0.08,
              color: colors.textTertiary,
              fontWeight: typography.fontWeight.semibold,
            }}
          >
            Pool fees · 24h
          </Text>
          <Text
            style={{
              fontFamily: typography.fontFamily.mono,
              fontSize: 14,
              marginTop: 2,
              color: feesValueColor,
            }}
          >
            {poolFees24h.label}
          </Text>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: 0.08,
              color: colors.textTertiary,
              fontWeight: typography.fontWeight.semibold,
            }}
          >
            Monitor
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                backgroundColor: monitoringDotColor(monitoring.tone),
                marginRight: 5,
              }}
            />
            <Text
              style={{
                fontSize: typography.fontSize.caption,
                color: colors.textBody,
              }}
            >
              {monitoring.text}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

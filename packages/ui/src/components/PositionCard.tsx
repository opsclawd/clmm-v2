import { View, Text, TouchableOpacity } from 'react-native';
import { colors, typography } from '../design-system/index.js';
import { Chip } from './Chip.js';
import { PairGlyph } from './PairGlyph.js';
import { RangeBar } from './RangeBar.js';
import {
  formatPoolId,
  getCardPlaceholderMetrics,
  getMonitoringDisplay,
  getStatusChipProps,
  isNearEdge,
  splitTokenPair,
} from './PositionCardUtils.js';

type Props = {
  poolId: string;
  poolLabel: string;
  currentPrice: number;
  currentPriceLabel: string;
  lowerBoundPrice: number;
  upperBoundPrice: number;
  lowerBoundLabel: string;
  upperBoundLabel: string;
  rangeStatusKind: 'in-range' | 'below-range' | 'above-range';
  hasAlert: boolean;
  monitoringLabel: string;
  onPress?: () => void;
};

function monitoringDotColor(tone: 'safe' | 'warn' | 'faint'): string {
  if (tone === 'safe') return colors.safe;
  if (tone === 'warn') return colors.warn;
  return colors.textFaint;
}

export function PositionCard({
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
  monitoringLabel,
  onPress,
}: Props): JSX.Element {
  const tokens = splitTokenPair(poolLabel);
  const truncatedPoolId = formatPoolId(poolId);
  const nearEdge = isNearEdge({ currentPrice, lowerBoundPrice, upperBoundPrice });
  const chip = getStatusChipProps({ rangeStatusKind, hasAlert, nearEdge });
  const monitoring = getMonitoringDisplay(monitoringLabel);
  const placeholders = getCardPlaceholderMetrics(poolId);

  const breachSide: 'below' | 'above' | undefined = hasAlert
    ? rangeStatusKind === 'below-range'
      ? 'below'
      : rangeStatusKind === 'above-range'
        ? 'above'
        : undefined
    : undefined;

  return (
    <TouchableOpacity
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
            TVL
          </Text>
          <Text
            style={{
              fontFamily: typography.fontFamily.mono,
              fontSize: 14,
              marginTop: 2,
              color: colors.textPrimary,
            }}
          >
            {placeholders.tvlLabel}
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
            Fees 24h
          </Text>
          <Text
            style={{
              fontFamily: typography.fontFamily.mono,
              fontSize: 14,
              marginTop: 2,
              color: colors.safe,
            }}
          >
            {placeholders.fees24hLabel}
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

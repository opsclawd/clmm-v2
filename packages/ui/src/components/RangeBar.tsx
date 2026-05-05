import { View, Text } from 'react-native';
import { colors, typography } from '../design-system/index.js';

export type RangeBarProps = {
  lowerBoundPrice: number;
  upperBoundPrice: number;
  currentPrice: number;
  lowerBoundLabel: string;
  upperBoundLabel: string;
  currentPriceLabel: string;
  breachSide?: 'below' | 'above';
};

const VISUAL_PAD_FRACTION = 0.35;
const TRACK_HEIGHT = 10;
const TICK_WIDTH = 2;
const TICK_HEIGHT = 22;

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function pricePercent(price: number, lo: number, hi: number): number {
  if (!Number.isFinite(price) || !Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) {
    return 50;
  }
  return clampPercent(((price - lo) / (hi - lo)) * 100);
}

export function RangeBar({
  lowerBoundPrice,
  upperBoundPrice,
  currentPrice,
  lowerBoundLabel,
  upperBoundLabel,
  currentPriceLabel,
  breachSide,
}: RangeBarProps): JSX.Element {
  const width = upperBoundPrice - lowerBoundPrice;
  const safeWidth = width > 0 ? width : 1;
  const pad = safeWidth * VISUAL_PAD_FRACTION;
  const lo = lowerBoundPrice - pad;
  const hi = upperBoundPrice + pad;

  const bandLeft = pricePercent(lowerBoundPrice, lo, hi);
  const bandRight = pricePercent(upperBoundPrice, lo, hi);
  const tickLeft = pricePercent(currentPrice, lo, hi);

  const tickColor = breachSide ? colors.breachAccent : colors.textPrimary;

  return (
    <View style={{ paddingTop: 8, paddingBottom: 32, paddingHorizontal: 4 }}>
      <View style={{ position: 'relative', height: TRACK_HEIGHT }}>
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: 'rgba(255,255,255,0.05)',
            borderRadius: 999,
          }}
        />
        <View
          testID={breachSide === 'below' ? 'range-bar-breach-below' : undefined}
          style={{
            position: 'absolute',
            left: 0,
            width: `${bandLeft}%`,
            top: 0,
            bottom: 0,
            backgroundColor:
              breachSide === 'below' ? 'rgba(245,148,132,0.30)' : 'rgba(245,148,132,0.12)',
            borderTopLeftRadius: 999,
            borderBottomLeftRadius: 999,
          }}
        />
        <View
          testID={breachSide === 'above' ? 'range-bar-breach-above' : undefined}
          style={{
            position: 'absolute',
            right: 0,
            width: `${100 - bandRight}%`,
            top: 0,
            bottom: 0,
            backgroundColor:
              breachSide === 'above' ? 'rgba(245,148,132,0.30)' : 'rgba(245,148,132,0.12)',
            borderTopRightRadius: 999,
            borderBottomRightRadius: 999,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: `${bandLeft}%`,
            width: `${Math.max(0, bandRight - bandLeft)}%`,
            top: 0,
            bottom: 0,
            backgroundColor: 'rgba(158,236,209,0.18)',
            borderLeftWidth: 1,
            borderRightWidth: 1,
            borderColor: colors.borderMedium,
          }}
        />
        <View
          testID="range-bar-tick"
          style={{
            position: 'absolute',
            left: `${tickLeft}%`,
            top: -6,
            width: TICK_WIDTH,
            height: TICK_HEIGHT,
            backgroundColor: tickColor,
            borderRadius: 2,
            transform: [{ translateX: -TICK_WIDTH / 2 }],
          }}
        />
      </View>

      <View
        style={{
          position: 'relative',
          marginTop: 12,
          height: 14,
        }}
      >
        <Text
          style={{
            position: 'absolute',
            left: `${bandLeft}%`,
            transform: [{ translateX: -20 }],
            fontFamily: typography.fontFamily.mono,
            fontSize: typography.fontSize.micro,
            color: colors.textTertiary,
          }}
        >
          {lowerBoundLabel}
        </Text>
        <Text
          style={{
            position: 'absolute',
            left: `${tickLeft}%`,
            transform: [{ translateX: -20 }],
            fontFamily: typography.fontFamily.mono,
            fontSize: typography.fontSize.micro,
            color: breachSide ? colors.breachAccent : colors.textPrimary,
            fontWeight: typography.fontWeight.semibold,
          }}
        >
          {currentPriceLabel}
        </Text>
        <Text
          style={{
            position: 'absolute',
            left: `${bandRight}%`,
            transform: [{ translateX: -20 }],
            fontFamily: typography.fontFamily.mono,
            fontSize: typography.fontSize.micro,
            color: colors.textTertiary,
          }}
        >
          {upperBoundLabel}
        </Text>
      </View>
    </View>
  );
}

import { View, Text } from 'react-native';
import { colors, typography } from '../design-system/index.js';
import type { RangeBarDisplayState } from './RangeBarUtils.js';

export type RangeBarProps = {
  displayState: RangeBarDisplayState;
  lowerBoundLabel: string;
  upperBoundLabel: string;
  currentPriceLabel: string;
  breachSide?: 'below' | 'above';
};

const TRACK_HEIGHT = 10;
const TICK_WIDTH = 2;
const TICK_HEIGHT = 22;

export function RangeBar({
  displayState,
  lowerBoundLabel,
  upperBoundLabel,
  currentPriceLabel,
  breachSide,
}: RangeBarProps): JSX.Element {
  if (displayState.kind === 'unavailable') {
    return (
      <View
        testID="range-bar-unavailable"
        accessibilityLabel="Price range unavailable"
        style={{ paddingTop: 8, paddingBottom: 32, paddingHorizontal: 4 }}
      >
        <View style={{ height: TRACK_HEIGHT, backgroundColor: colors.border, borderRadius: 999 }} />
        <Text style={{ marginTop: 12, height: 14, color: colors.textTertiary }}>
          Price unavailable
        </Text>
      </View>
    );
  }

  const { bandLeftPercent, bandRightPercent, markerPercent } = displayState;

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
            width: `${bandLeftPercent}%`,
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
            width: `${100 - bandRightPercent}%`,
            top: 0,
            bottom: 0,
            backgroundColor:
              breachSide === 'above' ? 'rgba(245,148,132,0.30)' : 'rgba(245,148,132,0.12)',
            borderTopRightRadius: 999,
            borderBottomRightRadius: 999,
          }}
        />
        <View
          testID="range-bar-active-band"
          style={{
            position: 'absolute',
            left: `${bandLeftPercent}%`,
            width: `${Math.max(0, bandRightPercent - bandLeftPercent)}%`,
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
            left: `${markerPercent}%`,
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
            left: `${bandLeftPercent}%`,
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
            left: `${markerPercent}%`,
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
            left: `${bandRightPercent}%`,
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

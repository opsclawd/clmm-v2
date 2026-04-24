import { View, Text } from 'react-native';
import { colors, typography } from '../design-system/index.js';

export type ChipTone = 'safe' | 'warn' | 'breach';

type Props = {
  tone: ChipTone;
  children: React.ReactNode;
};

const toneStyles: Record<ChipTone, { text: string; border: string; dot: string; shadowColor: string }> = {
  safe: {
    text: colors.safe,
    border: 'rgba(158,236,209,0.30)',
    dot: colors.safe,
    shadowColor: colors.safe,
  },
  warn: {
    text: colors.warn,
    border: 'rgba(244,201,122,0.30)',
    dot: colors.warn,
    shadowColor: colors.warn,
  },
  breach: {
    text: colors.breachAccent,
    border: 'rgba(245,148,132,0.30)',
    dot: colors.breachAccent,
    shadowColor: colors.breachAccent,
  },
};

const CHIP_HEIGHT = 24;
const CHIP_PADDING_HORIZONTAL = 10;
const CHIP_BORDER_RADIUS = 999;
const DOT_SIZE = 6;
const LETTER_SPACING_FACTOR = 0.02;

export function Chip({ tone, children }: Props): JSX.Element {
  const style = toneStyles[tone];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: CHIP_HEIGHT,
        paddingHorizontal: CHIP_PADDING_HORIZONTAL,
        borderRadius: CHIP_BORDER_RADIUS,
        borderWidth: 1,
        borderColor: style.border,
        alignSelf: 'flex-start',
      }}
    >
      <View
        style={{
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: CHIP_BORDER_RADIUS,
          backgroundColor: style.dot,
          marginRight: DOT_SIZE,
          shadowColor: style.shadowColor,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.5,
          shadowRadius: 4,
        }}
      />
      <Text
        style={{
          color: style.text,
          fontSize: typography.fontSize.micro,
          fontWeight: typography.fontWeight.semibold,
          letterSpacing: LETTER_SPACING_FACTOR * typography.fontSize.micro,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

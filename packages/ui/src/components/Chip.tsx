import { View, Text } from 'react-native';
import { colors, typography } from '../design-system/index.js';

export type ChipTone = 'safe' | 'warn' | 'breach';

type Props = {
  tone: ChipTone;
  children: React.ReactNode;
};

const toneStyles: Record<ChipTone, { text: string; border: string; dot: string; glow?: string }> = {
  safe: {
    text: colors.safe,
    border: 'rgba(158,236,209,0.30)',
    dot: colors.safe,
    glow: '0 0 8px rgba(158,236,209,0.5)',
  },
  warn: {
    text: colors.warn,
    border: 'rgba(244,201,122,0.30)',
    dot: colors.warn,
  },
  breach: {
    text: colors.breachAccent,
    border: 'rgba(245,148,132,0.30)',
    dot: colors.breachAccent,
    glow: '0 0 10px rgba(245,148,132,0.5)',
  },
};

export function Chip({ tone, children }: Props): JSX.Element {
  const style = toneStyles[tone];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 24,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: style.border,
        alignSelf: 'flex-start',
      }}
    >
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          backgroundColor: style.dot,
          ...(style.glow ? {
            shadowColor: style.dot,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.5,
            shadowRadius: 4,
          } : {}),
        }}
      />
      <Text
        style={{
          color: style.text,
          fontSize: typography.fontSize.micro,
          fontWeight: typography.fontWeight.semibold,
          letterSpacing: 0.02 * typography.fontSize.micro,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

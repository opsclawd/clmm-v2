import { View, Text } from 'react-native';
import { colors, typography } from '../design-system/index.js';

type TokenGlyphProps = {
  symbol: string;
  size: number;
  tint?: string;
};

function TokenGlyph({ symbol, size, tint }: TokenGlyphProps): JSX.Element {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1,
        borderColor: colors.borderMedium,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: tint ?? colors.textBody,
          fontFamily: typography.fontFamily.mono,
          fontSize: size * 0.36,
          fontWeight: typography.fontWeight.semibold,
        }}
      >
        {symbol.slice(0, 3)}
      </Text>
    </View>
  );
}

export type PairGlyphProps = {
  a: string;
  b: string;
  size?: number;
};

export function PairGlyph({ a, b, size = 28 }: PairGlyphProps): JSX.Element {
  return (
    <View
      style={{
        position: 'relative',
        width: size * 1.55,
        height: size,
      }}
    >
      <View style={{ position: 'absolute', left: 0, top: 0 }}>
        <TokenGlyph symbol={a} size={size} tint={colors.safe} />
      </View>
      <View style={{ position: 'absolute', left: size * 0.55, top: 0 }}>
        <TokenGlyph symbol={b} size={size} tint={colors.accent} />
      </View>
    </View>
  );
}

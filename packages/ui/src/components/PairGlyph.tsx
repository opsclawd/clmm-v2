import { View, Text } from 'react-native';
import { colors, typography } from '../design-system/index.js';
import { parsePairGlyphLabel } from './PositionCardUtils.js';

type TokenGlyphProps = {
  symbol: string;
  size: number;
  tint?: string;
};

function TokenGlyph({ symbol, size, tint }: TokenGlyphProps): JSX.Element {
  return (
    <View
      testID="token-glyph"
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
  label: string;
  size?: number;
};

export function PairGlyph({ label, size = 28 }: PairGlyphProps): JSX.Element {
  const parsed = parsePairGlyphLabel(label);

  if (parsed.kind === 'single') {
    return (
      <View
        testID="pair-glyph-single"
        accessible={false}
        style={{
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <TokenGlyph symbol={parsed.symbol} size={size} />
      </View>
    );
  }

  return (
    <View
      testID="pair-glyph-pair"
      accessible={false}
      style={{
        position: 'relative',
        width: size * 1.55,
        height: size,
      }}
    >
      <View style={{ position: 'absolute', left: 0, top: 0 }}>
        <TokenGlyph symbol={parsed.a} size={size} tint={colors.safe} />
      </View>
      <View style={{ position: 'absolute', left: size * 0.55, top: 0 }}>
        <TokenGlyph symbol={parsed.b} size={size} tint={colors.accent} />
      </View>
    </View>
  );
}

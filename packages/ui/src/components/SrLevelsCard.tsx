import { View, Text } from 'react-native';
import { colors, typography } from '../design-system/index.js';
import type { SrLevelsViewModelBlock } from '../view-models/PositionDetailViewModel.js';

const toneColors = {
  safe: { text: colors.safe, border: 'rgba(158,236,209,0.30)' },
  warn: { text: colors.warn, border: 'rgba(244,201,122,0.30)' },
  breach: { text: colors.breachAccent, border: 'rgba(245,148,132,0.30)' },
} as const;

type Props = {
  srLevels?: SrLevelsViewModelBlock | undefined;
};

export function SrLevelsCard({ srLevels }: Props): JSX.Element {
  if (!srLevels) {
    return (
      <Text style={{
        color: colors.textSecondary,
        fontSize: typography.fontSize.sm,
        marginTop: 16,
      }}>
        No current MCO levels available
      </Text>
    );
  }

  return (
    <View style={{
      marginTop: 14,
      padding: 16,
      backgroundColor: colors.surface,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    }}>
      <View style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
      }}>
        <Text style={{
          color: colors.textSecondary,
          fontSize: typography.fontSize.sm,
          fontWeight: typography.fontWeight.medium,
        }}>
          Support & Resistance
        </Text>
        <Text style={{
          fontSize: typography.fontSize.micro,
          color: colors.textMuted,
        }}>
          {srLevels.freshnessLabel}
        </Text>
      </View>

      {srLevels.levels.map((level, i) => {
        const tone = toneColors[level.tone];
        return (
          <View
            key={`sr-level-${i}`}
            testID={`sr-level-${i}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 10,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{
                height: 22,
                paddingHorizontal: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: tone.border,
                justifyContent: 'center',
                alignItems: 'center',
              }}>
                <Text style={{
                  fontSize: typography.fontSize.micro,
                  color: tone.text,
                  fontWeight: typography.fontWeight.semibold,
                }}>
                  {level.kind === 'resistance' ? 'Resist' : 'Support'}
                </Text>
              </View>
              <Text style={{
                fontFamily: typography.fontFamily.mono,
                fontSize: typography.fontSize.sm,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text,
              }}>
                {level.priceLabel}
              </Text>
            </View>
            {level.note ? (
              <Text style={{
                fontSize: typography.fontSize.micro,
                color: colors.textMuted,
                textAlign: 'right',
                maxWidth: 150,
              }}>
                {level.note}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

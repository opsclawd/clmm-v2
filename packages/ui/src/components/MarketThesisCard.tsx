import { View, Text } from 'react-native';
import { colors, typography } from '../design-system/index.js';

function InfoIcon(): JSX.Element {
  return (
    <View style={{
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.textMuted,
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <Text style={{
        fontSize: 10,
        color: colors.textMuted,
        fontWeight: typography.fontWeight.semibold,
        lineHeight: 14,
      }}>
        i
      </Text>
    </View>
  );
}

type Props = {
  summary: string;
};

export function MarketThesisCard({ summary }: Props): JSX.Element {
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
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
      }}>
        <InfoIcon />
        <Text style={{
          color: colors.textSecondary,
          fontSize: typography.fontSize.micro,
          fontWeight: typography.fontWeight.semibold,
          letterSpacing: 0.08,
          textTransform: 'uppercase',
        }}>
          Market Thesis
        </Text>
      </View>
      <Text style={{
        color: colors.text,
        fontSize: typography.fontSize.sm,
        lineHeight: typography.lineHeight.normal * typography.fontSize.sm,
        fontWeight: typography.fontWeight.medium,
      }}>
        {summary}
      </Text>
    </View>
  );
}

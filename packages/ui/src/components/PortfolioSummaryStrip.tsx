import { View, Text } from 'react-native';
import { colors, typography } from '../design-system/index.js';

const PORTFOLIO_VALUE = '$24,812';
const FEES_EARNED_VALUE = '+$142.30';

function SummaryCard({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor: string;
}): JSX.Element {
  return (
    <View
      style={{
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: colors.card,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.borderLight,
      }}
    >
      <Text
        style={{
          fontSize: typography.fontSize.micro,
          textTransform: 'uppercase',
          letterSpacing: 0.08 * typography.fontSize.micro,
          color: colors.textTertiary,
          fontWeight: typography.fontWeight.semibold,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: typography.fontFamily.mono,
          fontSize: 17,
          marginTop: 2,
          color: valueColor,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export function PortfolioSummaryStrip(): JSX.Element {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 20,
        paddingTop: 14,
        paddingBottom: 4,
      }}
    >
      <SummaryCard label="Portfolio" value={PORTFOLIO_VALUE} valueColor={colors.textPrimary} />
      <SummaryCard label="Fees earned" value={FEES_EARNED_VALUE} valueColor={colors.safe} />
    </View>
  );
}

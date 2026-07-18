import { View, Text } from 'react-native';
import type { FinancialMetricViewModel } from '../view-models/PositionListViewModel.js';
import { colors, typography } from '../design-system/index.js';

function SummaryCard({
  label,
  metric,
  testID,
}: {
  label: string;
  metric: FinancialMetricViewModel;
  testID: string;
}): JSX.Element {
  const isAvailable = metric.kind === 'available';
  const valueColor = isAvailable ? colors.textPrimary : colors.textTertiary;

  return (
    <View
      testID={testID}
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
        {metric.label}
      </Text>
    </View>
  );
}

export function PortfolioSummaryStrip({
  positionValue,
  unclaimedFees,
}: {
  positionValue: FinancialMetricViewModel;
  unclaimedFees: FinancialMetricViewModel;
}): JSX.Element {
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
      <SummaryCard testID="position-summary-value" label="Position value" metric={positionValue} />
      <SummaryCard
        testID="position-summary-unclaimed-fees"
        label="Unclaimed fees"
        metric={unclaimedFees}
      />
    </View>
  );
}

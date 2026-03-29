import { View, Text } from 'react-native';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import { getRangeStatusBadgeProps, type RangeStateKind } from './RangeStatusBadgeUtils.js';

export { getRangeStatusBadgeProps } from './RangeStatusBadgeUtils.js';

export function RangeStatusBadge({ rangeStateKind }: { rangeStateKind: RangeStateKind }) {
  const { label, colorKey } = getRangeStatusBadgeProps(rangeStateKind);
  const badgeColor = colors[colorKey];

  return (
    <View style={{
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 4,
      backgroundColor: `${badgeColor}20`,
    }}>
      <Text style={{
        color: badgeColor,
        fontSize: typography.fontSize.sm,
        fontWeight: typography.fontWeight.semibold,
      }}>
        {label}
      </Text>
    </View>
  );
}

import { View, Text } from 'react-native';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';

type Props = {
  note: string;
};

export function OffChainHistoryLabel({ note }: Props): JSX.Element {
  return (
    <View style={{
      marginTop: 8,
      paddingVertical: 6,
      paddingHorizontal: 12,
      backgroundColor: colors.surface,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
    }}>
      <Text style={{
        color: colors.textSecondary,
        fontSize: typography.fontSize.xs,
        fontStyle: 'italic',
      }}>
        {note}
      </Text>
    </View>
  );
}

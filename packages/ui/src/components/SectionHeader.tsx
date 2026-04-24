import { View, Text } from 'react-native';
import { colors, typography } from '../design-system/index.js';

type Props = {
  title: string;
  meta?: string;
};

export function SectionHeader({ title, meta }: Props): JSX.Element {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        marginTop: 22,
        marginBottom: 10,
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
        {title}
      </Text>
      {meta ? (
        <Text
          style={{
            fontSize: typography.fontSize.micro,
            color: colors.textFaint,
          }}
        >
          {meta}
        </Text>
      ) : null}
    </View>
  );
}

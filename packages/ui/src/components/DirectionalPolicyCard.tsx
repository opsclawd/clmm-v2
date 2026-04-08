import { View, Text } from 'react-native';
import type { BreachDirection } from '@clmm/application/public';
import { renderDirectionalPolicyText } from './DirectionalPolicyCardUtils.js';
import { colors } from '../design-system/index.js';

type Props = {
  direction: BreachDirection;
};

export function DirectionalPolicyCard({ direction }: Props): JSX.Element {
  const policy = renderDirectionalPolicyText(direction);
  return (
    <View style={{ padding: 16, borderRadius: 8, backgroundColor: colors.surface }}>
      <Text style={{ color: colors.text, fontWeight: 'bold' }}>{policy.directionLabel}</Text>
      <Text style={{ color: colors.textSecondary, marginTop: 4 }}>{policy.policyReason}</Text>
      <Text style={{ color: colors.primary, marginTop: 8, fontWeight: '600' }}>
        {policy.swapLabel} → {policy.postureLabel}
      </Text>
    </View>
  );
}

import { View, Text } from 'react-native';
import type { ExecutionLifecycleState, BreachDirection } from '@clmm/application/public';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import { buildExecutionStateViewModel } from '../view-models/ExecutionStateViewModel.js';
import { ExecutionStateCard } from '../components/ExecutionStateCard.js';
import { DirectionalPolicyCard } from '../components/DirectionalPolicyCard.js';

type Props = {
  lifecycleState?: ExecutionLifecycleState;
  breachDirection?: BreachDirection;
  retryEligible?: boolean;
};

export function SigningStatusScreen({ lifecycleState, breachDirection, retryEligible }: Props) {
  if (!lifecycleState) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
        <Text style={{ color: colors.text, fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold }}>
          Signing Status
        </Text>
        <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
          Loading signing status...
        </Text>
      </View>
    );
  }

  const viewModel = buildExecutionStateViewModel(lifecycleState, retryEligible ?? false);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
      <Text style={{
        color: colors.text,
        fontSize: typography.fontSize.xl,
        fontWeight: typography.fontWeight.bold,
        marginBottom: 16,
      }}>
        Signing Status
      </Text>

      {breachDirection ? (
        <View style={{ marginBottom: 16 }}>
          <DirectionalPolicyCard direction={breachDirection} />
        </View>
      ) : null}

      <ExecutionStateCard viewModel={viewModel} />
    </View>
  );
}

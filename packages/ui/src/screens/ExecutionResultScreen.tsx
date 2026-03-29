import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
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
  transactionSignature?: string;
  onRetry?: () => void;
  onViewHistory?: () => void;
};

export function ExecutionResultScreen({
  lifecycleState,
  breachDirection,
  retryEligible,
  transactionSignature,
  onRetry,
  onViewHistory,
}: Props) {
  if (!lifecycleState) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
        <Text style={{ color: colors.text, fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold }}>
          Execution Result
        </Text>
        <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
          Loading result...
        </Text>
      </View>
    );
  }

  const viewModel = buildExecutionStateViewModel(lifecycleState, retryEligible ?? false);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: 16 }}>
        <Text style={{
          color: colors.text,
          fontSize: typography.fontSize.xl,
          fontWeight: typography.fontWeight.bold,
          marginBottom: 16,
        }}>
          Execution Result
        </Text>

        {breachDirection ? (
          <View style={{ marginBottom: 16 }}>
            <DirectionalPolicyCard direction={breachDirection} />
          </View>
        ) : null}

        <ExecutionStateCard viewModel={viewModel} />

        {transactionSignature ? (
          <View style={{
            marginTop: 16,
            padding: 12,
            backgroundColor: colors.surface,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
          }}>
            <Text style={{
              color: colors.textSecondary,
              fontSize: typography.fontSize.sm,
            }}>
              Transaction
            </Text>
            <Text style={{
              color: colors.text,
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.medium,
              marginTop: 4,
            }}>
              {transactionSignature}
            </Text>
          </View>
        ) : null}

        {viewModel.showRetry ? (
          <TouchableOpacity
            onPress={onRetry}
            style={{
              marginTop: 20,
              padding: 16,
              backgroundColor: colors.primary,
              borderRadius: 8,
              alignItems: 'center',
            }}
          >
            <Text style={{
              color: colors.background,
              fontSize: typography.fontSize.base,
              fontWeight: typography.fontWeight.bold,
            }}>
              Retry
            </Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          onPress={onViewHistory}
          style={{
            marginTop: 12,
            padding: 16,
            backgroundColor: colors.surface,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
          }}
        >
          <Text style={{
            color: colors.text,
            fontSize: typography.fontSize.base,
            fontWeight: typography.fontWeight.semibold,
          }}>
            View History
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

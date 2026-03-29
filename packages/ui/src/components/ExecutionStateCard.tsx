import { View, Text } from 'react-native';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import type { ExecutionStateViewModel } from '../view-models/ExecutionStateViewModel.js';

type Props = {
  viewModel: ExecutionStateViewModel;
};

export function ExecutionStateCard({ viewModel }: Props) {
  return (
    <View style={{
      padding: 16,
      borderRadius: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    }}>
      <Text style={{
        color: colors.text,
        fontSize: typography.fontSize.lg,
        fontWeight: typography.fontWeight.bold,
      }}>
        {viewModel.title}
      </Text>

      <Text style={{
        color: colors.textSecondary,
        fontSize: typography.fontSize.base,
        marginTop: 4,
      }}>
        {viewModel.subtitle}
      </Text>

      {viewModel.partialCompletionWarning ? (
        <View style={{
          marginTop: 12,
          padding: 8,
          borderRadius: 4,
          backgroundColor: `${colors.warning}20`,
        }}>
          <Text style={{ color: colors.warning, fontSize: typography.fontSize.sm }}>
            {viewModel.partialCompletionWarning}
          </Text>
        </View>
      ) : null}

      {viewModel.nextAction ? (
        <Text style={{
          color: colors.primary,
          fontSize: typography.fontSize.base,
          fontWeight: typography.fontWeight.semibold,
          marginTop: 12,
        }}>
          {viewModel.nextAction}
        </Text>
      ) : null}
    </View>
  );
}

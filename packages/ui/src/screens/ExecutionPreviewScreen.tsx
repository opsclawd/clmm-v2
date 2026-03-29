import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import type { ExecutionPreviewDto } from '@clmm/application/public';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import { presentPreview } from '../presenters/PreviewPresenter.js';
import { DirectionalPolicyCard } from '../components/DirectionalPolicyCard.js';
import { PreviewStepSequence } from '../components/PreviewStepSequence.js';

type Props = {
  preview?: ExecutionPreviewDto;
  onApprove?: () => void;
  onRefresh?: () => void;
};

export function ExecutionPreviewScreen({ preview, onApprove, onRefresh }: Props) {
  if (!preview) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ padding: 16 }}>
          <Text style={{ color: colors.breach, fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold }}>
            Exit Preview
          </Text>
          <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
            Loading preview...
          </Text>
        </View>
      </ScrollView>
    );
  }

  const { preview: vm, canProceed, warningMessage } = presentPreview(preview);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: 16 }}>
        <Text style={{
          color: colors.breach,
          fontSize: typography.fontSize.lg,
          fontWeight: typography.fontWeight.bold,
        }}>
          Exit Preview
        </Text>

        <View style={{ marginTop: 16 }}>
          <DirectionalPolicyCard direction={preview.breachDirection} />
        </View>

        <View style={{ marginTop: 16 }}>
          <Text style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.semibold,
            marginBottom: 8,
          }}>
            Execution Steps
          </Text>
          <PreviewStepSequence direction={preview.breachDirection} />
        </View>

        <View style={{
          marginTop: 16,
          padding: 12,
          backgroundColor: colors.surface,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
        }}>
          <Text style={{
            color: vm.isFresh ? colors.primary : vm.isStale ? colors.warning : colors.danger,
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.semibold,
          }}>
            {vm.freshnessLabel}
          </Text>
        </View>

        {warningMessage ? (
          <View style={{
            marginTop: 12,
            padding: 12,
            backgroundColor: `${colors.warning}20`,
            borderRadius: 8,
          }}>
            <Text style={{
              color: colors.warning,
              fontSize: typography.fontSize.sm,
            }}>
              {warningMessage}
            </Text>
          </View>
        ) : null}

        {canProceed ? (
          <TouchableOpacity
            onPress={onApprove}
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
              Sign and Execute Exit
            </Text>
          </TouchableOpacity>
        ) : null}

        {vm.requiresRefresh ? (
          <TouchableOpacity
            onPress={onRefresh}
            style={{
              marginTop: 12,
              padding: 16,
              backgroundColor: colors.surface,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.warning,
              alignItems: 'center',
            }}
          >
            <Text style={{
              color: colors.warning,
              fontSize: typography.fontSize.base,
              fontWeight: typography.fontWeight.semibold,
            }}>
              Refresh Quote
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </ScrollView>
  );
}

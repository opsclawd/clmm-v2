import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import type { PositionDetailDto } from '@clmm/application/public';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import { presentPositionDetail } from '../presenters/PositionDetailPresenter.js';
import { RangeStatusBadge } from '../components/RangeStatusBadge.js';
import { DirectionalPolicyCard } from '../components/DirectionalPolicyCard.js';

type Props = {
  position?: PositionDetailDto;
  onViewPreview?: (triggerId: string) => void;
};

export function PositionDetailScreen({ position, onViewPreview }: Props): JSX.Element {
  if (!position) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
        <Text style={{ color: colors.text, fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold }}>
          Position Detail
        </Text>
        <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
          Loading position...
        </Text>
      </View>
    );
  }

  const presentation = presentPositionDetail({ position });
  const vm = presentation.position;
  const breachDirection = position.breachDirection;
  const triggerId = position.triggerId;
  const canViewPreview = position.hasActionableTrigger && breachDirection != null && triggerId != null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{
            color: colors.text,
            fontSize: typography.fontSize.xl,
            fontWeight: typography.fontWeight.bold,
          }}>
            {vm.poolLabel}
          </Text>
          <RangeStatusBadge rangeStateKind={position.rangeState} />
        </View>

        <View style={{
          marginTop: 16,
          padding: 16,
          backgroundColor: colors.surface,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
        }}>
          <Text style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.sm,
          }}>
            Range Bounds
          </Text>
          <Text style={{
            color: colors.text,
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            marginTop: 4,
          }}>
            {vm.rangeBoundsLabel}
          </Text>
          <Text style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.sm,
            marginTop: 8,
          }}>
            {vm.currentPriceLabel}
          </Text>
        </View>

        {vm.breachDirectionLabel ? (
          <View style={{
            marginTop: 12,
            padding: 12,
            backgroundColor: `${colors.breach}20`,
            borderRadius: 8,
          }}>
            <Text style={{
              color: colors.breach,
              fontSize: typography.fontSize.base,
              fontWeight: typography.fontWeight.semibold,
            }}>
              {vm.breachDirectionLabel}
            </Text>
          </View>
        ) : null}

        {canViewPreview ? (
          <View style={{ marginTop: 16 }}>
            <DirectionalPolicyCard direction={breachDirection} />

            <TouchableOpacity
              onPress={() => onViewPreview?.(triggerId)}
              style={{
                marginTop: 16,
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
                View Exit Preview
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={{
          marginTop: 16,
          padding: 12,
          backgroundColor: colors.surface,
          borderRadius: 8,
        }}>
          <Text style={{
            color: vm.hasAlert ? colors.danger : colors.textSecondary,
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.medium,
          }}>
            {vm.alertLabel}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

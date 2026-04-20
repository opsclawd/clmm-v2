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

const srStyles = {
  sectionTitle: {
    color: colors.text,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    marginTop: 20,
    marginBottom: 8,
  },
  subsectionTitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    marginTop: 8,
    marginBottom: 4,
  },
  levelRow: {
    color: colors.text,
    fontSize: typography.fontSize.sm,
    marginTop: 2,
  },
  freshnessLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    marginTop: 8,
  },
  staleLabel: {
    color: '#f59e0b',
    fontSize: typography.fontSize.xs,
    marginTop: 8,
  },
  muted: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginTop: 16,
  },
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

  const presentation = presentPositionDetail({ position, now: Date.now() });
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

        {vm.srLevels ? (
          <View style={{ marginTop: 4 }}>
            <Text style={srStyles.sectionTitle}>
              Support & Resistance (MCO)
            </Text>
            <Text style={srStyles.subsectionTitle}>Support</Text>
            {vm.srLevels.supportsSorted.map((s, i) => (
              <Text key={`s-${i}`} testID={`sr-support-${i}`} style={srStyles.levelRow}>
                {s.priceLabel}{s.rankLabel ? ` (${s.rankLabel})` : ''}
              </Text>
            ))}
            <Text style={srStyles.subsectionTitle}>Resistance</Text>
            {vm.srLevels.resistancesSorted.map((r, i) => (
              <Text key={`r-${i}`} testID={`sr-resistance-${i}`} style={srStyles.levelRow}>
                {r.priceLabel}{r.rankLabel ? ` (${r.rankLabel})` : ''}
              </Text>
            ))}
            <Text testID="sr-freshness" style={vm.srLevels.isStale ? srStyles.staleLabel : srStyles.freshnessLabel}>
              {vm.srLevels.freshnessLabel}
            </Text>
          </View>
        ) : (
          <Text style={srStyles.muted}>No current MCO levels available</Text>
        )}
      </View>
    </ScrollView>
  );
}

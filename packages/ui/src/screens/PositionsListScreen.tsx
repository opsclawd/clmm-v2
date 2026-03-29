import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import type { PositionSummaryDto } from '@clmm/application/public';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import { buildPositionListViewModel } from '../view-models/PositionListViewModel.js';
import { RangeStatusBadge } from '../components/RangeStatusBadge.js';

type Props = {
  positions?: PositionSummaryDto[];
  onSelectPosition?: (positionId: string) => void;
};

export function PositionsListScreen({ positions, onSelectPosition }: Props) {
  const viewModel = buildPositionListViewModel(positions ?? []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
      <Text style={{
        color: colors.text,
        fontSize: typography.fontSize.xl,
        fontWeight: typography.fontWeight.bold,
      }}>
        Positions
      </Text>

      {viewModel.isEmpty ? (
        <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
          Connect wallet to view supported Orca positions.
        </Text>
      ) : (
        <FlatList
          data={viewModel.items}
          keyExtractor={(item) => item.positionId}
          style={{ marginTop: 12 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => onSelectPosition?.(item.positionId)}
              style={{
                padding: 16,
                backgroundColor: colors.surface,
                borderRadius: 8,
                marginBottom: 8,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{
                      color: colors.text,
                      fontSize: typography.fontSize.base,
                      fontWeight: typography.fontWeight.semibold,
                    }}>
                      {item.poolLabel}
                    </Text>
                    {item.hasAlert ? (
                      <View style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: colors.danger,
                        marginLeft: 8,
                      }} />
                    ) : null}
                  </View>
                  <Text style={{
                    color: colors.textSecondary,
                    fontSize: typography.fontSize.sm,
                    marginTop: 4,
                  }}>
                    {item.monitoringLabel}
                  </Text>
                </View>
                <RangeStatusBadge rangeStateKind={item.rangeStatusKind} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import type { HistoryEventDto } from '@clmm/application/public';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import { buildHistoryViewModel } from '../view-models/HistoryViewModel.js';
import { OffChainHistoryLabel } from '../components/OffChainHistoryLabel.js';

type Props = {
  events?: HistoryEventDto[];
  onSelectEvent?: (eventId: string) => void;
};

export function HistoryListScreen({ events, onSelectEvent }: Props) {
  const viewModel = buildHistoryViewModel(events ?? []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
      <Text style={{
        color: colors.text,
        fontSize: typography.fontSize.xl,
        fontWeight: typography.fontWeight.bold,
      }}>
        History
      </Text>

      <OffChainHistoryLabel note={viewModel.offChainNote} />

      {viewModel.isEmpty ? (
        <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
          No execution history yet.
        </Text>
      ) : (
        <FlatList
          data={viewModel.items}
          keyExtractor={(item) => item.eventId}
          style={{ marginTop: 12 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => onSelectEvent?.(item.eventId)}
              style={{
                paddingVertical: 12,
                paddingHorizontal: 16,
                backgroundColor: colors.surface,
                borderRadius: 8,
                marginBottom: 8,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    color: colors.text,
                    fontSize: typography.fontSize.base,
                    fontWeight: typography.fontWeight.medium,
                  }}>
                    {item.eventTypeLabel}
                  </Text>
                  {item.transactionSignatureShort ? (
                    <Text style={{
                      color: colors.textSecondary,
                      fontSize: typography.fontSize.xs,
                      marginTop: 2,
                    }}>
                      tx: {item.transactionSignatureShort}
                    </Text>
                  ) : null}
                </View>
                <Text style={{
                  color: colors.textSecondary,
                  fontSize: typography.fontSize.sm,
                }}>
                  {item.occurredAtLabel}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

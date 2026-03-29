import { View, Text, FlatList } from 'react-native';
import type { HistoryEventDto } from '@clmm/application/public';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import { HistoryEventRow } from '../components/HistoryEventRow.js';

type Props = {
  positionId?: string;
  events?: HistoryEventDto[];
};

function breachDirectionLabel(direction: { kind: string }): string {
  return direction.kind === 'lower-bound-breach'
    ? 'Lower Bound Breach — Exit to USDC'
    : 'Upper Bound Breach — Exit to SOL';
}

export function HistoryDetailScreen({ positionId, events }: Props) {
  const eventItems = events ?? [];
  const isEmpty = eventItems.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
      <Text style={{
        color: colors.text,
        fontSize: typography.fontSize.xl,
        fontWeight: typography.fontWeight.bold,
      }}>
        History Detail
      </Text>

      {positionId ? (
        <Text style={{
          color: colors.textSecondary,
          fontSize: typography.fontSize.sm,
          marginTop: 4,
        }}>
          Position: {positionId}
        </Text>
      ) : null}

      {!isEmpty && eventItems[0] ? (
        <View style={{
          marginTop: 12,
          padding: 12,
          backgroundColor: colors.surface,
          borderRadius: 8,
        }}>
          <Text style={{
            color: colors.breach,
            fontSize: typography.fontSize.base,
            fontWeight: typography.fontWeight.semibold,
          }}>
            {breachDirectionLabel(eventItems[0].breachDirection)}
          </Text>
        </View>
      ) : null}

      {isEmpty ? (
        <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
          No events for this position.
        </Text>
      ) : (
        <FlatList
          data={eventItems}
          keyExtractor={(item) => item.eventId}
          style={{ marginTop: 12 }}
          renderItem={({ item }) => (
            <HistoryEventRow event={item} />
          )}
        />
      )}
    </View>
  );
}

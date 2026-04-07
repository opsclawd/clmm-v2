import { View, Text } from 'react-native';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import type { HistoryEventDto } from '@clmm/application/public';

function formatEventType(eventType: string): string {
  return eventType
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getEventColor(eventType: string): string {
  switch (eventType) {
    case 'confirmed':
      return colors.primary;
    case 'failed':
    case 'partial-completion':
      return colors.danger;
    case 'trigger-created':
    case 'preview-created':
      return colors.breach;
    case 'abandoned':
    case 'signature-declined':
      return colors.textSecondary;
    default:
      return colors.text;
  }
}

type Props = {
  event: HistoryEventDto;
};

export function HistoryEventRow({ event }: Props): JSX.Element {
  const eventColor = getEventColor(event.eventType);

  return (
    <View style={{
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}>
      <View style={{ flex: 1 }}>
        <Text style={{
          color: eventColor,
          fontSize: typography.fontSize.base,
          fontWeight: typography.fontWeight.medium,
        }}>
          {formatEventType(event.eventType)}
        </Text>
        {event.transactionReference ? (
          <Text style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.xs,
            marginTop: 2,
          }}>
            tx: {event.transactionReference.signature.slice(0, 8)}...
          </Text>
        ) : null}
      </View>
      <Text style={{
        color: colors.textSecondary,
        fontSize: typography.fontSize.sm,
      }}>
        {new Date(event.occurredAt).toLocaleTimeString()}
      </Text>
    </View>
  );
}

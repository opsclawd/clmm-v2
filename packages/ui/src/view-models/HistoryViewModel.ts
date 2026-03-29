import type { HistoryEventDto } from '@clmm/application/public';

export type HistoryItemViewModel = {
  eventId: string;
  eventTypeLabel: string;
  occurredAtLabel: string;
  hasTransaction: boolean;
  transactionSignatureShort?: string;
};

export type HistoryViewModel = {
  items: HistoryItemViewModel[];
  isEmpty: boolean;
};

function formatEventType(eventType: string): string {
  return eventType
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function buildHistoryViewModel(events: HistoryEventDto[]): HistoryViewModel {
  const items: HistoryItemViewModel[] = events.map((e) => {
    const base = {
      eventId: e.eventId,
      eventTypeLabel: formatEventType(e.eventType),
      occurredAtLabel: new Date(e.occurredAt).toLocaleString(),
      hasTransaction: !!e.transactionReference,
    };

    if (e.transactionReference) {
      return {
        ...base,
        transactionSignatureShort: `${e.transactionReference.signature.slice(0, 8)}...`,
      };
    }

    return base;
  });

  return { items, isEmpty: items.length === 0 };
}

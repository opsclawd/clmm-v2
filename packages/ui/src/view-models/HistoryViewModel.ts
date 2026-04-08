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
  offChainNote: string;
};

function formatEventType(eventType: string): string {
  return eventType
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function buildHistoryViewModel(events: HistoryEventDto[]): HistoryViewModel {
  // UX-DR9: reverse-chronological order (most recent first)
  const sorted = [...events].sort((a, b) => b.occurredAt - a.occurredAt);

  const items: HistoryItemViewModel[] = sorted.map((e) => {
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

  return {
    items,
    isEmpty: items.length === 0,
    offChainNote: 'off-chain operational history — not an on-chain receipt or attestation',
  };
}

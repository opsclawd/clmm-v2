import { describe, it, expect } from 'vitest';
import { buildHistoryViewModel } from './HistoryViewModel.js';
import { makeClockTimestamp, makePositionId } from '@clmm/application/public';
import type { HistoryEventDto } from '@clmm/application/public';

function makeEvent(overrides: { eventId: string; occurredAt: number } & Omit<Partial<HistoryEventDto>, 'occurredAt'>): HistoryEventDto {
  const base: HistoryEventDto = {
    eventId: overrides.eventId,
    positionId: overrides.positionId ?? makePositionId('pos-1'),
    eventType: overrides.eventType ?? 'trigger-created',
    breachDirection: overrides.breachDirection ?? { kind: 'lower-bound-breach' },
    occurredAt: makeClockTimestamp(overrides.occurredAt),
    note: 'off-chain operational history — not an on-chain receipt or attestation',
  };

  if (overrides.transactionReference) {
    base.transactionReference = overrides.transactionReference;
  }

  return base;
}

describe('HistoryViewModel', () => {
  it('sorts events in reverse-chronological order (most recent first)', () => {
    const events: HistoryEventDto[] = [
      makeEvent({ eventId: 'oldest', occurredAt: 1000 }),
      makeEvent({ eventId: 'middle', occurredAt: 2000 }),
      makeEvent({ eventId: 'newest', occurredAt: 3000 }),
    ];

    const vm = buildHistoryViewModel(events);

    expect(vm.items[0]!.eventId).toBe('newest');
    expect(vm.items[1]!.eventId).toBe('middle');
    expect(vm.items[2]!.eventId).toBe('oldest');
  });

  it('returns isEmpty=true for empty array', () => {
    const vm = buildHistoryViewModel([]);
    expect(vm.isEmpty).toBe(true);
    expect(vm.items).toEqual([]);
  });

  it('includes offChainNote in view-model items', () => {
    const events: HistoryEventDto[] = [
      makeEvent({ eventId: 'e1', occurredAt: 1000 }),
    ];

    const vm = buildHistoryViewModel(events);
    expect(vm.offChainNote).toBe('off-chain operational history — not an on-chain receipt or attestation');
  });

  it('formats event type from kebab-case to title case', () => {
    const events: HistoryEventDto[] = [
      makeEvent({ eventId: 'e1', occurredAt: 1000, eventType: 'trigger-created' }),
    ];

    const vm = buildHistoryViewModel(events);
    expect(vm.items[0]!.eventTypeLabel).toBe('Trigger Created');
  });

  it('truncates transaction signature to first 8 chars', () => {
    const events: HistoryEventDto[] = [
      makeEvent({
        eventId: 'e1',
        occurredAt: 1000,
        transactionReference: { signature: 'abcdef1234567890xyz', stepKind: 'swap-assets' },
      }),
    ];

    const vm = buildHistoryViewModel(events);
    expect(vm.items[0]!.transactionSignatureShort).toBe('abcdef12...');
  });
});

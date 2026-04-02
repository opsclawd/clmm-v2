import type { HistoryEventDto } from '@clmm/application/public';
import { fetchJson } from './http.js';

type HistoryResponse = {
  history: HistoryEventDto[];
};

export async function fetchExecutionHistory(walletId: string): Promise<HistoryEventDto[]> {
  try {
    // History is per-position; for the list view we fetch all positions' history
    // The BFF serves history per positionId, so we'll need the walletId to get positions first
    // For MVP, the history tab fetches all history events across positions via a dedicated endpoint
    const payload = (await fetchJson(`/executions/history/${walletId}`)) as Partial<HistoryResponse>;
    if (!Array.isArray(payload.history)) {
      throw new Error('Malformed history response');
    }
    return payload.history;
  } catch (cause: unknown) {
    throw new Error('Could not load execution history', { cause });
  }
}

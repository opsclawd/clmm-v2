import type { ActionableAlertDto } from '@clmm/application/public';
import { fetchJson } from './http.js';

type AlertsResponse = {
  alerts: ActionableAlertDto[];
};

export async function fetchAlerts(walletId: string): Promise<ActionableAlertDto[]> {
  try {
    const payload = (await fetchJson(`/alerts/${walletId}`)) as Partial<AlertsResponse>;
    if (!Array.isArray(payload.alerts)) {
      throw new Error('Malformed alerts response');
    }
    return payload.alerts;
  } catch (cause: unknown) {
    throw new Error('Could not load alerts', { cause });
  }
}

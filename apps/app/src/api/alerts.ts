import type { ActionableAlertDto, BreachDirection } from '@clmm/application/public';
import { fetchJson } from './http';

type AlertsResponse = {
  alerts: ActionableAlertDto[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBreachDirection(value: unknown): value is BreachDirection {
  return (
    isRecord(value) &&
    (value['kind'] === 'lower-bound-breach' || value['kind'] === 'upper-bound-breach')
  );
}

function isActionableAlertDto(value: unknown): value is ActionableAlertDto {
  return (
    isRecord(value) &&
    typeof value['triggerId'] === 'string' &&
    typeof value['positionId'] === 'string' &&
    typeof value['triggeredAt'] === 'number' &&
    isBreachDirection(value['breachDirection']) &&
    (value['previewId'] == null || typeof value['previewId'] === 'string')
  );
}

function isActionableAlertDtoArray(value: unknown): value is ActionableAlertDto[] {
  return Array.isArray(value) && value.every(isActionableAlertDto);
}

function isAlertsResponse(value: unknown): value is AlertsResponse {
  return isRecord(value) && isActionableAlertDtoArray(value['alerts']);
}

export async function fetchAlerts(walletId: string): Promise<ActionableAlertDto[]> {
  try {
    const payload = await fetchJson(`/alerts/${walletId}`);

    if (!isAlertsResponse(payload)) {
      throw new Error('Malformed alerts response');
    }

    return payload.alerts;
  } catch (cause: unknown) {
    throw new Error('Could not load alerts', { cause });
  }
}

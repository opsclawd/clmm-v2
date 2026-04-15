import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ActionableAlertDto } from '@clmm/application/public';
import { AlertsListScreen } from './AlertsListScreen.js';

afterEach(() => {
  cleanup();
});

function brand<T>(value: string): T {
  return value as T;
}

function makeAlert(overrides: Partial<ActionableAlertDto> = {}): ActionableAlertDto {
  return {
    triggerId: brand<ActionableAlertDto['triggerId']>('trigger-1'),
    positionId: brand<ActionableAlertDto['positionId']>('position-1'),
    breachDirection: { kind: 'lower-bound-breach' },
    triggeredAt: brand<ActionableAlertDto['triggeredAt']>('2026-04-15T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AlertsListScreen', () => {
  it('calls onSelectAlert with the trigger and position ids when an alert row is tapped', () => {
    const onSelectAlert = vi.fn();

    render(
      <AlertsListScreen
        alerts={[
          makeAlert({
            triggerId: brand<ActionableAlertDto['triggerId']>('trig-tap-test'),
            positionId: brand<ActionableAlertDto['positionId']>('pos-tap-test'),
          }),
        ]}
        onSelectAlert={onSelectAlert}
      />,
    );

    fireEvent.click(screen.getByText('Position: pos-tap-test'));
    expect(onSelectAlert).toHaveBeenCalledWith('trig-tap-test', 'pos-tap-test');
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { dispatchActionableNotification } from './DispatchActionableNotification.js';
import {
  FakeNotificationPort,
  FakeIdGeneratorPort,
  FIXTURE_POSITION_ID,
  FIXTURE_WALLET_ID,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH } from '@clmm/domain';
import type { ExitTriggerId } from '@clmm/domain';

const TRIGGER_ID = 'trigger-1' as ExitTriggerId;

describe('DispatchActionableNotification', () => {
  let notificationPort: FakeNotificationPort;

  beforeEach(() => {
    notificationPort = new FakeNotificationPort();
    void new FakeIdGeneratorPort();
  });

  it('dispatches notification with breach direction for lower-bound trigger', async () => {
    await dispatchActionableNotification({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      triggerId: TRIGGER_ID,
      breachDirection: LOWER_BOUND_BREACH,
      notificationPort,
    });
    expect(notificationPort.dispatched).toHaveLength(1);
    expect(notificationPort.dispatched[0]?.breachDirection.kind).toBe('lower-bound-breach');
  });

  it('dispatches notification with breach direction for upper-bound trigger', async () => {
    await dispatchActionableNotification({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      triggerId: TRIGGER_ID,
      breachDirection: UPPER_BOUND_BREACH,
      notificationPort,
    });
    expect(notificationPort.dispatched[0]?.breachDirection.kind).toBe('upper-bound-breach');
  });
});

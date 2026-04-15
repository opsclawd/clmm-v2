import { describe, it, expect, beforeEach } from 'vitest';
import { dispatchActionableNotification } from './DispatchActionableNotification.js';
import {
  FakeNotificationPort,
  FakeNotificationDedupPort,
  FIXTURE_POSITION_ID,
  FIXTURE_WALLET_ID,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH } from '@clmm/domain';
import type { ExitTriggerId } from '@clmm/domain';

const TRIGGER_ID = 'trigger-1' as ExitTriggerId;
const TRIGGER_ID_2 = 'trigger-2' as ExitTriggerId;

describe('DispatchActionableNotification', () => {
  let notificationPort: FakeNotificationPort;
  let notificationDedupPort: FakeNotificationDedupPort;

  beforeEach(() => {
    notificationPort = new FakeNotificationPort();
    notificationDedupPort = new FakeNotificationDedupPort();
  });

  it('dispatches for lower-bound-breach and returns dispatched=true', async () => {
    const result = await dispatchActionableNotification({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      triggerId: TRIGGER_ID,
      breachDirection: LOWER_BOUND_BREACH,
      notificationPort,
      notificationDedupPort,
    });

    expect(result.dispatched).toBe(true);
    expect(result.deliveredAt).not.toBeNull();
    expect(notificationPort.dispatched).toHaveLength(1);
    expect(notificationPort.dispatched[0]?.breachDirection.kind).toBe('lower-bound-breach');
  });

  it('dispatches for upper-bound-breach and returns dispatched=true', async () => {
    const result = await dispatchActionableNotification({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      triggerId: TRIGGER_ID,
      breachDirection: UPPER_BOUND_BREACH,
      notificationPort,
      notificationDedupPort,
    });

    expect(result.dispatched).toBe(true);
    expect(result.deliveredAt).not.toBeNull();
    expect(notificationPort.dispatched[0]?.breachDirection.kind).toBe('upper-bound-breach');
  });

  it('suppresses duplicate dispatch for the same triggerId', async () => {
    const first = await dispatchActionableNotification({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      triggerId: TRIGGER_ID,
      breachDirection: LOWER_BOUND_BREACH,
      notificationPort,
      notificationDedupPort,
    });
    expect(first.dispatched).toBe(true);

    const second = await dispatchActionableNotification({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      triggerId: TRIGGER_ID,
      breachDirection: LOWER_BOUND_BREACH,
      notificationPort,
      notificationDedupPort,
    });
    expect(second.dispatched).toBe(false);
    expect(second.deliveredAt).toBeNull();
    expect(notificationPort.dispatched).toHaveLength(1);
  });

  it('does NOT suppress dispatch for different triggerIds', async () => {
    const first = await dispatchActionableNotification({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      triggerId: TRIGGER_ID,
      breachDirection: LOWER_BOUND_BREACH,
      notificationPort,
      notificationDedupPort,
    });
    expect(first.dispatched).toBe(true);

    const second = await dispatchActionableNotification({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      triggerId: TRIGGER_ID_2,
      breachDirection: UPPER_BOUND_BREACH,
      notificationPort,
      notificationDedupPort,
    });
    expect(second.dispatched).toBe(true);
    expect(second.deliveredAt).not.toBeNull();
    expect(notificationPort.dispatched).toHaveLength(2);
  });
});

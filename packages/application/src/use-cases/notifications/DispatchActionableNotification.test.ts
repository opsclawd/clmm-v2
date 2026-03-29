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
const TRIGGER_ID_2 = 'trigger-2' as ExitTriggerId;

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

  it('returns { dispatched: true } when notification is sent', async () => {
    const result = await dispatchActionableNotification({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      triggerId: TRIGGER_ID,
      breachDirection: LOWER_BOUND_BREACH,
      notificationPort,
    });
    expect(result).toEqual({ dispatched: true });
  });

  it('suppresses duplicate notification for same triggerId', async () => {
    const notificationDedup = new Map<string, boolean>();

    const result1 = await dispatchActionableNotification({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      triggerId: TRIGGER_ID,
      breachDirection: LOWER_BOUND_BREACH,
      notificationPort,
      notificationDedup,
    });

    const result2 = await dispatchActionableNotification({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      triggerId: TRIGGER_ID,
      breachDirection: LOWER_BOUND_BREACH,
      notificationPort,
      notificationDedup,
    });

    expect(result1).toEqual({ dispatched: true });
    expect(result2).toEqual({ dispatched: false });
    expect(notificationPort.dispatched).toHaveLength(1);
  });

  it('does NOT suppress notification for a different triggerId', async () => {
    const notificationDedup = new Map<string, boolean>();

    const result1 = await dispatchActionableNotification({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      triggerId: TRIGGER_ID,
      breachDirection: LOWER_BOUND_BREACH,
      notificationPort,
      notificationDedup,
    });

    const result2 = await dispatchActionableNotification({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      triggerId: TRIGGER_ID_2,
      breachDirection: UPPER_BOUND_BREACH,
      notificationPort,
      notificationDedup,
    });

    expect(result1).toEqual({ dispatched: true });
    expect(result2).toEqual({ dispatched: true });
    expect(notificationPort.dispatched).toHaveLength(2);
  });
});

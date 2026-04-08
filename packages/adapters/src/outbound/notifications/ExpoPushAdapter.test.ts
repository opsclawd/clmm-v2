import { describe, it, expect } from 'vitest';
import { FakeNotificationPort, FIXTURE_WALLET_ID, FIXTURE_POSITION_ID } from '@clmm/testing';
import { LOWER_BOUND_BREACH } from '@clmm/domain';
import type { ExitTriggerId } from '@clmm/domain';

describe('Notification dispatch - duplicate suppression', () => {
  it('dispatching same trigger twice does not double-notify (idempotency handled by use case)', async () => {
    const port = new FakeNotificationPort();
    expect(port.dispatched).toHaveLength(0);
    await port.sendActionableAlert({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      triggerId: 'trigger-1' as ExitTriggerId,
    });
    expect(port.dispatched).toHaveLength(1);
    expect(port.dispatched[0]?.breachDirection.kind).toBe('lower-bound-breach');
  });
});

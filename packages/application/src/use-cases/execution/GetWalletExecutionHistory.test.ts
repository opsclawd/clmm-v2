import { beforeEach, describe, expect, it } from 'vitest';
import { getWalletExecutionHistory } from './GetWalletExecutionHistory.js';
import {
  FIXTURE_POSITION_ID,
  FIXTURE_WALLET_ID,
  FakeClockPort,
  FakeExecutionHistoryRepository,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH, makePositionId, makeWalletId } from '@clmm/domain';

describe('GetWalletExecutionHistory', () => {
  let historyRepo: FakeExecutionHistoryRepository;
  const clock = new FakeClockPort();

  beforeEach(async () => {
    historyRepo = new FakeExecutionHistoryRepository();
    historyRepo.assignWalletToPosition(FIXTURE_WALLET_ID, FIXTURE_POSITION_ID);
    await historyRepo.appendEvent({
      eventId: 'evt-wallet-1',
      positionId: FIXTURE_POSITION_ID,
      eventType: 'submitted',
      breachDirection: LOWER_BOUND_BREACH,
      occurredAt: clock.now(),
      lifecycleState: { kind: 'submitted' },
    });
  });

  it('returns wallet-scoped history aggregated across that wallet positions', async () => {
    const result = await getWalletExecutionHistory({
      walletId: FIXTURE_WALLET_ID,
      historyRepo,
    });

    expect(result.history).toHaveLength(1);
    expect(result.history[0]?.positionId).toBe(FIXTURE_POSITION_ID);
  });

  it('returns empty history for a wallet with no linked position history', async () => {
    const result = await getWalletExecutionHistory({
      walletId: makeWalletId('wallet-empty'),
      historyRepo,
    });

    expect(result.history).toEqual([]);
  });

  it('returns history for a wallet whose positions were previously assigned even if no new events exist', async () => {
    const closedPositionId = makePositionId('closed-position');
    historyRepo.assignWalletToPosition(FIXTURE_WALLET_ID, closedPositionId);
    await historyRepo.appendEvent({
      eventId: 'evt-closed-pos',
      positionId: closedPositionId,
      eventType: 'confirmed',
      breachDirection: LOWER_BOUND_BREACH,
      occurredAt: clock.now(),
      lifecycleState: { kind: 'confirmed' },
    });

    const result = await getWalletExecutionHistory({
      walletId: FIXTURE_WALLET_ID,
      historyRepo,
    });

    expect(result.history).toHaveLength(2);
    const closedPosEvent = result.history.find((e) => e.positionId === closedPositionId);
    expect(closedPosEvent?.eventType).toBe('confirmed');
  });

  it('does not include events from positions assigned to a different wallet', async () => {
    const otherWalletId = makeWalletId('wallet-other');
    const otherPositionId = makePositionId('other-wallet-position');

    historyRepo.assignWalletToPosition(otherWalletId, otherPositionId);
    await historyRepo.appendEvent({
      eventId: 'evt-wallet-other',
      positionId: otherPositionId,
      eventType: 'failed',
      breachDirection: LOWER_BOUND_BREACH,
      occurredAt: clock.now(),
      lifecycleState: { kind: 'failed' },
    });

    const result = await getWalletExecutionHistory({
      walletId: FIXTURE_WALLET_ID,
      historyRepo,
    });

    expect(result.history).toHaveLength(1);
    expect(result.history[0]?.eventId).toBe('evt-wallet-1');
  });
});

import { describe, it, expect } from 'vitest';
import { AlertController } from './AlertController.js';
import { FakeTriggerRepository, FIXTURE_POSITION_IN_RANGE } from '@clmm/testing';
import { makeClockTimestamp, makePositionId } from '@clmm/domain';
import type { BreachEpisodeId, ExitTrigger, ExitTriggerId, WalletId } from '@clmm/domain';

const otherPositionId = makePositionId('other-wallet-position');
const requestedWalletId = FIXTURE_POSITION_IN_RANGE.walletId;

class WalletScopedTriggerRepository extends FakeTriggerRepository {
  listedWalletId: WalletId | null = null;

  override async listActionableTriggers(walletId: WalletId): Promise<ExitTrigger[]> {
    this.listedWalletId = walletId;
    return Array.from(this.triggers.values()).filter(
      (trigger) => walletId === requestedWalletId && trigger.positionId === FIXTURE_POSITION_IN_RANGE.positionId,
    );
  }
}

describe('AlertController', () => {
  it('returns repository-scoped actionable alerts without controller-side wallet filtering', async () => {
    const triggerRepo = new WalletScopedTriggerRepository();
    const controller = new AlertController(triggerRepo);

    await triggerRepo.saveTrigger({
      triggerId: 'trigger-owned' as ExitTriggerId,
      positionId: FIXTURE_POSITION_IN_RANGE.positionId,
      episodeId: 'episode-owned' as BreachEpisodeId,
      breachDirection: { kind: 'lower-bound-breach' },
      triggeredAt: makeClockTimestamp(1_000_000),
      confirmationEvaluatedAt: makeClockTimestamp(1_000_001),
      confirmationPassed: true,
    });
    await triggerRepo.saveTrigger({
      triggerId: 'trigger-leaked' as ExitTriggerId,
      positionId: otherPositionId,
      episodeId: 'episode-leaked' as BreachEpisodeId,
      breachDirection: { kind: 'upper-bound-breach' },
      triggeredAt: makeClockTimestamp(1_000_002),
      confirmationEvaluatedAt: makeClockTimestamp(1_000_003),
      confirmationPassed: true,
    });

    const result = await controller.listAlerts(FIXTURE_POSITION_IN_RANGE.walletId);

    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]?.triggerId).toBe('trigger-owned');
    expect(triggerRepo.listedWalletId).toBe(requestedWalletId);
  });

  it('returns empty alerts array when position read fails due to RPC error', async () => {
    const triggerRepo = new WalletScopedTriggerRepository();
    triggerRepo.listActionableTriggers = async () => {
      throw new Error('Solana RPC timeout');
    };
    const controller = new AlertController(triggerRepo);

    const result = await controller.listAlerts(FIXTURE_POSITION_IN_RANGE.walletId);

    expect(result).toEqual({
      alerts: [],
      error: 'Unable to fetch alerts. Position data temporarily unavailable.',
    });
  });

  it('rethrows non-transient repository errors', async () => {
    const triggerRepo = new WalletScopedTriggerRepository();
    triggerRepo.listActionableTriggers = async () => {
      throw new Error('Invariant violated while hydrating triggers');
    };
    const controller = new AlertController(triggerRepo);

    await expect(controller.listAlerts(FIXTURE_POSITION_IN_RANGE.walletId)).rejects.toThrow(
      'Invariant violated while hydrating triggers',
    );
  });
});

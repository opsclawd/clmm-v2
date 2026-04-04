import { describe, it, expect } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PositionController } from './PositionController.js';
import {
  FakeSupportedPositionReadPort,
  FakeTriggerRepository,
  FIXTURE_POSITION_IN_RANGE,
} from '@clmm/testing';
import type { BreachEpisodeId, ExitTriggerId, WalletId } from '@clmm/domain';
import { makeClockTimestamp, makeWalletId } from '@clmm/domain';

describe('PositionController', () => {
  it('returns populated position detail with actionable trigger fields when a trigger exists', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]);
    const triggerRepo = new FakeTriggerRepository();
    triggerRepo.triggers.set('trigger-position-1', {
      triggerId: 'trigger-position-1' as ExitTriggerId,
      positionId: FIXTURE_POSITION_IN_RANGE.positionId,
      episodeId: 'episode-position-1' as BreachEpisodeId,
      breachDirection: { kind: 'lower-bound-breach' },
      triggeredAt: makeClockTimestamp(1_000_000),
      confirmationEvaluatedAt: makeClockTimestamp(1_000_001),
      confirmationPassed: true,
    });

    const controller = new PositionController(
      positionReadPort,
      triggerRepo,
    );

    const result = await controller.getPosition(
      FIXTURE_POSITION_IN_RANGE.walletId,
      FIXTURE_POSITION_IN_RANGE.positionId,
    );

    expect(result.position.positionId).toBe(FIXTURE_POSITION_IN_RANGE.positionId);
    expect(result.position.hasActionableTrigger).toBe(true);
    expect(result.position.triggerId).toBe('trigger-position-1');
    expect(result.position.breachDirection).toEqual({ kind: 'lower-bound-breach' });
    expect(result.position.lowerBound).toBe(FIXTURE_POSITION_IN_RANGE.bounds.lowerBound);
    expect(result.position.upperBound).toBe(FIXTURE_POSITION_IN_RANGE.bounds.upperBound);
    expect(result.position.currentPrice).toBe(FIXTURE_POSITION_IN_RANGE.rangeState.currentPrice);
  });

  it('returns position detail without optional trigger fields when no trigger exists', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]);
    const triggerRepo = new FakeTriggerRepository();
    const controller = new PositionController(
      positionReadPort,
      triggerRepo,
    );

    const result = await controller.getPosition(
      FIXTURE_POSITION_IN_RANGE.walletId,
      FIXTURE_POSITION_IN_RANGE.positionId,
    );

    expect(result.position.positionId).toBe(FIXTURE_POSITION_IN_RANGE.positionId);
    expect(result.position.hasActionableTrigger).toBe(false);
    expect(result.position.triggerId).toBeUndefined();
    expect(result.position.breachDirection).toBeUndefined();
    expect(result.position.lowerBound).toBe(FIXTURE_POSITION_IN_RANGE.bounds.lowerBound);
    expect(result.position.upperBound).toBe(FIXTURE_POSITION_IN_RANGE.bounds.upperBound);
    expect(result.position.currentPrice).toBe(FIXTURE_POSITION_IN_RANGE.rangeState.currentPrice);
  });

  it('throws NotFoundException when position does not exist', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([]);
    const triggerRepo = new FakeTriggerRepository();
    const controller = new PositionController(
      positionReadPort,
      triggerRepo,
    );

    await expect(
      controller.getPosition(FIXTURE_POSITION_IN_RANGE.walletId, FIXTURE_POSITION_IN_RANGE.positionId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException when wallet does not own the position', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]);
    const triggerRepo = new FakeTriggerRepository();
    const controller = new PositionController(positionReadPort, triggerRepo);

    const otherWallet: WalletId = makeWalletId('other-wallet-id');

    await expect(
      controller.getPosition(otherWallet, FIXTURE_POSITION_IN_RANGE.positionId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the owned position for the same wallet-position pair used by listPositions', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]);
    const triggerRepo = new FakeTriggerRepository();
    const controller = new PositionController(positionReadPort, triggerRepo);

    const listResult = await controller.listPositions(FIXTURE_POSITION_IN_RANGE.walletId);
    const positionId = listResult.positions[0]!.positionId;

    const detailResult = await controller.getPosition(
      FIXTURE_POSITION_IN_RANGE.walletId,
      positionId,
    );

    expect(detailResult.position.positionId).toBe(positionId);
  });

  it('degrades gracefully when trigger fetch fails with transient RPC error', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]);
    const triggerRepo = new FakeTriggerRepository();
    triggerRepo.listActionableTriggers = async () => {
      throw new Error('SolanaError: HTTP error (429): Too Many Requests');
    };
    const controller = new PositionController(positionReadPort, triggerRepo);

    const result = await controller.getPosition(
      FIXTURE_POSITION_IN_RANGE.walletId,
      FIXTURE_POSITION_IN_RANGE.positionId,
    );

    expect(result.position.positionId).toBe(FIXTURE_POSITION_IN_RANGE.positionId);
    expect(result.position.hasActionableTrigger).toBe(false);
    expect(result.position.triggerId).toBeUndefined();
    expect(result.position.lowerBound).toBe(FIXTURE_POSITION_IN_RANGE.bounds.lowerBound);
    expect(result.position.upperBound).toBe(FIXTURE_POSITION_IN_RANGE.bounds.upperBound);
    expect(result.position.currentPrice).toBe(FIXTURE_POSITION_IN_RANGE.rangeState.currentPrice);
    expect(result.error).toBe('Unable to fetch trigger data. Position data temporarily unavailable.');
  });

  it('rethrows non-transient trigger errors from getPosition', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]);
    const triggerRepo = new FakeTriggerRepository();
    triggerRepo.listActionableTriggers = async () => {
      throw new Error('Database connection pool exhausted');
    };
    const controller = new PositionController(positionReadPort, triggerRepo);

    await expect(
      controller.getPosition(FIXTURE_POSITION_IN_RANGE.walletId, FIXTURE_POSITION_IN_RANGE.positionId),
    ).rejects.toThrow('Database connection pool exhausted');
  });

  it('returns empty positions with error on transient RPC failure in listPositions', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]);
    positionReadPort.listSupportedPositions = async () => {
      throw new Error('Solana RPC timeout');
    };
    const triggerRepo = new FakeTriggerRepository();
    const controller = new PositionController(positionReadPort, triggerRepo);

    const result = await controller.listPositions(FIXTURE_POSITION_IN_RANGE.walletId);

    expect(result).toEqual({
      positions: [],
      error: 'Unable to fetch positions. Position data temporarily unavailable.',
    });
  });

  it('rethrows non-transient errors from listPositions', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]);
    positionReadPort.listSupportedPositions = async () => {
      throw new Error('Invariant: unknown pool type');
    };
    const triggerRepo = new FakeTriggerRepository();
    const controller = new PositionController(positionReadPort, triggerRepo);

    await expect(
      controller.listPositions(FIXTURE_POSITION_IN_RANGE.walletId),
    ).rejects.toThrow('Invariant: unknown pool type');
  });

  it('enriches position summaries with hasActionableTrigger from trigger repository', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]);
    const triggerRepo = new FakeTriggerRepository();
    triggerRepo.triggers.set('trigger-list-1', {
      triggerId: 'trigger-list-1' as ExitTriggerId,
      positionId: FIXTURE_POSITION_IN_RANGE.positionId,
      episodeId: 'episode-list-1' as BreachEpisodeId,
      breachDirection: { kind: 'lower-bound-breach' },
      triggeredAt: makeClockTimestamp(2_000_000),
      confirmationEvaluatedAt: makeClockTimestamp(2_000_001),
      confirmationPassed: true,
    });
    const controller = new PositionController(positionReadPort, triggerRepo);

    const result = await controller.listPositions(FIXTURE_POSITION_IN_RANGE.walletId);

    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]!.hasActionableTrigger).toBe(true);
    expect(result.positions[0]!.positionId).toBe(FIXTURE_POSITION_IN_RANGE.positionId);
    expect(result).not.toHaveProperty('error');
  });

  it('returns positions with hasActionableTrigger false and error when trigger fetch fails transiently in listPositions', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]);
    const triggerRepo = new FakeTriggerRepository();
    triggerRepo.listActionableTriggers = async () => {
      throw new Error('SolanaError: HTTP error (429): Too Many Requests');
    };
    const controller = new PositionController(positionReadPort, triggerRepo);

    const result = await controller.listPositions(FIXTURE_POSITION_IN_RANGE.walletId);

    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]!.hasActionableTrigger).toBe(false);
    expect(result.positions[0]!.positionId).toBe(FIXTURE_POSITION_IN_RANGE.positionId);
    expect(result.error).toBe('Unable to fetch trigger data. Trigger status may be incomplete.');
  });

  it('rethrows non-transient trigger errors from listPositions', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]);
    const triggerRepo = new FakeTriggerRepository();
    triggerRepo.listActionableTriggers = async () => {
      throw new Error('Database connection pool exhausted');
    };
    const controller = new PositionController(positionReadPort, triggerRepo);

    await expect(
      controller.listPositions(FIXTURE_POSITION_IN_RANGE.walletId),
    ).rejects.toThrow('Database connection pool exhausted');
  });
});

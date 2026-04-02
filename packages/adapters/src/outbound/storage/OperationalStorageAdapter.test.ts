import { describe, it, expect } from 'vitest';
import { OperationalStorageAdapter } from './OperationalStorageAdapter.js';
import { FIXTURE_POSITION_IN_RANGE, FIXTURE_WALLET_ID, FakeIdGeneratorPort } from '@clmm/testing';
import { makeClockTimestamp, makePositionId } from '@clmm/domain';
import type { SupportedPositionReadPort } from '@clmm/application';
import type { LiquidityPosition, PositionId, WalletId } from '@clmm/domain';
import type { Db } from './db.js';

const leakedPositionId = makePositionId('leaked-position');

class WalletScopedPositionReadPort implements SupportedPositionReadPort {
  receivedWalletId: WalletId | null = null;

  constructor(private readonly positions: LiquidityPosition[]) {}

  async listSupportedPositions(walletId: WalletId): Promise<LiquidityPosition[]> {
    this.receivedWalletId = walletId;
    return [...this.positions];
  }

  async getPosition(_walletId: WalletId, _positionId: PositionId): Promise<LiquidityPosition | null> {
    return null;
  }
}

function makeDbWithTriggerRows(rows: Array<{
  triggerId: string;
  positionId: string;
  episodeId: string;
  directionKind: string;
  triggeredAt: number;
  confirmationEvaluatedAt: number;
}>): Db {
  return {
    select() {
      return {
        from() {
          return {
            where: async () => rows,
          };
        },
      };
    },
  } as unknown as Db;
}

describe('OperationalStorageAdapter', () => {
  it('scopes actionable triggers to positions owned by the requested wallet', async () => {
    const positionReadPort = new WalletScopedPositionReadPort([FIXTURE_POSITION_IN_RANGE]);
    const adapter = new OperationalStorageAdapter(
      makeDbWithTriggerRows([
        {
          triggerId: 'trigger-owned',
          positionId: FIXTURE_POSITION_IN_RANGE.positionId,
          episodeId: 'episode-owned',
          directionKind: 'lower-bound-breach',
          triggeredAt: makeClockTimestamp(1_000_000),
          confirmationEvaluatedAt: makeClockTimestamp(1_000_001),
        },
        {
          triggerId: 'trigger-leaked',
          positionId: leakedPositionId,
          episodeId: 'episode-leaked',
          directionKind: 'upper-bound-breach',
          triggeredAt: makeClockTimestamp(1_000_002),
          confirmationEvaluatedAt: makeClockTimestamp(1_000_003),
        },
      ]),
      new FakeIdGeneratorPort('storage'),
      positionReadPort,
    );

    const triggers = await adapter.listActionableTriggers(FIXTURE_WALLET_ID);

    expect(positionReadPort.receivedWalletId).toBe(FIXTURE_WALLET_ID);
    expect(triggers).toHaveLength(1);
    expect(triggers[0]?.triggerId).toBe('trigger-owned');
    expect(triggers[0]?.positionId).toBe(FIXTURE_POSITION_IN_RANGE.positionId);
  });
});

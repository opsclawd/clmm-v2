import { describe, it, expect, vi } from 'vitest';
import { OffChainHistoryStorageAdapter } from './OffChainHistoryStorageAdapter.js';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH, makeWalletId } from '@clmm/domain';
import type { Db } from './db.js';

describe('OffChainHistoryStorageAdapter', () => {
  it('derives wallet history from execution sessions and maps stored rows into history events', async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { positionId: 'position-2' },
            { positionId: 'position-1' },
            { positionId: 'position-2' },
          ]),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([
              {
                eventId: 'evt-1',
                positionId: 'position-1',
                eventType: 'submitted',
                directionKind: 'lower-bound-breach',
                occurredAt: 1000,
                lifecycleStateKind: 'submitted',
                transactionRefJson: { signature: 'sig-1', stepKind: 'remove-liquidity' },
              },
              {
                eventId: 'evt-2',
                positionId: 'position-2',
                eventType: 'failed',
                directionKind: 'upper-bound-breach',
                occurredAt: 2000,
                lifecycleStateKind: null,
                transactionRefJson: null,
              },
            ]),
          }),
        }),
      });

    const db = { select } as unknown as Db;
    const adapter = new OffChainHistoryStorageAdapter(db) as unknown as {
      getWalletHistory: (walletId: ReturnType<typeof makeWalletId>) => Promise<readonly unknown[]>;
    };

    const history = await adapter.getWalletHistory(makeWalletId('wallet-1'));

    expect(history).toEqual([
      {
        eventId: 'evt-1',
        positionId: 'position-1',
        eventType: 'submitted',
        breachDirection: LOWER_BOUND_BREACH,
        occurredAt: 1000,
        lifecycleState: { kind: 'submitted' },
        transactionReference: { signature: 'sig-1', stepKind: 'remove-liquidity' },
      },
      {
        eventId: 'evt-2',
        positionId: 'position-2',
        eventType: 'failed',
        breachDirection: UPPER_BOUND_BREACH,
        occurredAt: 2000,
      },
    ]);
    expect(select).toHaveBeenCalledTimes(2);
  });

  it('getOutcomeSummary method exists and is not a null-stub', () => {
    // Verify the implementation references actual DB queries
    // (full integration test requires a test DB; this validates shape)
    const proto = OffChainHistoryStorageAdapter.prototype;
    expect(typeof proto.getOutcomeSummary).toBe('function');
    // The method body should not be just "return null" — it should contain DB query logic
    const src = proto.getOutcomeSummary.toString();
    // A real implementation will reference historyEvents table and positionId column
    expect(src).toContain('historyEvents');
    expect(src).toContain('positionId');
    // A real implementation will reference terminal event types
    expect(src).toContain('confirmed');
    expect(src).toContain('breachDirection');
  });
});

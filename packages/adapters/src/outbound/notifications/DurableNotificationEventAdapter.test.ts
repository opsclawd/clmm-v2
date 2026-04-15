import { describe, it, expect } from 'vitest';
import { FIXTURE_WALLET_ID, FIXTURE_POSITION_ID } from '@clmm/testing';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH } from '@clmm/domain';
import type { ExitTriggerId } from '@clmm/domain';
import { DurableNotificationEventAdapter } from './DurableNotificationEventAdapter.js';

let _idCounter = 0;
const fakeIds = {
  generateId: () => `test-${Date.now()}-${++_idCounter}`,
};

describe('DurableNotificationEventAdapter', () => {
  it('inserts a notification event with status skipped and returns null delivery', async () => {
    const insertedRows: Record<string, unknown>[] = [];
    const mockDb = {
      insert: () => ({
        values: (row: Record<string, unknown>) => {
          insertedRows.push(row);
          return Promise.resolve();
        },
      }),
    };

    const adapter = new DurableNotificationEventAdapter(mockDb as never, fakeIds);

    const result = await adapter.sendActionableAlert({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      triggerId: 'trigger-abc' as ExitTriggerId,
    });

    expect(result.deliveredAt).toBeNull();

    expect(insertedRows).toHaveLength(1);
    const row = insertedRows[0]!;

    expect(row['triggerId']).toBe('trigger-abc');
    expect(row['walletId']).toBe(FIXTURE_WALLET_ID);
    expect(row['positionId']).toBe(FIXTURE_POSITION_ID);
    expect(row['directionKind']).toBe('lower-bound-breach');
    expect(row['channel']).toBe('none');
    expect(row['status']).toBe('skipped');
    expect(row['attemptedAt']).toBeNull();
    expect(row['deliveredAt']).toBeNull();
    expect(row['failureReason']).toBeNull();
    expect(typeof row['createdAt']).toBe('number');
    expect(typeof row['eventId']).toBe('string');
  });

  it('records upper-bound-breach direction correctly', async () => {
    const insertedRows: Record<string, unknown>[] = [];
    const mockDb = {
      insert: () => ({
        values: (row: Record<string, unknown>) => {
          insertedRows.push(row);
          return Promise.resolve();
        },
      }),
    };

    const adapter = new DurableNotificationEventAdapter(mockDb as never, fakeIds);

    await adapter.sendActionableAlert({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      breachDirection: UPPER_BOUND_BREACH,
      triggerId: 'trigger-xyz' as ExitTriggerId,
    });

    expect(insertedRows[0]!['directionKind']).toBe('upper-bound-breach');
  });

  it('generates unique event IDs for each call', async () => {
    const insertedRows: Record<string, unknown>[] = [];
    const mockDb = {
      insert: () => ({
        values: (row: Record<string, unknown>) => {
          insertedRows.push(row);
          return Promise.resolve();
        },
      }),
    };

    const adapter = new DurableNotificationEventAdapter(mockDb as never, fakeIds);
    const params = {
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      triggerId: 'trigger-same' as ExitTriggerId,
    };

    await adapter.sendActionableAlert(params);
    await adapter.sendActionableAlert(params);

    expect(insertedRows[0]!['eventId']).not.toBe(insertedRows[1]!['eventId']);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { drizzleMock } = vi.hoisted(() => ({
  drizzleMock: vi.fn(),
}));

type DrizzleCall = [unknown, { schema?: Record<string, unknown> }];

vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: drizzleMock,
}));

import { createDb } from './db.js';

describe('createDb', () => {
  beforeEach(() => {
    drizzleMock.mockReset();
  });

  it('passes a schema namespace containing every defined table into drizzle', () => {
    const fakeDb = { query: vi.fn() };
    drizzleMock.mockReturnValue(fakeDb);

    const db = createDb('postgresql://localhost/clmm');

    expect(drizzleMock).toHaveBeenCalledTimes(1);
    const drizzleCalls = drizzleMock.mock.calls as DrizzleCall[];
    const drizzleCall = drizzleCalls[0];
    if (drizzleCall == null) throw new Error('Expected drizzle to be called once');

    const [, config] = drizzleCall;
    expect(config.schema).toBeDefined();
    expect(typeof config.schema).toBe('object');

    const schemaKeys = Object.keys(config.schema ?? {});
    expect(schemaKeys).toEqual(
      expect.arrayContaining([
        'walletChallenges',
        'monitoredWallets',
        'executionAttempts',
        'executionSessions',
        'notificationDedup',
        'notificationEvents',
        'executionPreviews',
        'historyEvents',
        'walletPositionOwnership',
        'preparedPayloads',
        'breachEpisodes',
        'exitTriggers',
      ]),
    );

    expect(db).toBe(fakeDb);
  });
});

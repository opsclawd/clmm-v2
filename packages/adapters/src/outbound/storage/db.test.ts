import { beforeEach, describe, expect, it, vi } from 'vitest';

const { drizzleMock } = vi.hoisted(() => ({
  drizzleMock: vi.fn(),
}));

type DrizzleCall = [unknown, { schema?: unknown }];

vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: drizzleMock,
}));

import { createDb } from './db.js';

describe('createDb', () => {
  beforeEach(() => {
    drizzleMock.mockReset();
  });

  it('passes a configured schema into drizzle and returns the db handle', () => {
    const fakeDb = { query: vi.fn() };
    drizzleMock.mockReturnValue(fakeDb);

    const db = createDb('postgresql://localhost/clmm');

    expect(drizzleMock).toHaveBeenCalledTimes(1);

    const drizzleCalls = drizzleMock.mock.calls as DrizzleCall[];
    const drizzleCall = drizzleCalls[0];
    expect(drizzleCall).toBeDefined();
    if (drizzleCall == null) {
      throw new Error('Expected drizzle to be called once');
    }

    const [client, config] = drizzleCall;
    expect(client).toBeDefined();
    expect(config).toBeDefined();
    expect(config.schema).toBeDefined();
    expect(typeof config.schema).toBe('object');
    expect(db).toBe(fakeDb);
  });
});

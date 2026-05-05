import { describe, it, expect, vi } from 'vitest';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { checkSchemaReadiness } from './SchemaReadiness.js';
import type { Db } from './db.js';

function makeDbWithPresentTables(present: string[]): Db {
  return {
    execute: vi.fn(async () => present.map((table_name) => ({ table_name }))),
  } as unknown as Db;
}

const fixtureTableA = pgTable('fixture_a', { id: text('id').primaryKey() });
const fixtureTableB = pgTable('fixture_b', { id: text('id').primaryKey() });

describe('checkSchemaReadiness', () => {
  it('returns ready: true when every expected table is present', async () => {
    const db = makeDbWithPresentTables(['fixture_a', 'fixture_b']);
    const namespace = { fixtureTableA, fixtureTableB };

    const result = await checkSchemaReadiness(db, namespace);

    expect(result).toEqual({ ready: true });
  });

  it('returns ready: false with sorted missing list when tables are absent', async () => {
    const db = makeDbWithPresentTables([]);
    const namespace = { fixtureTableA, fixtureTableB };

    const result = await checkSchemaReadiness(db, namespace);

    expect(result).toEqual({
      ready: false,
      missing: ['fixture_a', 'fixture_b'],
    });
  });

  it('returns missing list with only the absent tables', async () => {
    const db = makeDbWithPresentTables(['fixture_b']);
    const namespace = { fixtureTableA, fixtureTableB };

    const result = await checkSchemaReadiness(db, namespace);

    expect(result).toEqual({
      ready: false,
      missing: ['fixture_a'],
    });
  });

  it('filters non-table exports from the namespace', async () => {
    const executeMock = vi.fn(async () => [{ table_name: 'fixture_a' }]);
    const db = { execute: executeMock } as unknown as Db;
    const namespace = {
      fixtureTableA,
      fixtureRelation: { __isNotATable: true },
      fixtureHelper: () => 'hello',
      fixtureNumber: 42,
      fixtureNull: null,
    };

    const result = await checkSchemaReadiness(db, namespace);

    expect(result).toEqual({ ready: true });
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it('returns ready: true vacuously when the namespace has no tables', async () => {
    const executeMock = vi.fn();
    const db = { execute: executeMock } as unknown as Db;

    const result = await checkSchemaReadiness(db, { notATable: 123 });

    expect(result).toEqual({ ready: true });
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('passes the expected table list to information_schema query', async () => {
    const executeMock = vi.fn(async () => [
      { table_name: 'fixture_a' },
      { table_name: 'fixture_b' },
    ]);
    const db = { execute: executeMock } as unknown as Db;
    const namespace = { fixtureTableA, fixtureTableB };

    await checkSchemaReadiness(db, namespace);

    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it('produces IN with individual params, not a row constructor', async () => {
    const executeMock = vi.fn(async () => [
      { table_name: 'fixture_a' },
      { table_name: 'fixture_b' },
    ]);
    const db = { execute: executeMock } as unknown as Db;
    const namespace = { fixtureTableA, fixtureTableB };

    await checkSchemaReadiness(db, namespace);

    const callArgs = executeMock.mock.calls as unknown as [[unknown]];
    const query = callArgs[0][0] as {
      toQuery: (config: unknown) => { sql: string; params: unknown[] };
    };
    const built = query.toQuery({
      escapeName: (s: string) => `"${s}"`,
      escapeParam: (_: unknown, i: number) => `$${i + 1}`,
      prepareTyping: () => [],
      paramStartIndex: { value: 0 },
    });
    expect(built.sql).toContain('IN');
    expect(built.sql).not.toMatch(/IN\s*\(\s*\(/);
  });

  it('propagates database errors from execute', async () => {
    const db = {
      execute: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    } as unknown as Db;
    const namespace = { fixtureTableA, fixtureTableB };

    await expect(checkSchemaReadiness(db, namespace)).rejects.toThrow('ECONNREFUSED');
  });
});

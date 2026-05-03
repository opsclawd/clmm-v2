import { is, getTableName, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import type { Db } from './db.js';

export type SchemaReadinessResult =
  | { ready: true }
  | { ready: false; missing: string[] };

export async function checkSchemaReadiness(
  db: Db,
  schemaNamespace: Record<string, unknown>,
): Promise<SchemaReadinessResult> {
  const expected = Object.values(schemaNamespace)
    .filter((value): value is PgTable => is(value, PgTable))
    .map((table) => getTableName(table));

  if (expected.length === 0) return { ready: true };

  const rows = await db.execute<{ table_name: string }>(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = ANY(${expected})
  `);

  const present = new Set((rows as Array<{ table_name: string }>).map((row) => row.table_name));
  const missing = expected.filter((table) => !present.has(table)).sort();

  return missing.length === 0 ? { ready: true } : { ready: false, missing };
}

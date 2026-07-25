import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getTableName, is } from 'drizzle-orm';
import { PgTable, pgTable, text } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import * as schema from '../index.js';

interface SchemaSnapshot {
  tables: Record<string, { name: string }>;
}

const metaDirectory = resolve(__dirname, '../../../../../drizzle/meta');

function getSchemaTableNames(schemaNamespace: Record<string, unknown>): string[] {
  return Object.values(schemaNamespace)
    .filter((value): value is PgTable => is(value, PgTable))
    .map((table) => getTableName(table))
    .sort();
}

function getSnapshotTableNames(snapshot: SchemaSnapshot): string[] {
  return Object.values(snapshot.tables)
    .map((table) => table.name)
    .sort();
}

function findMissingTableNames(expected: string[], tracked: string[]): string[] {
  const trackedNames = new Set(tracked);
  return expected.filter((tableName) => !trackedNames.has(tableName)).sort();
}

function selectLatestSnapshotFile(fileNames: string[]): string {
  const latestSnapshotFile = fileNames
    .filter((fileName) => /^\d{4}_snapshot\.json$/.test(fileName))
    .sort()
    .at(-1);

  if (!latestSnapshotFile) {
    throw new Error('No numbered Drizzle snapshot found');
  }

  return latestSnapshotFile;
}

function readLatestSnapshot(directory: string): SchemaSnapshot {
  const latestSnapshotFile = selectLatestSnapshotFile(readdirSync(directory));
  return JSON.parse(readFileSync(resolve(directory, latestSnapshotFile), 'utf8')) as SchemaSnapshot;
}

describe('Drizzle schema snapshot integrity', () => {
  it('filters non-table exports when deriving expected schema tables', () => {
    const fixtureTable = pgTable('fixture_table', {
      id: text('id').primaryKey(),
    });

    expect(
      getSchemaTableNames({
        fixtureTable,
        fixtureHelper: () => 'not a table',
        fixtureRelation: { referencedTableName: 'fixture_table' },
      }),
    ).toEqual(['fixture_table']);
  });

  it('reports schema tables that are missing from a snapshot', () => {
    expect(
      findMissingTableNames(['fixture_b', 'fixture_a'], ['fixture_b', 'fixture_extra']),
    ).toEqual(['fixture_a']);
  });

  it('fails when no numbered Drizzle snapshot exists', () => {
    expect(() => selectLatestSnapshotFile(['_journal.json', 'README.md'])).toThrow(
      'No numbered Drizzle snapshot found',
    );
  });

  it('tracks every exported schema table in the latest Drizzle snapshot', () => {
    const latestSnapshot = readLatestSnapshot(metaDirectory);

    expect(
      findMissingTableNames(getSchemaTableNames(schema), getSnapshotTableNames(latestSnapshot)),
    ).toEqual([]);
  });
});

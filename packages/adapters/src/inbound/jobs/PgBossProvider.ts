import { PgBoss } from 'pg-boss';

export function createPgBossProvider(connectionString: string): PgBoss {
  return new PgBoss({
    connectionString,
  });
}

import { EventEmitter } from 'node:events';
import { PgBoss } from 'pg-boss';

function serializeEventDetails(event: unknown): Record<string, unknown> {
  if (event instanceof Error) {
    return {
      error: event.message,
      stack: event.stack,
    };
  }

  if (typeof event === 'object' && event != null) {
    return { event };
  }

  return { event: String(event) };
}

export function createPgBossProvider(connectionString: string): PgBoss {
  const boss = new PgBoss({
    connectionString,
  });
  const bossEvents = boss as PgBoss & EventEmitter;

  bossEvents.on('error', (error: unknown) => {
    console.error(JSON.stringify({
      level: 'error',
      message: 'pg-boss error',
      timestamp: new Date().toISOString(),
      ...serializeEventDetails(error),
    }));
  });

  bossEvents.on('warning', (warning: unknown) => {
    console.warn(JSON.stringify({
      level: 'warn',
      message: 'pg-boss warning',
      timestamp: new Date().toISOString(),
      ...serializeEventDetails(warning),
    }));
  });

  return boss;
}

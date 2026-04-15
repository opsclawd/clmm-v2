import { drizzle } from 'drizzle-orm/postgres-js';
import postgres = require('postgres');
import * as triggersSchema from './schema/triggers.js';
import * as previewsSchema from './schema/previews.js';
import * as executionsSchema from './schema/executions.js';
import * as preparedPayloadsSchema from './schema/prepared-payloads.js';
import * as historySchema from './schema/history.js';
import * as monitoredWalletsSchema from './schema/monitored-wallets.js';
import * as notificationDedupSchema from './schema/notification-dedup.js';
import * as notificationEventsSchema from './schema/notification-events.js';

export function createDb(connectionString: string) {
  const client = postgres(connectionString);
  return drizzle(client, {
    schema: {
      ...triggersSchema,
      ...previewsSchema,
      ...executionsSchema,
      ...preparedPayloadsSchema,
      ...historySchema,
      ...monitoredWalletsSchema,
      ...notificationDedupSchema,
      ...notificationEventsSchema,
    },
  });
}

export type Db = ReturnType<typeof createDb>;

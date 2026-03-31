import { drizzle } from 'drizzle-orm/postgres-js';
import postgres = require('postgres');
import * as triggersSchema from './schema/triggers.js';
import * as previewsSchema from './schema/previews.js';
import * as executionsSchema from './schema/executions.js';
import * as historySchema from './schema/history.js';

export function createDb(connectionString: string) {
  const client = postgres(connectionString);
  return drizzle(client, {
    schema: {
      ...triggersSchema,
      ...previewsSchema,
      ...executionsSchema,
      ...historySchema,
    },
  });
}

export type Db = ReturnType<typeof createDb>;

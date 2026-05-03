import { drizzle } from 'drizzle-orm/postgres-js';
import postgres = require('postgres');
import * as schema from './schema/index.js';

export function createDb(connectionString: string) {
  const client = postgres(connectionString, { connect_timeout: 10 });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
export { schema };

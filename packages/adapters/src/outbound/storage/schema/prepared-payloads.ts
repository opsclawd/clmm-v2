import { pgTable, text, bigint, customType } from 'drizzle-orm/pg-core';

const pgBytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const preparedPayloads = pgTable('prepared_payloads', {
  payloadId: text('payload_id').primaryKey(),
  attemptId: text('attempt_id').notNull().unique(),
  unsignedPayload: pgBytea('unsigned_payload').notNull(),
  payloadVersion: text('payload_version').notNull(),
  expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});

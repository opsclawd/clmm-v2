import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './packages/adapters/src/outbound/storage/schema/*.ts',
  out: './packages/adapters/drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://localhost:5432/clmm_v2',
  },
});
import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

config({ path: './.env' });

export default defineConfig({
  schema: './src/outbound/storage/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
    ssl: { rejectUnauthorized: false },
  },
});

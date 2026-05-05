import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createDb, schema } from '../../outbound/storage/db.js';
import { checkSchemaReadiness } from '../../outbound/storage/SchemaReadiness.js';

export async function bootstrap(): Promise<void> {
  const dbUrl = (process.env as Record<string, string | undefined>)['DATABASE_URL'];
  if (dbUrl == null || dbUrl === '') {
    console.error(
      JSON.stringify({
        level: 'fatal',
        message: 'Worker: DATABASE_URL not set',
        timestamp: new Date().toISOString(),
      }),
    );
    process.exit(1);
    return;
  }

  const gateDb = createDb(dbUrl);
  let readiness: Awaited<ReturnType<typeof checkSchemaReadiness>>;
  try {
    readiness = await checkSchemaReadiness(gateDb, schema);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({
        level: 'fatal',
        message: 'Worker: schema readiness check failed; refusing to start',
        error: message,
        timestamp: new Date().toISOString(),
      }),
    );
    process.exit(1);
    return;
  }
  if (!readiness.ready) {
    console.error(
      JSON.stringify({
        level: 'fatal',
        message: 'Worker: schema readiness check failed; refusing to start',
        missing: readiness.missing,
        timestamp: new Date().toISOString(),
      }),
    );
    process.exit(1);
    return;
  }

  const { WorkerModule } = await import('./WorkerModule.js');
  const app = await NestFactory.createApplicationContext(WorkerModule);

  const signals = ['SIGTERM', 'SIGINT'] as const;
  for (const signal of signals) {
    process.on(signal, () => {
      console.log(`Worker received ${signal}, shutting down...`);
      void app.close().finally(() => {
        process.exit(0);
      });
    });
  }

  console.log('Worker: schema readiness OK; pg-boss starting');
}

if (require.main === module) {
  void bootstrap();
}

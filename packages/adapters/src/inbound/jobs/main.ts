import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './WorkerModule.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);

  // Graceful shutdown
  const signals = ['SIGTERM', 'SIGINT'] as const;
  for (const signal of signals) {
    process.on(signal, () => {
      console.log(`Worker received ${signal}, shutting down...`);
      void app.close().finally(() => {
        process.exit(0);
      });
    });
  }

  console.log('Worker started');
}

void bootstrap();

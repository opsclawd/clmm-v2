import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './WorkerModule.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(WorkerModule);
  // boundary: process.env values are untyped at runtime; validated via env schema at deploy
  const port = (process.env as Record<string, string | undefined>)['PORT'] ?? 3002;
  await app.listen(port);
  console.log(`Worker listening on port ${port}`);
}

void bootstrap();

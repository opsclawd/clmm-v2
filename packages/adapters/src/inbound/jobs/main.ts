import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './WorkerModule.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(WorkerModule);
  const port = process.env['PORT'] ?? 3002;
  await app.listen(port);
  console.log(`Worker listening on port ${port}`);
}

void bootstrap();

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AdaptersModule } from '../../composition/AdaptersModule';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AdaptersModule);
  // pg-boss job handlers registered by NestJS module — wired in Epic 4
  console.log('Worker started');
  // keep alive
  await app.init();
}

void bootstrap();
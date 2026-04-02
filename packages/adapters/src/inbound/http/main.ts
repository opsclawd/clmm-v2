import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { AppModule } from './AppModule.js';

export async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, new FastifyAdapter());
  app.enableCors();
  // boundary: process.env values are untyped at runtime; validated via env schema at deploy
  const port = (process.env as Record<string, string | undefined>)['PORT'] ?? 3001;
  await app.listen(port);
  console.log(`BFF listening on port ${port}`);
}

if (require.main === module) {
  void bootstrap();
}

import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { AppModule } from './AppModule.js';

export async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, new FastifyAdapter());
  app.enableCors();
  // boundary: process.env values are untyped at runtime; validated via env schema at deploy
  const rawPort = (process.env as Record<string, string | undefined>)['PORT'];
  const parsedPort = rawPort == null ? Number.NaN : Number(rawPort);
  const port = Number.isFinite(parsedPort) ? parsedPort : 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`BFF listening on 0.0.0.0:${port}`);
}

if (require.main === module) {
  void bootstrap();
}

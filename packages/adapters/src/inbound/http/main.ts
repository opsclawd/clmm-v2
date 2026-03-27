import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './AppModule.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  const port = process.env['PORT'] ?? 3001;
  await app.listen(port);
  console.log(`BFF listening on port ${port}`);
}

void bootstrap();

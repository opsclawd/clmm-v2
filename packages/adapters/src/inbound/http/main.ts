import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AdaptersModule } from '../../composition/AdaptersModule';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AdaptersModule);
  const port = process.env['PORT'] ?? 3001;
  await app.listen(port);
  console.log(`BFF listening on port ${port}`);
}

void bootstrap();
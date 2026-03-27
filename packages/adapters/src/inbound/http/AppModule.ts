import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { PositionController } from './PositionController.js';

@Module({
  controllers: [PositionController],
  providers: [],
})
export class AppModule {}

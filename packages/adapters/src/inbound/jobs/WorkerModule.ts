import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { BreachScanJobHandler } from './BreachScanJobHandler.js';
import { TriggerQualificationJobHandler } from './TriggerQualificationJobHandler.js';
import { ReconciliationJobHandler } from './ReconciliationJobHandler.js';
import { NotificationDispatchJobHandler } from './NotificationDispatchJobHandler.js';

@Module({
  providers: [
    BreachScanJobHandler,
    TriggerQualificationJobHandler,
    ReconciliationJobHandler,
    NotificationDispatchJobHandler,
  ],
})
export class WorkerModule {}

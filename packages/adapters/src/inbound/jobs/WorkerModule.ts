import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { AdaptersModule } from '../../composition/AdaptersModule.js';
import { BreachScanJobHandler } from './BreachScanJobHandler.js';
import { TriggerQualificationJobHandler } from './TriggerQualificationJobHandler.js';
import { ReconciliationJobHandler } from './ReconciliationJobHandler.js';
import { NotificationDispatchJobHandler } from './NotificationDispatchJobHandler.js';
import { createPgBossProvider } from './PgBossProvider.js';
import { PG_BOSS, PG_BOSS_INSTANCE } from './tokens.js';
import { WorkerLifecycle } from './WorkerLifecycle.js';

// boundary: process.env values are untyped at runtime; validated via env schema at deploy
const dbUrl = (process.env as Record<string, string | undefined>)['DATABASE_URL'] ?? 'postgresql://localhost/clmm';
const boss = createPgBossProvider(dbUrl);

@Module({
  imports: [AdaptersModule],
  providers: [
    {
      provide: PG_BOSS_INSTANCE,
      useValue: boss,
    },
    {
      provide: PG_BOSS,
      useFactory: (pgBoss: typeof boss) => async (name: string, data: unknown) => {
        await pgBoss.send(name, data as object);
      },
      inject: [PG_BOSS_INSTANCE],
    },
    BreachScanJobHandler,
    TriggerQualificationJobHandler,
    ReconciliationJobHandler,
    NotificationDispatchJobHandler,
    WorkerLifecycle,
  ],
})
export class WorkerModule {}

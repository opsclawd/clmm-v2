import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { OrcaPositionReadAdapter } from '../outbound/solana-position-reads/OrcaPositionReadAdapter.js';
import { SolanaRangeObservationAdapter } from '../outbound/solana-position-reads/SolanaRangeObservationAdapter.js';
import { OperationalStorageAdapter } from '../outbound/storage/OperationalStorageAdapter.js';
import { OffChainHistoryStorageAdapter } from '../outbound/storage/OffChainHistoryStorageAdapter.js';
import { MonitoredWalletStorageAdapter } from '../outbound/storage/MonitoredWalletStorageAdapter.js';
import { NotificationDedupStorageAdapter } from '../outbound/storage/NotificationDedupStorageAdapter.js';
import { JupiterQuoteAdapter } from '../outbound/swap-execution/JupiterQuoteAdapter.js';
import { SolanaExecutionSubmissionAdapter } from '../outbound/swap-execution/SolanaExecutionSubmissionAdapter.js';
import { InAppAlertAdapter } from '../outbound/notifications/InAppAlertAdapter.js';
import { TelemetryAdapter } from '../outbound/observability/TelemetryAdapter.js';
import { createDb } from '../outbound/storage/db.js';
import type { ClockPort, IdGeneratorPort } from '@clmm/application';
import type { ClockTimestamp } from '@clmm/domain';

import {
  MONITORED_WALLET_REPOSITORY,
  SUPPORTED_POSITION_READ_PORT,
  RANGE_OBSERVATION_PORT,
  TRIGGER_REPOSITORY,
  EXECUTION_REPOSITORY,
  EXECUTION_HISTORY_REPOSITORY,
  EXECUTION_SUBMISSION_PORT,
  NOTIFICATION_PORT,
  NOTIFICATION_DEDUP_PORT,
  OBSERVABILITY_PORT,
  CLOCK_PORT,
  ID_GENERATOR_PORT,
} from '../inbound/jobs/tokens.js';

// boundary: process.env values are untyped at runtime; validated via env schema at deploy
const dbUrl = (process.env as Record<string, string | undefined>)['DATABASE_URL'] ?? 'postgresql://localhost/clmm';
const rpcUrl = (process.env as Record<string, string | undefined>)['SOLANA_RPC_URL'] ?? 'https://api.mainnet-beta.solana.com';

const db = createDb(dbUrl);

const systemClock: ClockPort = {
  now: () => Date.now() as ClockTimestamp,
};

let _idCounter = 0;
const systemIds: IdGeneratorPort = {
  generateId: () => `${Date.now()}-${++_idCounter}`,
};

const orcaPositionRead = new OrcaPositionReadAdapter(rpcUrl);
const rangeObservation = new SolanaRangeObservationAdapter(rpcUrl);
const operationalStorage = new OperationalStorageAdapter(db, systemIds, orcaPositionRead);
const historyStorage = new OffChainHistoryStorageAdapter(db);
const monitoredWalletStorage = new MonitoredWalletStorageAdapter(db);
const notificationDedupStorage = new NotificationDedupStorageAdapter(db);
const jupiterQuote = new JupiterQuoteAdapter();
const solanaSubmission = new SolanaExecutionSubmissionAdapter(rpcUrl);
const inAppAlert = new InAppAlertAdapter();
const telemetry = new TelemetryAdapter();

const sharedProviders = [
  { provide: MONITORED_WALLET_REPOSITORY, useValue: monitoredWalletStorage },
  { provide: SUPPORTED_POSITION_READ_PORT, useValue: orcaPositionRead },
  { provide: RANGE_OBSERVATION_PORT, useValue: rangeObservation },
  { provide: TRIGGER_REPOSITORY, useValue: operationalStorage },
  { provide: EXECUTION_REPOSITORY, useValue: operationalStorage },
  { provide: EXECUTION_HISTORY_REPOSITORY, useValue: historyStorage },
  { provide: EXECUTION_SUBMISSION_PORT, useValue: solanaSubmission },
  { provide: NOTIFICATION_PORT, useValue: inAppAlert },
  { provide: NOTIFICATION_DEDUP_PORT, useValue: notificationDedupStorage },
  { provide: OBSERVABILITY_PORT, useValue: telemetry },
  { provide: CLOCK_PORT, useValue: systemClock },
  { provide: ID_GENERATOR_PORT, useValue: systemIds },
];

@Module({
  providers: sharedProviders,
  exports: sharedProviders.map((p) => p.provide),
})
export class AdaptersModule {}

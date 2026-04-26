import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { SolanaPositionSnapshotReader } from '../outbound/solana-position-reads/SolanaPositionSnapshotReader.js';
import { OrcaPositionReadAdapter } from '../outbound/solana-position-reads/OrcaPositionReadAdapter.js';
import { SolanaRangeObservationAdapter } from '../outbound/solana-position-reads/SolanaRangeObservationAdapter.js';
import { OperationalStorageAdapter } from '../outbound/storage/OperationalStorageAdapter.js';
import { OffChainHistoryStorageAdapter } from '../outbound/storage/OffChainHistoryStorageAdapter.js';
import { MonitoredWalletStorageAdapter } from '../outbound/storage/MonitoredWalletStorageAdapter.js';
import { NotificationDedupStorageAdapter } from '../outbound/storage/NotificationDedupStorageAdapter.js';
import { SolanaExecutionPreparationAdapter } from '../outbound/swap-execution/SolanaExecutionPreparationAdapter.js';
import { SolanaExecutionSubmissionAdapter } from '../outbound/swap-execution/SolanaExecutionSubmissionAdapter.js';
import { DurableNotificationEventAdapter } from '../outbound/notifications/DurableNotificationEventAdapter.js';
import { TelemetryAdapter } from '../outbound/observability/TelemetryAdapter.js';
import { RegimeEngineExecutionEventAdapter } from '../outbound/regime-engine/RegimeEngineExecutionEventAdapter.js';
import { CurrentSrLevelsAdapter } from '../outbound/regime-engine/CurrentSrLevelsAdapter.js';
import { JupiterPriceAdapter } from '../outbound/price/JupiterPriceAdapter.js';
import type { RegimeEngineEventPort } from '../outbound/regime-engine/types.js';
import { createDb } from '../outbound/storage/db.js';
import type { ClockPort, IdGeneratorPort } from '@clmm/application';
import type { ClockTimestamp } from '@clmm/domain';

import {
  MONITORED_WALLET_REPOSITORY,
  SUPPORTED_POSITION_READ_PORT,
  RANGE_OBSERVATION_PORT,
  BREACH_EPISODE_REPOSITORY,
  TRIGGER_REPOSITORY,
  EXECUTION_REPOSITORY,
  EXECUTION_HISTORY_REPOSITORY,
  EXECUTION_PREPARATION_PORT,
  EXECUTION_SUBMISSION_PORT,
  NOTIFICATION_PORT,
  NOTIFICATION_DEDUP_PORT,
  OBSERVABILITY_PORT,
  CLOCK_PORT,
  ID_GENERATOR_PORT,
  REGIME_ENGINE_EVENT_PORT,
  CURRENT_SR_LEVELS_PORT,
  PRICE_PORT,
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

const snapshotReader = new SolanaPositionSnapshotReader(rpcUrl);
const orcaPositionRead = new OrcaPositionReadAdapter(rpcUrl, snapshotReader, db);
const rangeObservation = new SolanaRangeObservationAdapter(rpcUrl);
const operationalStorage = new OperationalStorageAdapter(db, systemIds);
const historyStorage = new OffChainHistoryStorageAdapter(db);
const monitoredWalletStorage = new MonitoredWalletStorageAdapter(db);
const notificationDedupStorage = new NotificationDedupStorageAdapter(db);
const solanaPreparation = new SolanaExecutionPreparationAdapter(rpcUrl, snapshotReader);
const solanaSubmission = new SolanaExecutionSubmissionAdapter(rpcUrl);
const durableNotificationEvent = new DurableNotificationEventAdapter(db, systemIds);
const telemetry = new TelemetryAdapter();
const regimeEngineBaseUrl = (process.env as Record<string, string | undefined>)['REGIME_ENGINE_BASE_URL'] ?? null;
const regimeEngineInternalToken = (process.env as Record<string, string | undefined>)['REGIME_ENGINE_INTERNAL_TOKEN'] ?? null;
const regimeEngineEventAdapter: RegimeEngineEventPort = new RegimeEngineExecutionEventAdapter(
  regimeEngineBaseUrl,
  regimeEngineInternalToken,
  telemetry,
);
const currentSrLevelsAdapter = new CurrentSrLevelsAdapter(regimeEngineBaseUrl, telemetry);
const jupiterPrice = new JupiterPriceAdapter();

const sharedProviders = [
  { provide: MONITORED_WALLET_REPOSITORY, useValue: monitoredWalletStorage },
  { provide: SUPPORTED_POSITION_READ_PORT, useValue: orcaPositionRead },
  { provide: RANGE_OBSERVATION_PORT, useValue: rangeObservation },
  { provide: BREACH_EPISODE_REPOSITORY, useValue: operationalStorage },
  { provide: TRIGGER_REPOSITORY, useValue: operationalStorage },
  { provide: EXECUTION_REPOSITORY, useValue: operationalStorage },
  { provide: EXECUTION_HISTORY_REPOSITORY, useValue: historyStorage },
  { provide: EXECUTION_PREPARATION_PORT, useValue: solanaPreparation },
  { provide: EXECUTION_SUBMISSION_PORT, useValue: solanaSubmission },
  { provide: NOTIFICATION_PORT, useValue: durableNotificationEvent },
  { provide: NOTIFICATION_DEDUP_PORT, useValue: notificationDedupStorage },
  { provide: OBSERVABILITY_PORT, useValue: telemetry },
  { provide: CLOCK_PORT, useValue: systemClock },
  { provide: ID_GENERATOR_PORT, useValue: systemIds },
  { provide: REGIME_ENGINE_EVENT_PORT, useValue: regimeEngineEventAdapter },
  { provide: CURRENT_SR_LEVELS_PORT, useValue: currentSrLevelsAdapter },
  { provide: PRICE_PORT, useValue: jupiterPrice },
];

@Module({
  providers: sharedProviders,
  exports: sharedProviders.map((p) => p.provide),
})
export class AdaptersModule {}

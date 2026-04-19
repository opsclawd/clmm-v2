import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { HealthController } from './HealthController.js';
import { PositionController } from './PositionController.js';
import { AlertController } from './AlertController.js';
import { PreviewController } from './PreviewController.js';
import { ExecutionController } from './ExecutionController.js';
import { WalletController } from './WalletController.js';
import { OperationalStorageAdapter } from '../../outbound/storage/OperationalStorageAdapter.js';
import { OffChainHistoryStorageAdapter } from '../../outbound/storage/OffChainHistoryStorageAdapter.js';
import { MonitoredWalletStorageAdapter } from '../../outbound/storage/MonitoredWalletStorageAdapter.js';
import { SolanaPositionSnapshotReader } from '../../outbound/solana-position-reads/SolanaPositionSnapshotReader.js';
import { OrcaPositionReadAdapter } from '../../outbound/solana-position-reads/OrcaPositionReadAdapter.js';
import { JupiterQuoteAdapter } from '../../outbound/swap-execution/JupiterQuoteAdapter.js';
import { SolanaExecutionPreparationAdapter } from '../../outbound/swap-execution/SolanaExecutionPreparationAdapter.js';
import { SolanaExecutionSubmissionAdapter } from '../../outbound/swap-execution/SolanaExecutionSubmissionAdapter.js';
import { TelemetryAdapter } from '../../outbound/observability/TelemetryAdapter.js';
import { RegimeEngineExecutionEventAdapter } from '../../outbound/regime-engine/RegimeEngineExecutionEventAdapter.js';
import type { RegimeEngineEventPort } from '../../outbound/regime-engine/types.js';
import { createDb } from '../../outbound/storage/db.js';
import type { ClockPort, IdGeneratorPort } from '@clmm/application';
import type { ClockTimestamp } from '@clmm/domain';
import {
  TRIGGER_REPOSITORY,
  EXECUTION_REPOSITORY,
  EXECUTION_HISTORY_REPOSITORY,
  EXECUTION_PREPARATION_PORT,
  EXECUTION_SUBMISSION_PORT,
  SUPPORTED_POSITION_READ_PORT,
  SWAP_QUOTE_PORT,
  CLOCK_PORT,
  ID_GENERATOR_PORT,
  MONITORED_WALLET_REPOSITORY,
  REGIME_ENGINE_EVENT_PORT,
} from './tokens.js';

// boundary: process.env values are untyped at runtime; validated via env schema at deploy
const dbUrl = (process.env as Record<string, string | undefined>)['DATABASE_URL'] ?? 'postgresql://localhost/clmm';
const db = createDb(dbUrl);
const rpcUrl = (process.env as Record<string, string | undefined>)['SOLANA_RPC_URL'] ?? 'https://api.mainnet-beta.solana.com';

const systemClock: ClockPort = {
  now: () => Date.now() as ClockTimestamp,
};

let _idCounter = 0;
const systemIds: IdGeneratorPort = {
  generateId: () => `${Date.now()}-${++_idCounter}`,
};

const snapshotReader = new SolanaPositionSnapshotReader(rpcUrl);
const orcaPositionRead = new OrcaPositionReadAdapter(rpcUrl, snapshotReader, db);
const operationalStorage = new OperationalStorageAdapter(db, systemIds);
const historyStorage = new OffChainHistoryStorageAdapter(db);
const jupiterQuote = new JupiterQuoteAdapter();
const solanaPreparation = new SolanaExecutionPreparationAdapter(rpcUrl, snapshotReader);
const solanaSubmission = new SolanaExecutionSubmissionAdapter(rpcUrl);
const monitoredWalletStorage = new MonitoredWalletStorageAdapter(db);
const telemetry = new TelemetryAdapter();
const regimeEngineBaseUrl = (process.env as Record<string, string | undefined>)['REGIME_ENGINE_BASE_URL'] ?? null;
const regimeEngineInternalToken = (process.env as Record<string, string | undefined>)['REGIME_ENGINE_INTERNAL_TOKEN'] ?? null;
const regimeEngineEventAdapter: RegimeEngineEventPort = new RegimeEngineExecutionEventAdapter(
  regimeEngineBaseUrl,
  regimeEngineInternalToken,
  telemetry,
);

@Module({
  controllers: [HealthController, PositionController, AlertController, PreviewController, ExecutionController, WalletController],
  providers: [
    { provide: TRIGGER_REPOSITORY, useValue: operationalStorage },
    { provide: EXECUTION_REPOSITORY, useValue: operationalStorage },
    { provide: EXECUTION_HISTORY_REPOSITORY, useValue: historyStorage },
    { provide: EXECUTION_PREPARATION_PORT, useValue: solanaPreparation },
    { provide: EXECUTION_SUBMISSION_PORT, useValue: solanaSubmission },
    { provide: SUPPORTED_POSITION_READ_PORT, useValue: orcaPositionRead },
    { provide: SWAP_QUOTE_PORT, useValue: jupiterQuote },
    { provide: CLOCK_PORT, useValue: systemClock },
    { provide: ID_GENERATOR_PORT, useValue: systemIds },
    { provide: MONITORED_WALLET_REPOSITORY, useValue: monitoredWalletStorage },
    { provide: REGIME_ENGINE_EVENT_PORT, useValue: regimeEngineEventAdapter },
  ],
})
export class AppModule {}

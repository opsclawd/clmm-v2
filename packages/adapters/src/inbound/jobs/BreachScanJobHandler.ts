/**
 * BreachScanJobHandler
 * pg-boss job handler — scans supported positions for breaches
 * Runs on a schedule (e.g., every 5 minutes) via WorkerModule
 */
import { Inject, Injectable } from '@nestjs/common';
import { scanPositionsForBreaches, recordExecutionAbandonment } from '@clmm/application';
import type {
  BreachEpisodeRepository,
  MonitoredWalletRepository,
  SupportedPositionReadPort,
  ExecutionRepository,
  ExecutionHistoryRepository,
  ClockPort,
  IdGeneratorPort,
  ObservabilityPort,
} from '@clmm/application';
import {
  BREACH_EPISODE_REPOSITORY,
  MONITORED_WALLET_REPOSITORY,
  SUPPORTED_POSITION_READ_PORT,
  EXECUTION_REPOSITORY,
  EXECUTION_HISTORY_REPOSITORY,
  CLOCK_PORT,
  ID_GENERATOR_PORT,
  OBSERVABILITY_PORT,
  PG_BOSS,
} from './tokens.js';

type EnqueueFn = (name: string, data: unknown) => Promise<void>;

@Injectable()
export class BreachScanJobHandler {
  static readonly JOB_NAME = 'breach-scan';

  constructor(
    @Inject(MONITORED_WALLET_REPOSITORY)
    private readonly monitoredWalletRepo: MonitoredWalletRepository,
    @Inject(SUPPORTED_POSITION_READ_PORT)
    private readonly positionReadPort: SupportedPositionReadPort,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
    @Inject(ID_GENERATOR_PORT)
    private readonly ids: IdGeneratorPort,
    @Inject(OBSERVABILITY_PORT)
    private readonly observability: ObservabilityPort,
    @Inject(BREACH_EPISODE_REPOSITORY)
    private readonly episodeRepo: BreachEpisodeRepository,
    @Inject(EXECUTION_REPOSITORY)
    private readonly executionRepo: ExecutionRepository,
    @Inject(EXECUTION_HISTORY_REPOSITORY)
    private readonly historyRepo: ExecutionHistoryRepository,
    @Inject(PG_BOSS)
    private readonly enqueue: EnqueueFn,
  ) {}

  async handle(): Promise<void> {
    let wallets: Awaited<ReturnType<MonitoredWalletRepository['listActiveWallets']>>;

    try {
      wallets = await this.monitoredWalletRepo.listActiveWallets();
    } catch (error: unknown) {
      this.observability.log('error', 'Breach scan failed before wallet iteration', {
        stage: 'list-active-wallets',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    for (const wallet of wallets) {
      try {
        const observations = await scanPositionsForBreaches({
          walletId: wallet.walletId,
          positionReadPort: this.positionReadPort,
          clock: this.clock,
          episodeRepo: this.episodeRepo,
        });

        for (const obs of observations.observations) {
          await this.enqueue('qualify-trigger', {
            positionId: obs.positionId,
            walletId: wallet.walletId,
            directionKind: obs.direction.kind,
            observedAt: obs.observedAt,
            episodeId: obs.episodeId,
            consecutiveCount: obs.consecutiveCount,
          });

          this.observability.recordDetectionTiming({
            positionId: obs.positionId,
            detectedAt: this.clock.now(),
            observedAt: obs.observedAt,
            durationMs: this.clock.now() - obs.observedAt,
          });
        }

        for (const abandonment of observations.abandonments) {
          const staleAttempts = await this.executionRepo.listAwaitingSignatureAttemptsByEpisode(abandonment.episodeId);

          if (staleAttempts.length > 1) {
            this.observability.log('warn', `Execution integrity violation for episode ${abandonment.episodeId}`, {
              episodeId: abandonment.episodeId,
              positionId: abandonment.positionId,
              reason: abandonment.reason,
              awaitingSignatureAttempts: staleAttempts.length,
            });
          }

          for (const attempt of staleAttempts) {
            await recordExecutionAbandonment({
              attemptId: attempt.attemptId,
              positionId: attempt.positionId,
              breachDirection: attempt.breachDirection,
              executionRepo: this.executionRepo,
              historyRepo: this.historyRepo,
              clock: this.clock,
              ids: this.ids,
            });

            this.observability.log('info', `Abandoned stale attempt ${attempt.attemptId} for closed episode`, {
              attemptId: attempt.attemptId,
              episodeId: abandonment.episodeId,
              positionId: abandonment.positionId,
              reason: abandonment.reason,
            });
          }
        }

        await this.monitoredWalletRepo.markScanned(wallet.walletId, this.clock.now());
      } catch (error: unknown) {
        this.observability.log('error', `Breach scan failed for wallet ${wallet.walletId}`, {
          walletId: wallet.walletId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

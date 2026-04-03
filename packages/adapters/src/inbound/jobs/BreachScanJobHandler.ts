/**
 * BreachScanJobHandler
 * pg-boss job handler — scans supported positions for breaches
 * Runs on a schedule (e.g., every 60 seconds) via WorkerModule
 */
import { Inject, Injectable } from '@nestjs/common';
import { scanPositionsForBreaches } from '@clmm/application';
import type {
  MonitoredWalletRepository,
  SupportedPositionReadPort,
  ClockPort,
  IdGeneratorPort,
  ObservabilityPort,
} from '@clmm/application';
import {
  MONITORED_WALLET_REPOSITORY,
  SUPPORTED_POSITION_READ_PORT,
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
          ids: this.ids,
        });

        for (const obs of observations) {
          await this.enqueue('qualify-trigger', {
            positionId: obs.positionId,
            walletId: wallet.walletId,
            directionKind: obs.direction.kind,
            observedAt: obs.observedAt,
            episodeId: obs.episodeId,
          });

          this.observability.recordDetectionTiming({
            positionId: obs.positionId,
            detectedAt: this.clock.now(),
            observedAt: obs.observedAt,
            durationMs: this.clock.now() - obs.observedAt,
          });
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

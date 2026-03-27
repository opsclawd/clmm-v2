/**
 * BreachScanJobHandler
 * pg-boss job handler — scans supported positions for breaches
 * Runs on a schedule (e.g., every 60 seconds) via WorkerModule
 */
export class BreachScanJobHandler {
  static readonly JOB_NAME = 'breach-scan';

  async handle(_data: { walletId: string }): Promise<void> {
    // TODO: inject and invoke ScanPositionsForBreaches use case in Epic 5
    console.log('BreachScanJobHandler: stub');
  }
}

import { describe, it, expect, beforeEach } from 'vitest';
import { BreachScanJobHandler } from './BreachScanJobHandler.js';
import {
  FakeBreachEpisodeRepository,
  FakeMonitoredWalletRepository,
  FakeSupportedPositionReadPort,
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeObservabilityPort,
  FakeExecutionRepository,
  FakeExecutionHistoryRepository,
  FIXTURE_WALLET_ID,
  FIXTURE_POSITION_BELOW_RANGE,
  FIXTURE_POSITION_IN_RANGE,
  FIXTURE_POSITION_ABOVE_RANGE,
  FIXTURE_POSITION_ID,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH, makePositionId } from '@clmm/domain';
import type { BreachEpisodeId } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';
import type { MonitoredWalletRepository } from '@clmm/application';

describe('BreachScanJobHandler', () => {
  let walletRepo: FakeMonitoredWalletRepository;
  let clock: FakeClockPort;
  let ids: FakeIdGeneratorPort;
  let observability: FakeObservabilityPort;
  let episodeRepo: FakeBreachEpisodeRepository;
  let executionRepo: FakeExecutionRepository;
  let historyRepo: FakeExecutionHistoryRepository;
  let enqueuedJobs: Array<{ name: string; data: unknown }>;
  let enqueue: (name: string, data: unknown) => Promise<void>;

  beforeEach(() => {
    walletRepo = new FakeMonitoredWalletRepository();
    clock = new FakeClockPort();
    ids = new FakeIdGeneratorPort('scan');
    observability = new FakeObservabilityPort();
    FakeBreachEpisodeRepository.resetCounter();
    episodeRepo = new FakeBreachEpisodeRepository();
    executionRepo = new FakeExecutionRepository();
    historyRepo = new FakeExecutionHistoryRepository();
    enqueuedJobs = [];
    enqueue = async (name: string, data: unknown) => {
      enqueuedJobs.push({ name, data });
    };
  });

  function buildHandler(positionReadPort: FakeSupportedPositionReadPort): BreachScanJobHandler {
    return new BreachScanJobHandler(
      walletRepo,
      positionReadPort,
      clock,
      ids,
      observability,
      episodeRepo,
      executionRepo,
      historyRepo,
      enqueue,
    );
  }

  it('enqueues qualify-trigger job for a below-range position', async () => {
    await walletRepo.enroll(FIXTURE_WALLET_ID, makeClockTimestamp(1_000));
    const positionRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_BELOW_RANGE]);
    const handler = buildHandler(positionRead);

    await handler.handle();

    expect(enqueuedJobs).toHaveLength(1);
    expect(enqueuedJobs[0]!.name).toBe('qualify-trigger');
    const data = enqueuedJobs[0]!.data as Record<string, unknown>;
    expect(data['positionId']).toBe(FIXTURE_POSITION_BELOW_RANGE.positionId);
    expect(data['directionKind']).toBe('lower-bound-breach');
    expect(data['walletId']).toBe(FIXTURE_WALLET_ID);
    expect(data['consecutiveCount']).toBe(1);
  });

  it('enqueues qualify-trigger with consecutiveCount from episode progression', async () => {
    await walletRepo.enroll(FIXTURE_WALLET_ID, makeClockTimestamp(1_000));
    const positionRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_BELOW_RANGE]);
    const handler = buildHandler(positionRead);

    await handler.handle();
    clock.advance(60_000);
    await handler.handle();

    expect(enqueuedJobs).toHaveLength(2);
    const data = enqueuedJobs[1]!.data as Record<string, unknown>;
    expect(data['consecutiveCount']).toBe(2);
  });

  it('does not enqueue jobs for in-range positions', async () => {
    await walletRepo.enroll(FIXTURE_WALLET_ID, makeClockTimestamp(1_000));
    const positionRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]);
    const handler = buildHandler(positionRead);

    await handler.handle();

    expect(enqueuedJobs).toHaveLength(0);
  });

  it('marks wallet as scanned after processing', async () => {
    await walletRepo.enroll(FIXTURE_WALLET_ID, makeClockTimestamp(1_000));
    const positionRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]);
    const handler = buildHandler(positionRead);

    await handler.handle();

    const wallets = await walletRepo.listActiveWallets();
    expect(wallets[0]!.lastScannedAt).toBe(clock.now());
  });

  it('logs error and continues when a wallet scan fails', async () => {
    await walletRepo.enroll(FIXTURE_WALLET_ID, makeClockTimestamp(1_000));
    const failingPositionRead = {
      async listSupportedPositions() {
        throw new Error('RPC timeout');
      },
      async getPosition(_walletId: string, _positionId: string) {
        return null;
      },
    } as unknown as FakeSupportedPositionReadPort;
    const handler = buildHandler(failingPositionRead);

    await handler.handle();

    const errorLogs = observability.logs.filter((entry) => entry.level === 'error');

    expect(errorLogs).toHaveLength(1);
    expect(errorLogs[0]!.message).toContain(FIXTURE_WALLET_ID);
  });

  it('logs and rethrows when loading monitored wallets fails before scanning begins', async () => {
    const brokenWalletRepo: MonitoredWalletRepository = {
      enroll: walletRepo.enroll.bind(walletRepo),
      unenroll: walletRepo.unenroll.bind(walletRepo),
      listActiveWallets: async () => {
        throw new Error('database unavailable');
      },
      markScanned: walletRepo.markScanned.bind(walletRepo),
    };

    const handler = new BreachScanJobHandler(
      brokenWalletRepo,
      new FakeSupportedPositionReadPort([FIXTURE_POSITION_BELOW_RANGE]),
      clock,
      ids,
      observability,
      episodeRepo,
      executionRepo,
      historyRepo,
      enqueue,
    );

    await expect(handler.handle()).rejects.toThrow('database unavailable');

    const errorLogs = observability.logs.filter((entry) => entry.level === 'error');
    expect(errorLogs).toHaveLength(1);
    expect(errorLogs[0]!.message).toBe('Breach scan failed before wallet iteration');
    expect(errorLogs[0]!.context?.['stage']).toBe('list-active-wallets');
    expect(errorLogs[0]!.context?.['error']).toBe('database unavailable');
  });

  it('abandons stale awaiting-signature attempt when position recovers', async () => {
    await walletRepo.enroll(FIXTURE_WALLET_ID, makeClockTimestamp(1_000));
    const breachHandler = buildHandler(new FakeSupportedPositionReadPort([FIXTURE_POSITION_BELOW_RANGE]));

    await breachHandler.handle();

    const queued = enqueuedJobs[0]!.data as Record<string, unknown>;
    const episodeId = queued['episodeId'] as BreachEpisodeId;

    await executionRepo.saveAttempt({
      attemptId: 'attempt-recover-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      episodeId,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });

    const recoveryHandler = buildHandler(new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]));
    await recoveryHandler.handle();

    const updated = await executionRepo.getAttempt('attempt-recover-1');
    expect(updated?.lifecycleState.kind).toBe('abandoned');
    expect(historyRepo.events.some((event) => event.eventType === 'abandoned')).toBe(true);
  });

  it('abandons stale awaiting-signature attempt on direction reversal', async () => {
    await walletRepo.enroll(FIXTURE_WALLET_ID, makeClockTimestamp(1_000));
    const firstHandler = buildHandler(new FakeSupportedPositionReadPort([FIXTURE_POSITION_BELOW_RANGE]));

    await firstHandler.handle();

    const queued = enqueuedJobs[0]!.data as Record<string, unknown>;
    const episodeId = queued['episodeId'] as BreachEpisodeId;

    await executionRepo.saveAttempt({
      attemptId: 'attempt-reversal-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      episodeId,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });

    const reversedHandler = buildHandler(new FakeSupportedPositionReadPort([FIXTURE_POSITION_ABOVE_RANGE]));
    await reversedHandler.handle();

    const updated = await executionRepo.getAttempt('attempt-reversal-1');
    expect(updated?.lifecycleState.kind).toBe('abandoned');

    const secondQueueData = enqueuedJobs[1]!.data as Record<string, unknown>;
    expect(secondQueueData['directionKind']).toBe(UPPER_BOUND_BREACH.kind);
  });

  it('logs warning when multiple awaiting-signature attempts exist for one episode', async () => {
    await walletRepo.enroll(FIXTURE_WALLET_ID, makeClockTimestamp(1_000));
    const firstHandler = buildHandler(new FakeSupportedPositionReadPort([FIXTURE_POSITION_BELOW_RANGE]));

    await firstHandler.handle();

    const queued = enqueuedJobs[0]!.data as Record<string, unknown>;
    const episodeId = queued['episodeId'] as BreachEpisodeId;

    await executionRepo.saveAttempt({
      attemptId: 'attempt-integrity-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      episodeId,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });
    await executionRepo.saveAttempt({
      attemptId: 'attempt-integrity-2',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      episodeId,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });

    const recoveryHandler = buildHandler(new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]));
    await recoveryHandler.handle();

    const warnLog = observability.logs.find(
      (entry) => entry.level === 'warn' && entry.message.toLowerCase().includes('integrity'),
    );
    expect(warnLog).toBeDefined();

    const abandonedInfoLogs = observability.logs.filter(
      (entry) => entry.level === 'info' && entry.message.toLowerCase().includes('abandoned stale attempt'),
    );
    expect(abandonedInfoLogs).toHaveLength(2);
  });

  it('uses attempt position id when abandoning stale attempts', async () => {
    await walletRepo.enroll(FIXTURE_WALLET_ID, makeClockTimestamp(1_000));
    const breachHandler = buildHandler(new FakeSupportedPositionReadPort([FIXTURE_POSITION_BELOW_RANGE]));

    await breachHandler.handle();

    const queued = enqueuedJobs[0]!.data as Record<string, unknown>;
    const episodeId = queued['episodeId'] as BreachEpisodeId;

    const mismatchedPositionId = makePositionId('mismatched-position');
    await executionRepo.saveAttempt({
      attemptId: 'attempt-mismatched-position',
      positionId: mismatchedPositionId,
      breachDirection: LOWER_BOUND_BREACH,
      episodeId,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });

    const recoveryHandler = buildHandler(new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]));
    await recoveryHandler.handle();

    const updated = await executionRepo.getAttempt('attempt-mismatched-position');
    expect(updated?.lifecycleState.kind).toBe('abandoned');
  });
});

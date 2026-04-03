import { describe, it, expect, beforeEach } from 'vitest';
import { BreachScanJobHandler } from './BreachScanJobHandler.js';
import {
  FakeMonitoredWalletRepository,
  FakeSupportedPositionReadPort,
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeObservabilityPort,
  FIXTURE_WALLET_ID,
  FIXTURE_POSITION_BELOW_RANGE,
  FIXTURE_POSITION_IN_RANGE,
} from '@clmm/testing';
import { makeClockTimestamp } from '@clmm/domain';
import type { MonitoredWalletRepository } from '@clmm/application';

describe('BreachScanJobHandler', () => {
  let walletRepo: FakeMonitoredWalletRepository;
  let clock: FakeClockPort;
  let ids: FakeIdGeneratorPort;
  let observability: FakeObservabilityPort;
  let enqueuedJobs: Array<{ name: string; data: unknown }>;
  let enqueue: (name: string, data: unknown) => Promise<void>;

  beforeEach(() => {
    walletRepo = new FakeMonitoredWalletRepository();
    clock = new FakeClockPort();
    ids = new FakeIdGeneratorPort('scan');
    observability = new FakeObservabilityPort();
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
      enqueue,
    );

    await expect(handler.handle()).rejects.toThrow('database unavailable');

    const errorLogs = observability.logs.filter((entry) => entry.level === 'error');
    expect(errorLogs).toHaveLength(1);
    expect(errorLogs[0]!.message).toBe('Breach scan failed before wallet iteration');
    expect(errorLogs[0]!.context?.['stage']).toBe('list-active-wallets');
    expect(errorLogs[0]!.context?.['error']).toBe('database unavailable');
  });
});

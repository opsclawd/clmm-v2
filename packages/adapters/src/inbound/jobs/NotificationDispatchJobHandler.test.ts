import { describe, it, expect, beforeEach } from 'vitest';
import { NotificationDispatchJobHandler } from './NotificationDispatchJobHandler.js';
import {
  FakeNotificationPort,
  FakeNotificationDedupPort,
  FakeObservabilityPort,
  FakeClockPort,
} from '@clmm/testing';

type ObservabilityLog = {
  level: 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown> | undefined;
};

describe('NotificationDispatchJobHandler', () => {
  let notificationPort: FakeNotificationPort;
  let dedupPort: FakeNotificationDedupPort;
  let observability: FakeObservabilityPort;
  let clock: FakeClockPort;
  let handler: NotificationDispatchJobHandler;

  beforeEach(() => {
    notificationPort = new FakeNotificationPort();
    dedupPort = new FakeNotificationDedupPort();
    observability = new FakeObservabilityPort();
    clock = new FakeClockPort(1_000_000);

    // Construct directly without NestJS DI
    handler = new NotificationDispatchJobHandler(
      notificationPort,
      dedupPort,
      observability,
      clock,
    );
  });

  it('dispatches notification for a fresh trigger and marks it as dispatched', async () => {
    await handler.handle({
      triggerId: 'trigger-1',
      walletId: 'wallet-1',
      positionId: 'position-1',
      directionKind: 'lower-bound-breach',
    });

    expect(await dedupPort.hasDispatched('trigger-1')).toBe(true);
    expect(notificationPort.dispatched).toHaveLength(1);
    expect(notificationPort.dispatched[0]?.triggerId).toBe('trigger-1');
    expect(
      observability.logs.some((l: ObservabilityLog) => l.level === 'info' && l.message.includes('trigger-1')),
    ).toBe(true);
    expect(observability.deliveryTimings).toHaveLength(1);
  });

  it('skips dispatch when trigger was already dispatched', async () => {
    await dedupPort.markDispatched('trigger-2');

    await handler.handle({
      triggerId: 'trigger-2',
      walletId: 'wallet-2',
      positionId: 'position-2',
      directionKind: 'upper-bound-breach',
    });

    // Should complete without error
    expect(notificationPort.dispatched).toHaveLength(0);
    expect(observability.deliveryTimings).toHaveLength(0);
    // Info log should still be recorded (dispatched=false)
    expect(
      observability.logs.some((l: ObservabilityLog) => l.level === 'info' && l.message.includes('dispatched=false')),
    ).toBe(true);
  });

  it('catches notification errors and logs them without rethrowing', async () => {
    // Create a port that throws on sendActionableAlert
    const failingPort = {
      async sendActionableAlert(): Promise<never> {
        throw new Error('Push service unavailable');
      },
    } as unknown as FakeNotificationPort;

    const failingHandler = new NotificationDispatchJobHandler(
      failingPort,
      dedupPort,
      observability,
      clock,
    );

    // Should NOT throw
    await failingHandler.handle({
      triggerId: 'trigger-3',
      walletId: 'wallet-3',
      positionId: 'position-3',
      directionKind: 'lower-bound-breach',
    });

    expect(
      observability.logs.some(
        (l: ObservabilityLog) =>
          l.level === 'error' && l.message.includes('trigger-3') && l.context?.['error'] === 'Push service unavailable',
      ),
    ).toBe(true);
  });
});

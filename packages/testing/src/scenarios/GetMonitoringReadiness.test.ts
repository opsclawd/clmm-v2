import { describe, it, expect } from 'vitest';
import { getMonitoringReadiness } from '@clmm/application';
import { FakeNotificationPermissionPort } from '../fakes/FakeNotificationPermissionPort.js';
import { FakePlatformCapabilityPort } from '../fakes/FakePlatformCapabilityPort.js';

describe('GetMonitoringReadiness', () => {
  it('returns full readiness when all capabilities available', async () => {
    const permissionPort = new FakeNotificationPermissionPort();
    permissionPort.setState('granted');
    const capabilityPort = new FakePlatformCapabilityPort();

    const result = await getMonitoringReadiness({ permissionPort, capabilityPort });

    expect(result.notificationPermission).toBe('granted');
    expect(result.monitoringActive).toBe(true);
    expect(result.platformCapabilities.nativePushAvailable).toBe(true);
  });

  it('returns degraded when notification permission denied', async () => {
    const permissionPort = new FakeNotificationPermissionPort();
    permissionPort.setState('denied');
    const capabilityPort = new FakePlatformCapabilityPort();

    const result = await getMonitoringReadiness({ permissionPort, capabilityPort });

    expect(result.notificationPermission).toBe('denied');
    expect(result.monitoringActive).toBe(false);
  });

  it('returns undetermined when permission not yet requested', async () => {
    const permissionPort = new FakeNotificationPermissionPort();
    const capabilityPort = new FakePlatformCapabilityPort();

    const result = await getMonitoringReadiness({ permissionPort, capabilityPort });

    expect(result.notificationPermission).toBe('undetermined');
    expect(result.monitoringActive).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { syncPlatformCapabilities } from './SyncPlatformCapabilities.js';
import { FakePlatformCapabilityPort } from '@clmm/testing';

describe('SyncPlatformCapabilities', () => {
  it('returns current platform capabilities', async () => {
    const capabilityPort = new FakePlatformCapabilityPort();
    const result = await syncPlatformCapabilities({ capabilityPort });

    expect(result.capabilities.nativePushAvailable).toBe(true);
    expect(result.capabilities.nativeWalletAvailable).toBe(true);
    expect(result.capabilities.browserWalletAvailable).toBe(false);
  });

  it('reflects updated capabilities', async () => {
    const capabilityPort = new FakePlatformCapabilityPort();
    capabilityPort.setCapabilities({ nativePushAvailable: false, isMobileWeb: true });

    const result = await syncPlatformCapabilities({ capabilityPort });

    expect(result.capabilities.nativePushAvailable).toBe(false);
    expect(result.capabilities.isMobileWeb).toBe(true);
  });
});

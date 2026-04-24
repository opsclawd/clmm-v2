import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebPlatformCapabilityAdapter } from './WebPlatformCapabilityAdapter';

describe('WebPlatformCapabilityAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects a browser wallet from Phantom scoped Solana provider', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    });
    vi.stubGlobal('phantom', {
      solana: { connect: vi.fn() },
    });

    const adapter = new WebPlatformCapabilityAdapter();

    await expect(adapter.getCapabilities()).resolves.toMatchObject({
      browserWalletAvailable: true,
      isMobileWeb: true,
    });
  });
});

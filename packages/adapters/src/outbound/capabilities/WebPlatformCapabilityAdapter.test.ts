import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function setupFreshAdapter() {
  vi.resetModules();
  vi.doMock('@wallet-standard/app', () => ({
    getWallets: () => ({ get: () => [] }),
  }));
  return import('./WebPlatformCapabilityAdapter').then(
    ({ WebPlatformCapabilityAdapter }) => new WebPlatformCapabilityAdapter(),
  );
}

describe('WebPlatformCapabilityAdapter', () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>)['phantom'];
    delete (globalThis as Record<string, unknown>)['solana'];
  });

  afterEach(() => {
    vi.resetModules();
  });

  function setUserAgent(ua: string) {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: ua },
      writable: true,
      configurable: true,
    });
  }

  it('returns true when Wallet Standard registry has a Solana wallet', async () => {
    (globalThis as Record<string, unknown>)['window'] = globalThis;
    vi.resetModules();
    vi.doMock('@wallet-standard/app', () => ({
      getWallets: () => ({ get: () => [{ name: 'MockWallet' }] }),
    }));
    const { WebPlatformCapabilityAdapter: Adapter } = await import('./WebPlatformCapabilityAdapter');
    const adapter = new Adapter();
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X)');

    try {
      const result = await adapter.getCapabilities();
      expect(result.browserWalletAvailable).toBe(true);
    } finally {
      delete (globalThis as Record<string, unknown>)['window'];
    }
  });

  it('falls back to Phantom injected provider when Wallet Standard is empty', async () => {
    const adapter = await setupFreshAdapter();
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X)');
    (globalThis as Record<string, unknown>)['phantom'] = {
      solana: { connect: () => {} },
    };

    const result = await adapter.getCapabilities();
    expect(result.browserWalletAvailable).toBe(true);
  });

  it('falls back to window.solana injected provider', async () => {
    const adapter = await setupFreshAdapter();
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X)');
    (globalThis as Record<string, unknown>)['solana'] = {
      connect: () => {},
    };

    const result = await adapter.getCapabilities();
    expect(result.browserWalletAvailable).toBe(true);
  });

  it('returns true for Android Chrome MWA-plausible surface', async () => {
    const adapter = await setupFreshAdapter();
    setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36');

    const result = await adapter.getCapabilities();
    expect(result.browserWalletAvailable).toBe(true);
  });

  it('returns false on iOS Safari without injected wallet', async () => {
    const adapter = await setupFreshAdapter();
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1');

    const result = await adapter.getCapabilities();
    expect(result.browserWalletAvailable).toBe(false);
  });

  it('returns false on Android Firefox without injected wallet', async () => {
    const adapter = await setupFreshAdapter();
    setUserAgent('Mozilla/5.0 (Android 14; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0');

    const result = await adapter.getCapabilities();
    expect(result.browserWalletAvailable).toBe(false);
  });

  it('returns false on Android Brave without injected wallet', async () => {
    const adapter = await setupFreshAdapter();
    setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36 Brave/1.60');

    const result = await adapter.getCapabilities();
    expect(result.browserWalletAvailable).toBe(false);
  });

  it('returns false on Android Opera without injected wallet', async () => {
    const adapter = await setupFreshAdapter();
    setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36 OPR/80.0');

    const result = await adapter.getCapabilities();
    expect(result.browserWalletAvailable).toBe(false);
  });

  it('returns false on desktop browser without wallet', async () => {
    const adapter = await setupFreshAdapter();
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');

    const result = await adapter.getCapabilities();
    expect(result.browserWalletAvailable).toBe(false);
  });

  it('returns false on Android Edge without injected wallet', async () => {
    const adapter = await setupFreshAdapter();
    setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36 Edg/120.0');

    const result = await adapter.getCapabilities();
    expect(result.browserWalletAvailable).toBe(false);
  });

  it('sets isMobileWeb true for mobile user agents', async () => {
    const adapter = await setupFreshAdapter();
    setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36');

    const result = await adapter.getCapabilities();
    expect(result.isMobileWeb).toBe(true);
  });

  it('sets isMobileWeb false for desktop user agents', async () => {
    const adapter = await setupFreshAdapter();
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');

    const result = await adapter.getCapabilities();
    expect(result.isMobileWeb).toBe(false);
  });
});
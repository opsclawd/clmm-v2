import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  navigateRoute,
  normalizeExpoRouterRoute,
  isSolanaMobileWebView,
  hasBrowserWalletPresence,
  WALLET_WEBVIEW_NAVIGATION_STRATEGY,
  _setStrategyForTesting,
} from './webNavigation';

describe('hasBrowserWalletPresence', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when window.solana.connect exists', () => {
    vi.stubGlobal('window', { solana: { connect: vi.fn() } });
    expect(hasBrowserWalletPresence()).toBe(true);
  });

  it('returns true when window.phantom.solana.connect exists', () => {
    vi.stubGlobal('window', { phantom: { solana: { connect: vi.fn() } } });
    expect(hasBrowserWalletPresence()).toBe(true);
  });

  it('returns true when window.solflare.connect exists', () => {
    vi.stubGlobal('window', { solflare: { connect: vi.fn() } });
    expect(hasBrowserWalletPresence()).toBe(true);
  });

  it('returns true when window.solana.connect is present alongside phantom', () => {
    vi.stubGlobal('window', { solana: { connect: vi.fn() }, phantom: { solana: { connect: vi.fn() } } });
    expect(hasBrowserWalletPresence()).toBe(true);
  });

  it('returns false when window.solana has no connect function', () => {
    vi.stubGlobal('window', { solana: { isPhantom: true } });
    expect(hasBrowserWalletPresence()).toBe(false);
  });

  it('returns false when window.phantom exists but has no solana.connect', () => {
    vi.stubGlobal('window', { phantom: { ethereum: {} } });
    expect(hasBrowserWalletPresence()).toBe(false);
  });

  it('returns false when no wallet objects exist on window', () => {
    vi.stubGlobal('window', {});
    expect(hasBrowserWalletPresence()).toBe(false);
  });

  it('returns false when window is undefined', () => {
    vi.stubGlobal('window', undefined);
    expect(hasBrowserWalletPresence()).toBe(false);
  });
});

describe('isSolanaMobileWebView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true on Android WebView with window.solana.connect', () => {
    vi.stubGlobal('window', { solana: { connect: vi.fn() } });
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 (wv)' });
    expect(isSolanaMobileWebView()).toBe(true);
  });

  it('returns true on iOS iPhone with window.solana.connect', () => {
    vi.stubGlobal('window', { solana: { connect: vi.fn() } });
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' });
    expect(isSolanaMobileWebView()).toBe(true);
  });

  it('returns true on iPhone with Wallet Standard wallet via phantom.solana.connect', () => {
    vi.stubGlobal('window', { phantom: { solana: { connect: vi.fn() } } });
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' });
    expect(isSolanaMobileWebView()).toBe(true);
  });

  it('returns true on iPhone with Phantom injected provider', () => {
    vi.stubGlobal('window', { solana: { connect: vi.fn() }, phantom: { solana: { connect: vi.fn() } } });
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' });
    expect(isSolanaMobileWebView()).toBe(true);
  });

  it('returns false on iPhone Safari with no wallet', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' });
    expect(isSolanaMobileWebView()).toBe(false);
  });

  it('returns true on Android Phantom browser with injected provider', () => {
    vi.stubGlobal('window', { solana: { connect: vi.fn() } });
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Phantom' });
    expect(isSolanaMobileWebView()).toBe(true);
  });

  it('returns false on Android Chrome with no wallet', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' });
    expect(isSolanaMobileWebView()).toBe(false);
  });

  it('returns false on desktop browser with window.solana.connect (e.g. Phantom extension)', () => {
    vi.stubGlobal('window', { solana: { connect: vi.fn() } });
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' });
    expect(isSolanaMobileWebView()).toBe(false);
  });

  it('returns false on desktop browser with phantom.solana.connect (e.g. Phantom extension)', () => {
    vi.stubGlobal('window', { phantom: { solana: { connect: vi.fn() } } });
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' });
    expect(isSolanaMobileWebView()).toBe(false);
  });

  it('returns true on iPad WebView with window.solana.connect', () => {
    vi.stubGlobal('window', { solana: { connect: vi.fn() } });
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15' });
    expect(isSolanaMobileWebView()).toBe(true);
  });

  it('returns false on mobile user agent without wallet (e.g. Chrome mobile)', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Mobile Safari/537.36 (wv)' });
    expect(isSolanaMobileWebView()).toBe(false);
  });

  it('returns false when window.solana exists but has no connect function', () => {
    vi.stubGlobal('window', { solana: { isPhantom: true } });
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' });
    expect(isSolanaMobileWebView()).toBe(false);
  });

  it('returns true when Solflare wallet browser UA signal is present with solflare inject', () => {
    vi.stubGlobal('window', { solflare: { connect: vi.fn() } });
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Solflare' });
    expect(isSolanaMobileWebView()).toBe(true);
  });

  it('returns false on social-app webview without wallet signal', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36;Instagram' });
    expect(isSolanaMobileWebView()).toBe(false);
  });

  it('returns true on Android Mobile with wallet injection', () => {
    vi.stubGlobal('window', { solana: { connect: vi.fn() } });
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' });
    expect(isSolanaMobileWebView()).toBe(true);
  });
});

describe('normalizeExpoRouterRoute', () => {
  it('strips (tabs) group prefix', () => {
    expect(normalizeExpoRouterRoute('/(tabs)/positions')).toBe('/positions');
    expect(normalizeExpoRouterRoute('/(tabs)/history')).toBe('/history');
  });

  it('leaves non-group paths unchanged', () => {
    expect(normalizeExpoRouterRoute('/position/abc')).toBe('/position/abc');
    expect(normalizeExpoRouterRoute('/connect')).toBe('/connect');
  });
});

describe('navigateRoute', () => {
  it('uses router.push for push method', () => {
    const router = {
      push: vi.fn(),
      replace: vi.fn(),
    };

    navigateRoute({
      router,
      path: '/position/abc',
      method: 'push',
    });

    expect(router.push).toHaveBeenCalledWith('/position/abc');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('uses router.replace for replace method', () => {
    const router = {
      push: vi.fn(),
      replace: vi.fn(),
    };

    navigateRoute({
      router,
      path: '/connect',
      method: 'replace',
    });

    expect(router.replace).toHaveBeenCalledWith('/connect');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('normalizes group paths to canonical form before routing', () => {
    const router = {
      push: vi.fn(),
      replace: vi.fn(),
    };

    navigateRoute({
      router,
      path: '/(tabs)/positions',
      method: 'replace',
    });

    expect(router.replace).toHaveBeenCalledWith('/positions');
  });

  it('preserves dynamic route params', () => {
    const router = {
      push: vi.fn(),
      replace: vi.fn(),
    };

    navigateRoute({
      router,
      path: '/signing/attempt-123?previewId=prev-456&triggerId=trig-789',
      method: 'push',
    });

    expect(router.push).toHaveBeenCalledWith('/signing/attempt-123?previewId=prev-456&triggerId=trig-789');
  });

  it('uses window.location hard navigation in Solana mobile WebView', () => {
    const replaceFn = vi.fn();
    vi.stubGlobal('window', {
      solana: { connect: vi.fn() },
      location: { origin: 'https://app.example.com', replace: replaceFn, href: '' },
    });
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' });

    const router = { push: vi.fn(), replace: vi.fn() };

    navigateRoute({ router, path: '/positions', method: 'replace' });

    expect(replaceFn).toHaveBeenCalledWith('https://app.example.com/positions');
    expect(router.replace).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});

describe('navigateRoute strategy dispatch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    _setStrategyForTesting('hard-fallback');
  });

  it("under 'soft-preferred', desktop browser with extension uses Expo Router soft navigation", () => {
    _setStrategyForTesting('soft-preferred');

    vi.stubGlobal('window', { phantom: { solana: { connect: vi.fn() } } });
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const router = { push: vi.fn(), replace: vi.fn() };
    navigateRoute({ router, path: '/positions', method: 'push' });

    expect(router.push).toHaveBeenCalledWith('/positions');
  });

  it("under 'soft-preferred', Solana mobile WebView still falls back to hard navigation", () => {
    _setStrategyForTesting('soft-preferred');

    const replaceFn = vi.fn();
    vi.stubGlobal('window', {
      solana: { connect: vi.fn() },
      location: { origin: 'https://app.example.com', replace: replaceFn, href: '' },
    });
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    });

    const router = { push: vi.fn(), replace: vi.fn() };
    navigateRoute({ router, path: '/positions', method: 'replace' });

    expect(replaceFn).toHaveBeenCalledWith('https://app.example.com/positions');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("under 'hard-fallback', Solana mobile WebView uses window.location (current default)", () => {
    _setStrategyForTesting('hard-fallback');

    const replaceFn = vi.fn();
    vi.stubGlobal('window', {
      solana: { connect: vi.fn() },
      location: { origin: 'https://app.example.com', replace: replaceFn, href: '' },
    });
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    });

    const router = { push: vi.fn(), replace: vi.fn() };
    navigateRoute({ router, path: '/positions', method: 'replace' });

    expect(replaceFn).toHaveBeenCalledWith('https://app.example.com/positions');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("under 'capability-driven', warns and falls back to hard-fallback behavior", () => {
    _setStrategyForTesting('capability-driven');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const replaceFn = vi.fn();
    vi.stubGlobal('window', {
      solana: { connect: vi.fn() },
      location: { origin: 'https://app.example.com', replace: replaceFn, href: '' },
    });
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    });

    const router = { push: vi.fn(), replace: vi.fn() };
    navigateRoute({ router, path: '/positions', method: 'replace' });

    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toContain("'capability-driven'");
    expect(replaceFn).toHaveBeenCalledWith('https://app.example.com/positions');
    expect(router.replace).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

describe('WALLET_WEBVIEW_NAVIGATION_STRATEGY', () => {
  it('is one of the three allowed values', () => {
    expect(['soft-preferred', 'hard-fallback', 'capability-driven']).toContain(
      WALLET_WEBVIEW_NAVIGATION_STRATEGY,
    );
  });

  it('defaults to hard-fallback before any outcome is applied', () => {
    expect(WALLET_WEBVIEW_NAVIGATION_STRATEGY).toBe('hard-fallback');
  });
});
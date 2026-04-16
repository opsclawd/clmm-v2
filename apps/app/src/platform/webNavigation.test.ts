import { describe, expect, it, vi, afterEach } from 'vitest';
import { navigateRoute, normalizeExpoRouterRoute, isSolanaMobileWebView } from './webNavigation';

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

  it('returns false on desktop browser with window.solana.connect (e.g. Phantom extension)', () => {
    vi.stubGlobal('window', { solana: { connect: vi.fn() } });
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' });

    expect(isSolanaMobileWebView()).toBe(false);
  });

  it('returns true on iPad WebView with window.solana.connect', () => {
    vi.stubGlobal('window', { solana: { connect: vi.fn() } });
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15' });

    expect(isSolanaMobileWebView()).toBe(true);
  });

  it('returns false on mobile user agent without window.solana (e.g. Chrome mobile)', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Mobile Safari/537.36 (wv)' });

    expect(isSolanaMobileWebView()).toBe(false);
  });

  it('returns false when window.solana exists but has no connect function', () => {
    vi.stubGlobal('window', { solana: { isPhantom: true } });
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' });

    expect(isSolanaMobileWebView()).toBe(false);
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

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { navigateRoute, normalizeExpoRouterRoute } from './webNavigation';

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
});
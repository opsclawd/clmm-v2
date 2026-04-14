import { describe, expect, it, vi } from 'vitest';
import { navigateRoute, normalizeExpoRouterRoute } from './webNavigation';

describe('webNavigation', () => {
  it('normalizes expo router group paths to concrete web paths', () => {
    expect(normalizeExpoRouterRoute('/(tabs)/positions')).toBe('/positions');
    expect(normalizeExpoRouterRoute('/position/abc')).toBe('/position/abc');
  });

  it('uses hard browser navigation for mobile web replaces', () => {
    const router = {
      push: vi.fn(),
      replace: vi.fn(),
    };
    const location = {
      assign: vi.fn(),
      replace: vi.fn(),
    };

    navigateRoute({
      router,
      location,
      path: '/(tabs)/positions',
      method: 'replace',
      isMobileWeb: true,
    });

    expect(location.replace).toHaveBeenCalledWith('/positions');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('uses router push on non-mobile web navigations', () => {
    const router = {
      push: vi.fn(),
      replace: vi.fn(),
    };
    const location = {
      assign: vi.fn(),
      replace: vi.fn(),
    };

    navigateRoute({
      router,
      location,
      path: '/position/abc',
      method: 'push',
      isMobileWeb: false,
    });

    expect(router.push).toHaveBeenCalledWith('/position/abc');
    expect(location.assign).not.toHaveBeenCalled();
  });
});

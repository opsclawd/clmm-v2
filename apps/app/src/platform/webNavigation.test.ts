import { describe, expect, it, vi } from 'vitest';
import { navigateRoute } from './webNavigation';

describe('webNavigation', () => {
  it('uses router.push for push method', () => {
    const router = {
      push: vi.fn(),
      replace: vi.fn(),
    };

    navigateRoute({
      router,
      path: '/position?id=abc',
      method: 'push',
    });

    expect(router.push).toHaveBeenCalledWith('/position?id=abc');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('uses router.replace for replace method', () => {
    const router = {
      push: vi.fn(),
      replace: vi.fn(),
    };

    navigateRoute({
      router,
      path: '/(tabs)/positions',
      method: 'replace',
    });

    expect(router.replace).toHaveBeenCalledWith('/(tabs)/positions');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('preserves expo router group paths without normalization', () => {
    const router = {
      push: vi.fn(),
      replace: vi.fn(),
    };

    navigateRoute({
      router,
      path: '/(tabs)/positions',
      method: 'push',
    });

    expect(router.push).toHaveBeenCalledWith('/(tabs)/positions');
  });

  it('preserves dynamic route params', () => {
    const router = {
      push: vi.fn(),
      replace: vi.fn(),
    };

    navigateRoute({
      router,
      path: '/signing?attemptId=attempt-123&previewId=prev-456&triggerId=trig-789',
      method: 'push',
    });

    expect(router.push).toHaveBeenCalledWith('/signing?attemptId=attempt-123&previewId=prev-456&triggerId=trig-789');
  });
});

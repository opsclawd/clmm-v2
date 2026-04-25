import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import type { WalletBootStatus } from '../state/deriveWalletBootStatus';
import { WalletBootContext } from './walletBootContext';

const navigateMock = vi.fn();
vi.mock('../platform/webNavigation', () => ({
  navigateRoute: (...args: unknown[]) => navigateMock(...args),
}));

vi.mock('react-native', () => ({
  ActivityIndicator: ({ size, color }: { size: string; color: string }) => {
    const React = require('react');
    return React.createElement('ActivityIndicator', { size, color });
  },
  Text: ({ children, style }: { children: React.ReactNode; style?: unknown }) => {
    const React = require('react');
    return React.createElement('span', { style }, children);
  },
  View: ({ children, style }: { children: React.ReactNode; style?: unknown }) => {
    const React = require('react');
    return React.createElement('div', { style }, children);
  },
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => mockPathname,
  useGlobalSearchParams: () => mockSearch,
}));

let mockPathname = '/positions/abc';
let mockSearch: Record<string, string | string[] | undefined> = {};

import { RequireWallet } from './RequireWallet';

function Harness({ initial }: { initial: WalletBootStatus }) {
  const [status, setStatus] = useState<WalletBootStatus>(initial);
  return (
    <WalletBootContext.Provider value={status}>
      <RequireWallet>
        <span data-testid="children">child content</span>
      </RequireWallet>
      <button data-testid="set-connected" onClick={() => setStatus('connected')}>c</button>
      <button data-testid="set-disconnected" onClick={() => setStatus('disconnected')}>d</button>
    </WalletBootContext.Provider>
  );
}

beforeEach(() => {
  navigateMock.mockReset();
  mockPathname = '/positions/abc';
  mockSearch = {};
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RequireWallet', () => {
  it('renders BootScreen when status is hydrating-storage', () => {
    render(<Harness initial="hydrating-storage" />);
    expect(screen.getByText('Loading\u2026')).toBeTruthy();
    expect(screen.queryByTestId('children')).toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('renders BootScreen when status is checking-browser-wallet', () => {
    render(<Harness initial="checking-browser-wallet" />);
    expect(screen.getByText('Restoring wallet session\u2026')).toBeTruthy();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('renders children when status is connected', () => {
    render(<Harness initial="connected" />);
    expect(screen.getByTestId('children')).toBeTruthy();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('navigates to /connect with encoded returnTo when status is disconnected', () => {
    mockPathname = '/preview/abc';
    mockSearch = { triggerId: 'xyz' };
    render(<Harness initial="disconnected" />);
    expect(navigateMock).toHaveBeenCalledTimes(1);
    const call = navigateMock.mock.calls[0]![0] as { path: string; method: string };
    expect(call.method).toBe('push');
    expect(call.path).toBe('/connect?returnTo=' + encodeURIComponent('/preview/abc?triggerId=xyz'));
    expect(screen.queryByTestId('children')).toBeNull();
  });

  it('does not call navigate again if status flips back to connected', () => {
    render(<Harness initial="disconnected" />);
    expect(navigateMock).toHaveBeenCalledTimes(1);
    act(() => { screen.getByTestId('set-connected').click(); });
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('children')).toBeTruthy();
  });
});
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { WalletStatus } from '@solana/connector';

vi.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return {
    default: {
      setItem: vi.fn((k: string, v: string) => { mem.set(k, v); return Promise.resolve(); }),
      getItem: vi.fn((k: string) => Promise.resolve(mem.get(k) ?? null)),
      removeItem: vi.fn((k: string) => { mem.delete(k); return Promise.resolve(); }),
      clear: vi.fn(() => { mem.clear(); return Promise.resolve(); }),
    },
  };
});

let connectorState: { walletStatus: WalletStatus; account: string | null } = {
  walletStatus: { status: 'disconnected' },
  account: null,
};
const connectorListeners = new Set<() => void>();
function setConnector(next: { walletStatus: WalletStatus; account: string | null }) {
  connectorState = next;
  connectorListeners.forEach((l) => l());
}

/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
vi.mock('@solana/connector', () => {
  const { useSyncExternalStore } = require('react');
  return {
    useConnector: () =>
      useSyncExternalStore(
        (l: () => void) => { connectorListeners.add(l); return () => connectorListeners.delete(l); },
        () => connectorState,
        () => connectorState,
      ),
  };
});

import { walletSessionStore } from '../state/walletSessionStore';
import { WalletBootProvider } from './WalletBootProvider.web';
import { useWalletBootStatus } from './walletBootContext';

function Probe() {
  const status = useWalletBootStatus();
  return <span data-testid="status">{status}</span>;
}

const ADDR = 'DemoWallet1111111111111111111111111111111111';

beforeEach(() => {
  vi.useFakeTimers();
  setConnector({ walletStatus: { status: 'disconnected' }, account: null });
  walletSessionStore.setState({
    walletAddress: null,
    connectionKind: null,
    browserRestoreAddress: null,
    hasHydrated: true,
    lastConnectedAt: null,
    isConnecting: false,
    connectionOutcome: null,
    platformCapabilities: null,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('WalletBootProvider (web)', () => {
  it('starts in checking-browser-wallet for a persisted browser candidate', () => {
    walletSessionStore.setState({ connectionKind: 'browser', browserRestoreAddress: ADDR });
    render(<WalletBootProvider><Probe /></WalletBootProvider>);
    expect(screen.getByTestId('status').textContent).toBe('checking-browser-wallet');
  });

  it('resolves to connected when connector reaches connected with matching account', () => {
    walletSessionStore.setState({ connectionKind: 'browser', browserRestoreAddress: ADDR });
    render(<WalletBootProvider><Probe /></WalletBootProvider>);
    act(() => {
      setConnector({ walletStatus: { status: 'connecting', connectorId: 'phantom' as never }, account: null });
    });
    expect(screen.getByTestId('status').textContent).toBe('checking-browser-wallet');
    act(() => {
      setConnector({ walletStatus: { status: 'connected', session: {} as never }, account: ADDR });
    });
    expect(screen.getByTestId('status').textContent).toBe('connected');
  });

  it('sets walletAddress in store when boot resolves to connected for browser wallet', () => {
    walletSessionStore.setState({ connectionKind: 'browser', browserRestoreAddress: ADDR, walletAddress: null });
    render(<WalletBootProvider><Probe /></WalletBootProvider>);
    expect(walletSessionStore.getState().walletAddress).toBeNull();
    act(() => {
      setConnector({ walletStatus: { status: 'connected', session: {} as never }, account: ADDR });
    });
    expect(screen.getByTestId('status').textContent).toBe('connected');
    expect(walletSessionStore.getState().walletAddress).toBe(ADDR);
  });

  it('resolves to disconnected when connector returns to disconnected after being inflight', () => {
    walletSessionStore.setState({ connectionKind: 'browser', browserRestoreAddress: ADDR });
    render(<WalletBootProvider><Probe /></WalletBootProvider>);
    act(() => {
      setConnector({ walletStatus: { status: 'connecting', connectorId: 'phantom' as never }, account: null });
    });
    act(() => {
      setConnector({ walletStatus: { status: 'disconnected' }, account: null });
    });
    expect(screen.getByTestId('status').textContent).toBe('disconnected');
  });

  it('resolves to disconnected after the 1500ms watchdog when the connector never moves', () => {
    walletSessionStore.setState({ connectionKind: 'browser', browserRestoreAddress: ADDR });
    render(<WalletBootProvider><Probe /></WalletBootProvider>);
    expect(screen.getByTestId('status').textContent).toBe('checking-browser-wallet');
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.getByTestId('status').textContent).toBe('disconnected');
  });

  it('resolves to disconnected when connector connects with a different account', () => {
    walletSessionStore.setState({ connectionKind: 'browser', browserRestoreAddress: ADDR });
    render(<WalletBootProvider><Probe /></WalletBootProvider>);
    act(() => {
      setConnector({ walletStatus: { status: 'connecting', connectorId: 'phantom' as never }, account: null });
    });
    act(() => {
      setConnector({ walletStatus: { status: 'connected', session: {} as never }, account: 'AnotherWallet1111111111111111111111111111111' });
    });
    expect(screen.getByTestId('status').textContent).toBe('disconnected');
  });

  it('returns connected for a persisted native session with no connector activity', () => {
    walletSessionStore.setState({ walletAddress: ADDR, connectionKind: 'native' });
    render(<WalletBootProvider><Probe /></WalletBootProvider>);
    expect(screen.getByTestId('status').textContent).toBe('connected');
  });

  it('returns disconnected when there is no candidate', () => {
    render(<WalletBootProvider><Probe /></WalletBootProvider>);
    expect(screen.getByTestId('status').textContent).toBe('disconnected');
  });

  it('returns hydrating-storage while the store has not hydrated', () => {
    walletSessionStore.setState({ hasHydrated: false, connectionKind: 'browser', browserRestoreAddress: ADDR });
    render(<WalletBootProvider><Probe /></WalletBootProvider>);
    expect(screen.getByTestId('status').textContent).toBe('hydrating-storage');
  });

  it('clears stale session from store when boot resolves to disconnected for browser wallet', () => {
    walletSessionStore.setState({ connectionKind: 'browser', browserRestoreAddress: ADDR });
    render(<WalletBootProvider><Probe /></WalletBootProvider>);
    act(() => {
      setConnector({ walletStatus: { status: 'connecting', connectorId: 'phantom' as never }, account: null });
    });
    act(() => {
      setConnector({ walletStatus: { status: 'disconnected' }, account: null });
    });
    expect(screen.getByTestId('status').textContent).toBe('disconnected');
    expect(walletSessionStore.getState().walletAddress).toBeNull();
    expect(walletSessionStore.getState().connectionKind).toBeNull();
    expect(walletSessionStore.getState().browserRestoreAddress).toBeNull();
  });

  it('does not clear native session when boot is disconnected (native owns its own lifecycle)', () => {
    walletSessionStore.setState({ walletAddress: ADDR, connectionKind: 'native' });
    render(<WalletBootProvider><Probe /></WalletBootProvider>);
    expect(screen.getByTestId('status').textContent).toBe('connected');
    expect(walletSessionStore.getState().walletAddress).toBe(ADDR);
  });
});
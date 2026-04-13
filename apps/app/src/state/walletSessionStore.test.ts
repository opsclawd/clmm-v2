import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { PlatformCapabilityState } from '@clmm/application/public';

// Mock AsyncStorage so tests run in jsdom without a real storage backend
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    setItem: vi.fn(() => Promise.resolve()),
    getItem: vi.fn(() => Promise.resolve(null)),
    removeItem: vi.fn(() => Promise.resolve()),
  },
}));
import {
  createWalletSessionStore,
  type WalletConnectionKind,
} from './walletSessionStore';

const caps: PlatformCapabilityState = {
  nativePushAvailable: false,
  browserNotificationAvailable: true,
  nativeWalletAvailable: false,
  browserWalletAvailable: true,
  isMobileWeb: false,
};

describe('walletSessionStore', () => {
  it('loads platform capabilities into state', () => {
    const store = createWalletSessionStore();

    store.getState().setPlatformCapabilities(caps);

    expect(store.getState().platformCapabilities).toEqual(caps);
  });

  it('marks a successful connection with address and kind', () => {
    const store = createWalletSessionStore();

    store.getState().markConnected({
      walletAddress: 'DemoWallet1111111111111111111111111111111111',
      connectionKind: 'browser',
    });

    expect(store.getState().walletAddress).toBe('DemoWallet1111111111111111111111111111111111');
    expect(store.getState().connectionKind).toBe('browser');
    expect(store.getState().connectionOutcome).toEqual({ kind: 'connected' });
    expect(store.getState().isConnecting).toBe(false);
  });

  it('beginConnection clears stale session fields and stale outcome', () => {
    const store = createWalletSessionStore();

    store.setState({
      walletAddress: 'DemoWallet1111111111111111111111111111111111',
      connectionKind: 'browser' satisfies WalletConnectionKind,
      connectionOutcome: { kind: 'failed', reason: 'stale' },
    });

    store.getState().beginConnection();

    expect(store.getState().isConnecting).toBe(true);
    expect(store.getState().walletAddress).toBeNull();
    expect(store.getState().connectionKind).toBeNull();
    expect(store.getState().connectionOutcome).toBeNull();
  });

  it.each([
    [{ kind: 'cancelled' }],
    [{ kind: 'interrupted' }],
    [{ kind: 'failed', reason: 'boom' }],
  ] as const)('stores non-success outcomes and clears session: %j', (outcome) => {
    const store = createWalletSessionStore();

    store.getState().markConnected({
      walletAddress: 'DemoWallet1111111111111111111111111111111111',
      connectionKind: 'browser' satisfies WalletConnectionKind,
    });
    store.getState().beginConnection();
    store.getState().markOutcome(outcome);

    expect(store.getState().connectionOutcome).toEqual(outcome);
    expect(store.getState().isConnecting).toBe(false);
    expect(store.getState().walletAddress).toBeNull();
    expect(store.getState().connectionKind).toBeNull();
  });

  it('disconnect clears address, kind, and connecting state', () => {
    const store = createWalletSessionStore();

    store.getState().markConnected({
      walletAddress: 'DemoWallet1111111111111111111111111111111111',
      connectionKind: 'browser',
    });
    store.getState().disconnect();

    expect(store.getState().walletAddress).toBeNull();
    expect(store.getState().connectionKind).toBeNull();
    expect(store.getState().isConnecting).toBe(false);
  });

  it('clears stale outcome without dropping connected session', () => {
    const store = createWalletSessionStore();

    store.getState().markConnected({
      walletAddress: 'DemoWallet1111111111111111111111111111111111',
      connectionKind: 'browser' satisfies WalletConnectionKind,
    });
    store.getState().clearOutcome();

    expect(store.getState().walletAddress).toBe('DemoWallet1111111111111111111111111111111111');
    expect(store.getState().connectionOutcome).toBeNull();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformCapabilityState } from '@clmm/application/public';

// In-memory AsyncStorage mock so we can test persist + rehydrate.
vi.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();

  return {
    default: {
      setItem: vi.fn((key: string, value: string) => {
        mem.set(key, value);
        return Promise.resolve();
      }),
      getItem: vi.fn((key: string) => Promise.resolve(mem.get(key) ?? null)),
      removeItem: vi.fn((key: string) => {
        mem.delete(key);
        return Promise.resolve();
      }),
      clear: vi.fn(() => {
        mem.clear();
        return Promise.resolve();
      }),
    },
  };
});
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
  beforeEach(async () => {
    vi.clearAllMocks();
    // Clear the in-memory mock storage between tests so state doesn't leak
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    await AsyncStorage.clear();
  });
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

  it('disconnect clears address, kind, and connecting state, and clears persisted storage', async () => {
    const store = createWalletSessionStore();

    store.getState().markConnected({
      walletAddress: 'DemoWallet1111111111111111111111111111111111',
      connectionKind: 'browser',
    });
    store.getState().disconnect();

    // persist.clearStorage() eventually calls AsyncStorage.removeItem('wallet-session')
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    // allow any pending promises to settle
    await Promise.resolve();

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('wallet-session');

    expect(store.getState().walletAddress).toBeNull();
    expect(store.getState().connectionKind).toBeNull();
    expect(store.getState().isConnecting).toBe(false);
  });

  it('rehydrates persisted session fields but not transient UI state', async () => {
    const store1 = createWalletSessionStore();

    store1.getState().setPlatformCapabilities(caps);
    store1.getState().beginConnection();
    store1.getState().markConnected({
      walletAddress: 'DemoWallet1111111111111111111111111111111111',
      connectionKind: 'browser',
    });

    // Ensure persist has had a chance to write
    await Promise.resolve();

    const store2 = createWalletSessionStore();
    await store2.persist.rehydrate();

    expect(store2.getState().walletAddress).toBe('DemoWallet1111111111111111111111111111111111');
    expect(store2.getState().connectionKind).toBe('browser');
    expect(store2.getState().platformCapabilities).toEqual(caps);

    // Transient state should not be persisted
    expect(store2.getState().isConnecting).toBe(false);
    expect(store2.getState().connectionOutcome).toBeNull();
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

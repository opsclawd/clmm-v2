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
    expect(store.getState().browserRestoreAddress).toBe('DemoWallet1111111111111111111111111111111111');
    expect(store.getState().connectionOutcome).toEqual({ kind: 'connected' });
    expect(store.getState().isConnecting).toBe(false);
  });

  it('marks a native connection without setting browserRestoreAddress', () => {
    const store = createWalletSessionStore();

    store.getState().markConnected({
      walletAddress: 'DemoWallet1111111111111111111111111111111111',
      connectionKind: 'native',
    });

    expect(store.getState().walletAddress).toBe('DemoWallet1111111111111111111111111111111111');
    expect(store.getState().connectionKind).toBe('native');
    expect(store.getState().browserRestoreAddress).toBeNull();
  });

  it('beginConnection clears stale session fields and stale outcome', () => {
    const store = createWalletSessionStore();

    store.setState({
      walletAddress: 'DemoWallet1111111111111111111111111111111111',
      connectionKind: 'browser' satisfies WalletConnectionKind,
      browserRestoreAddress: 'DemoWallet1111111111111111111111111111111111',
      connectionOutcome: { kind: 'failed', reason: 'stale' },
    });

    store.getState().beginConnection();

    expect(store.getState().isConnecting).toBe(true);
    expect(store.getState().walletAddress).toBeNull();
    expect(store.getState().connectionKind).toBeNull();
    expect(store.getState().browserRestoreAddress).toBeNull();
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

  it('disconnect clears address, kind, browserRestoreAddress, and connecting state, and clears persisted storage', async () => {
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
    expect(store.getState().browserRestoreAddress).toBeNull();
    expect(store.getState().isConnecting).toBe(false);
  });

  it('persists browser wallet sessions across rehydration but keeps walletAddress null until boot confirms', async () => {
    const store1 = createWalletSessionStore();

    store1.getState().setPlatformCapabilities(caps);
    store1.getState().beginConnection();
    store1.getState().markConnected({
      walletAddress: 'DemoWallet1111111111111111111111111111111111',
      connectionKind: 'browser',
    });

    await Promise.resolve();

    const store2 = createWalletSessionStore();
    await store2.persist.rehydrate();

    expect(store2.getState().walletAddress).toBeNull();
    expect(store2.getState().connectionKind).toBe('browser');
    expect(store2.getState().browserRestoreAddress).toBe('DemoWallet1111111111111111111111111111111111');
    expect(store2.getState().platformCapabilities).toEqual(caps);
  });

  it('records lastConnectedAt when markConnected is called', () => {
    const store = createWalletSessionStore();
    const before = Date.now();

    store.getState().markConnected({
      walletAddress: 'DemoWallet1111111111111111111111111111111111',
      connectionKind: 'browser',
    });

    const after = Date.now();
    const ts = store.getState().lastConnectedAt;
    expect(ts).not.toBeNull();
    expect(ts!).toBeGreaterThanOrEqual(before);
    expect(ts!).toBeLessThanOrEqual(after);
  });

  it('persists lastConnectedAt across rehydration', async () => {
    const store1 = createWalletSessionStore();
    store1.getState().markConnected({
      walletAddress: 'DemoWallet1111111111111111111111111111111111',
      connectionKind: 'browser',
    });
    const ts = store1.getState().lastConnectedAt;
    await Promise.resolve();

    const store2 = createWalletSessionStore();
    await store2.persist.rehydrate();
    expect(store2.getState().lastConnectedAt).toBe(ts);
  });

  it('clears lastConnectedAt on disconnect', () => {
    const store = createWalletSessionStore();
    store.getState().markConnected({
      walletAddress: 'DemoWallet1111111111111111111111111111111111',
      connectionKind: 'browser',
    });
    expect(store.getState().lastConnectedAt).not.toBeNull();
    store.getState().disconnect();
    expect(store.getState().lastConnectedAt).toBeNull();
  });

  it('persists native wallet sessions across rehydration', async () => {
    const store1 = createWalletSessionStore();

    store1.getState().setPlatformCapabilities(caps);
    store1.getState().beginConnection();
    store1.getState().markConnected({
      walletAddress: 'DemoWallet1111111111111111111111111111111111',
      connectionKind: 'native',
    });

    await Promise.resolve();

    const store2 = createWalletSessionStore();
    await store2.persist.rehydrate();

    expect(store2.getState().walletAddress).toBe('DemoWallet1111111111111111111111111111111111');
    expect(store2.getState().connectionKind).toBe('native');
    expect(store2.getState().platformCapabilities).toEqual(caps);
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

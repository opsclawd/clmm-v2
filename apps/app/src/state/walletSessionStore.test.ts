import { beforeEach, describe, expect, it } from 'vitest';
import type { PlatformCapabilityState } from '@clmm/application/public';
import {
  createWalletSessionStore,
  type WalletConnectionKind,
} from './walletSessionStore.js';

const caps: PlatformCapabilityState = {
  nativePushAvailable: false,
  browserNotificationAvailable: true,
  nativeWalletAvailable: false,
  browserWalletAvailable: true,
  isMobileWeb: false,
};

describe('walletSessionStore', () => {
  beforeEach(() => {
    // Each test creates a fresh store instance.
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

  it.each([
    [{ kind: 'cancelled' }],
    [{ kind: 'interrupted' }],
    [{ kind: 'failed', reason: 'boom' }],
  ] as const)('stores non-success outcomes: %j', (outcome) => {
    const store = createWalletSessionStore();

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

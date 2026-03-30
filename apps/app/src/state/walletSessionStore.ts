import { createStore } from 'zustand/vanilla';
import type { PlatformCapabilityState } from '@clmm/application/public';
import type { ConnectionOutcome } from '@clmm/ui';

export type WalletConnectionKind = 'native' | 'browser';

export type WalletSessionState = {
  walletAddress: string | null;
  connectionKind: WalletConnectionKind | null;
  connectionOutcome: ConnectionOutcome | null;
  platformCapabilities: PlatformCapabilityState | null;
  isConnecting: boolean;
  setPlatformCapabilities: (capabilities: PlatformCapabilityState) => void;
  beginConnection: () => void;
  markConnected: (params: {
    walletAddress: string;
    connectionKind: WalletConnectionKind;
  }) => void;
  markOutcome: (outcome: ConnectionOutcome) => void;
  disconnect: () => void;
  clearOutcome: () => void;
};

export function createWalletSessionStore() {
  return createStore<WalletSessionState>((set) => ({
    walletAddress: null,
    connectionKind: null,
    connectionOutcome: null,
    platformCapabilities: null,
    isConnecting: false,
    setPlatformCapabilities: (platformCapabilities) => set({ platformCapabilities }),
    beginConnection: () => set({ isConnecting: true, connectionOutcome: null }),
    markConnected: ({ walletAddress, connectionKind }) =>
      set({
        walletAddress,
        connectionKind,
        connectionOutcome: { kind: 'connected' },
        isConnecting: false,
      }),
    markOutcome: (connectionOutcome) =>
      set({
        connectionOutcome,
        isConnecting: false,
        walletAddress: null,
        connectionKind: null,
      }),
    disconnect: () =>
      set({
        walletAddress: null,
        connectionKind: null,
        connectionOutcome: null,
        isConnecting: false,
      }),
    clearOutcome: () => set({ connectionOutcome: null }),
  }));
}

export const walletSessionStore = createWalletSessionStore();

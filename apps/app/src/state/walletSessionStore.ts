import { createStore } from 'zustand/vanilla';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PlatformCapabilityState } from '@clmm/application/public';
import type { ConnectionOutcome } from '@clmm/ui';

export type WalletConnectionKind = 'native' | 'browser';
type NonSuccessConnectionOutcome = Exclude<ConnectionOutcome, { kind: 'connected' }>;

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
  markOutcome: (outcome: NonSuccessConnectionOutcome) => void;
  disconnect: () => void;
  clearOutcome: () => void;
};

export function createWalletSessionStore() {
  return createStore<WalletSessionState>()(
    persist(
      (set, get, store) => ({
        walletAddress: null,
        connectionKind: null,
        connectionOutcome: null,
        platformCapabilities: null,
        isConnecting: false,
        setPlatformCapabilities: (platformCapabilities) => set({ platformCapabilities }),
        beginConnection: () =>
          set({
            isConnecting: true,
            connectionOutcome: null,
            walletAddress: null,
            connectionKind: null,
          }),
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
        disconnect: () => {
          set({
            walletAddress: null,
            connectionKind: null,
            connectionOutcome: null,
            isConnecting: false,
          });
          // Also clear persisted storage so nothing survives across sessions
          store.persist.clearStorage();
        },
        clearOutcome: () => set({ connectionOutcome: null }),
      }),
      {
        name: 'wallet-session',
        storage: createJSONStorage(() => AsyncStorage),
        partialize: (state) => ({
          walletAddress: state.walletAddress,
          connectionKind: state.connectionKind,
          platformCapabilities: state.platformCapabilities,
        }),
      }
    )
  );
}

export const walletSessionStore = createWalletSessionStore();

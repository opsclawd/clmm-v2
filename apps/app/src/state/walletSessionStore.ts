import { createStore } from 'zustand/vanilla';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// AsyncStorage uses `window.localStorage` internally and crashes in Node.js/SSR.
// Provide a no-op fallback for non-browser environments so static rendering works.
const safeStorageFactory = () => {
  if (typeof window !== 'undefined') {
    return createJSONStorage(() => AsyncStorage);
  }
  return createJSONStorage(() => ({
    getItem: () => null as string | null,
    setItem: (_key: string, _value: string) => {},
    removeItem: (_key: string) => {},
  }));
};
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
  hasHydrated: boolean;
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
  const store = createStore<WalletSessionState>()(
    persist(
      (set, _get, store) => ({
        walletAddress: null,
        connectionKind: null,
        connectionOutcome: null,
        platformCapabilities: null,
        isConnecting: false,
        hasHydrated: false,
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
        storage: safeStorageFactory(),
        partialize: (state) => {
          if (state.connectionKind === 'browser') {
            return {
              walletAddress: null,
              connectionKind: null,
              platformCapabilities: state.platformCapabilities,
            };
          }
          return {
            walletAddress: state.walletAddress,
            connectionKind: state.connectionKind,
            platformCapabilities: state.platformCapabilities,
          };
        },
        onRehydrateStorage: () => (_state, _error) => {
          if (typeof window !== 'undefined') {
            store.setState({ hasHydrated: true });
          }
        },
      }
    )
  );

  return store;
}

export const walletSessionStore = createWalletSessionStore();

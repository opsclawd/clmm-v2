import { createContext, useContext } from 'react';
import type { WalletBootStatus } from '../state/deriveWalletBootStatus';

export const WalletBootContext = createContext<WalletBootStatus>('hydrating-storage');

export function useWalletBootStatus(): WalletBootStatus {
  return useContext(WalletBootContext);
}
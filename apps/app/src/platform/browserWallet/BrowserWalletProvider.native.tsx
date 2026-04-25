import type { ReactNode } from 'react';
import { WalletBootProvider } from '../../wallet-boot/WalletBootProvider.native';

export function BrowserWalletProvider({ children }: { children: ReactNode }) {
  return <WalletBootProvider>{children}</WalletBootProvider>;
}
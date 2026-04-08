declare module '@solana-mobile/mobile-wallet-adapter-protocol' {
  export type Chain = string;
}

declare module '@solana-mobile/mobile-wallet-adapter-protocol-kit' {
  import type { Chain } from '@solana-mobile/mobile-wallet-adapter-protocol';
  import type { getBase64EncodedWireTransaction } from '@solana/kit';

  type WireTransaction = Parameters<typeof getBase64EncodedWireTransaction>[0];

  export type KitMobileWallet = {
    authorize(args: {
      identity: {
        name: string;
        uri: string;
        icon: string;
      };
      chain: Chain;
    }): Promise<{
      accounts: Array<{
        address: string;
      }>;
    }>;
    signTransactions(args: {
      transactions: readonly WireTransaction[];
    }): Promise<WireTransaction[]>;
  };

  export function transact<T>(
    callback: (wallet: KitMobileWallet) => Promise<T>,
  ): Promise<T>;
}

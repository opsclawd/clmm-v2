import type { Chain } from '@solana-mobile/mobile-wallet-adapter-protocol';
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-kit';

const APP_IDENTITY = {
  name: 'CLMM V2',
  uri: 'https://clmm.v2.app',
  icon: 'favicon.ico',
};

export async function connectNativeWallet(cluster: string = 'solana:mainnet'): Promise<string> {
  const authorization = await transact(async (wallet) => {
    return wallet.authorize({
      identity: APP_IDENTITY,
      chain: cluster as Chain,
    });
  });

  const account = authorization.accounts[0];
  if (!account) {
    throw new Error('Native wallet did not return an authorized account');
  }

  return account.address;
}

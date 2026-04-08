import type { Chain } from '@solana-mobile/mobile-wallet-adapter-protocol';
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-kit';

type NativeSigningWallet = {
  authorize(args: { identity: typeof APP_IDENTITY; chain: Chain }): Promise<{
    accounts: Array<{ address: string }>;
  }>;
  signTransactions(args: { payloads: string[] }): Promise<{
    signed_payloads: string[];
  }>;
};

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

export async function signNativeTransaction(params: {
  serializedPayload: string;
  walletId: string;
  cluster?: string;
}): Promise<string> {
  return transact(async (wallet) => {
    const signingWallet = wallet as unknown as NativeSigningWallet; // boundary: MWA wallet session types vary by package surface
    const authorization = await signingWallet.authorize({
      identity: APP_IDENTITY,
      chain: (params.cluster ?? 'solana:mainnet') as Chain,
    });

    const account = authorization.accounts[0];
    if (!account || account.address !== params.walletId) {
      throw new Error('Native wallet did not return the requested authorized account');
    }

    const signed = await signingWallet.signTransactions({
      payloads: [params.serializedPayload],
    });

    const signedPayload = signed.signed_payloads[0];
    if (typeof signedPayload !== 'string' || signedPayload.length === 0) {
      throw new Error('Native wallet did not return a signed payload');
    }

    return signedPayload;
  });
}

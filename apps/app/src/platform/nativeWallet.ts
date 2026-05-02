import type { Chain } from '@solana-mobile/mobile-wallet-adapter-protocol';
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-kit';

type NativeSigningWallet = {
  authorize(args: { identity: typeof APP_IDENTITY; chain: Chain }): Promise<{
    accounts: Array<{ address: string }>;
  }>;
  signTransactions(args: { payloads: string[] }): Promise<{
    signed_payloads: string[];
  }>;
  signMessages(args: { addresses: string[]; payloads: string[] }): Promise<{
    signed_payloads: string[];
  }>;
};

const APP_IDENTITY = {
  name: 'CLMM V2',
  uri: 'https://clmm.v2.app',
  icon: 'favicon.ico',
};

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  if (typeof btoa === 'function') return btoa(binary);
  return Buffer.from(binary, 'binary').toString('base64');
}

function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  return Uint8Array.from(Buffer.from(base64, 'base64'));
}

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

export async function signNativeMessage(params: {
  message: string;
  walletId: string;
  cluster?: string;
}): Promise<string> {
  return transact(async (wallet) => {
    const signingWallet = wallet as unknown as NativeSigningWallet;
    const authorization = await signingWallet.authorize({
      identity: APP_IDENTITY,
      chain: (params.cluster ?? 'solana:mainnet') as Chain,
    });

    const account = authorization.accounts[0];
    if (!account || account.address !== params.walletId) {
      throw new Error('Native wallet did not return the requested authorized account');
    }

    const messageBytes = new TextEncoder().encode(params.message);
    const base64Payload = uint8ArrayToBase64(messageBytes);
    const result = await signingWallet.signMessages({
      addresses: [params.walletId],
      payloads: [base64Payload],
    });

    const signedPayload = result.signed_payloads[0];
    if (typeof signedPayload !== 'string' || signedPayload.length === 0) {
      throw new Error('Native wallet did not return a signed message payload');
    }

    const signedBytes = base64ToUint8Array(signedPayload);
    if (signedBytes.length < 64) {
      throw new Error('Native wallet signed payload too short to contain Ed25519 signature');
    }

    const signatureBytes = signedBytes.slice(0, 64);
    return uint8ArrayToBase64(signatureBytes);
  });
}

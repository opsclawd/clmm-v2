import { signNativeMessage } from '../platform/nativeWallet';
import type { WalletConnectionKind } from '../state/walletSessionStore';

export type SignMessageOutcome =
  | { kind: 'ok'; signatureBase64: string }
  | { kind: 'unsupported' }
  | { kind: 'wallet-mismatch' }
  | { kind: 'rejected' }
  | { kind: 'failed' };

export type BrowserMessageSigner = {
  isConnected: boolean;
  account: string | null;
  signMessageBytes: (message: Uint8Array) => Promise<Uint8Array>;
};

export async function signMessageWithWallet(params: {
  walletId: string;
  connectionKind: WalletConnectionKind;
  message: string;
  browserSigner: BrowserMessageSigner | null;
}): Promise<SignMessageOutcome> {
  if (params.connectionKind === 'native') {
    try {
      const signatureBase64 = await signNativeMessage({
        walletId: params.walletId,
        message: params.message,
      });
      return { kind: 'ok', signatureBase64 };
    } catch (error) {
      return classifyError(error, params.walletId);
    }
  }

  const signer = params.browserSigner;
  if (signer === null || typeof signer.signMessageBytes !== 'function') {
    return { kind: 'unsupported' };
  }
  if (!signer.isConnected) {
    return { kind: 'failed' };
  }
  if (signer.account !== params.walletId) {
    return { kind: 'wallet-mismatch' };
  }

  try {
    const messageBytes = new TextEncoder().encode(params.message);
    const signatureBytes = await signer.signMessageBytes(messageBytes);
    return { kind: 'ok', signatureBase64: bytesToBase64(signatureBytes) };
  } catch (error) {
    return classifyError(error, params.walletId);
  }
}

function classifyError(error: unknown, walletId: string): SignMessageOutcome {
  const message = error instanceof Error ? error.message : String(error);
  if (/not return the requested authorized account/i.test(message)) {
    return { kind: 'wallet-mismatch' };
  }
  if (/wallet account is connected/i.test(message)) {
    return { kind: 'failed' };
  }
  if (/unsupported|not (?:available|implemented)/i.test(message)) {
    return { kind: 'unsupported' };
  }
  if (/reject|denied|cancell?ed|user/i.test(message)) {
    return { kind: 'rejected' };
  }
  void walletId;
  return { kind: 'failed' };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  if (typeof btoa === 'function') return btoa(binary);
  return Buffer.from(binary, 'binary').toString('base64');
}
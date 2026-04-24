import { VersionedTransaction } from '@solana/web3.js';

export type BrowserWalletPublicKey = {
  toBase58(): string;
};

export type BrowserSignedTransaction = {
  serialize(): Uint8Array;
};

export type InjectedBrowserWalletProvider = {
  isPhantom?: boolean;
  publicKey?: BrowserWalletPublicKey | null;
  connect(): Promise<{ publicKey?: BrowserWalletPublicKey | null } | null | undefined>;
  disconnect?(): Promise<void>;
  signTransaction?(payload: VersionedTransaction): Promise<BrowserSignedTransaction>;
};

export type BrowserWalletWindow = {
  solana?: unknown;
};

function isInjectedBrowserWalletProvider(value: unknown): value is InjectedBrowserWalletProvider {
  if (typeof value !== 'object' || value == null) {
    return false;
  }

  return typeof Reflect.get(value, 'connect') === 'function';
}

export function getInjectedBrowserProvider(
  browserWindow: BrowserWalletWindow | undefined,
): InjectedBrowserWalletProvider | null {
  return isInjectedBrowserWalletProvider(browserWindow?.solana) ? browserWindow.solana : null;
}

export function normalizeBrowserWalletAddress(publicKey: BrowserWalletPublicKey | null | undefined): string {
  if (!publicKey) {
    throw new Error('Wallet provider did not return a public key');
  }

  return publicKey.toBase58();
}

export async function connectBrowserWallet(browserWindow: BrowserWalletWindow | undefined): Promise<string> {
  const provider = getInjectedBrowserProvider(browserWindow);

  if (!provider) {
    throw new Error('No supported browser wallet detected on this device');
  }

  const result = await provider.connect();
  return normalizeBrowserWalletAddress(result?.publicKey ?? provider.publicKey ?? null);
}

export async function disconnectBrowserWallet(browserWindow: BrowserWalletWindow | undefined): Promise<void> {
  const provider = getInjectedBrowserProvider(browserWindow);
  await provider?.disconnect?.();
}

function decodeBase64Payload(value: string): Uint8Array {
  if (typeof globalThis.atob !== 'function') {
    throw new Error('Base64 decoding is not available in this environment');
  }

  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function encodeBase64Payload(value: Uint8Array): string {
  if (typeof globalThis.btoa !== 'function') {
    throw new Error('Base64 encoding is not available in this environment');
  }

  let binary = '';
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }

  return globalThis.btoa(binary);
}

export async function signBrowserTransaction(params: {
  browserWindow: BrowserWalletWindow | undefined;
  serializedPayload: string;
}): Promise<string> {
  const provider = getInjectedBrowserProvider(params.browserWindow);

  if (!provider) {
    throw new Error('No supported browser wallet detected on this device');
  }

  if (provider.signTransaction == null) {
    throw new Error('Connected browser wallet cannot sign transactions');
  }

  const payloadBytes = decodeBase64Payload(params.serializedPayload);
  const transaction = VersionedTransaction.deserialize(payloadBytes);
  const signedPayload = await provider.signTransaction(transaction);

  return encodeBase64Payload(signedPayload.serialize());
}
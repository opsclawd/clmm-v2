import { VersionedTransaction } from '@solana/web3.js';

export type BrowserWalletPublicKey = {
  toBase58(): string;
};

export type BrowserWalletProvider = {
  isPhantom?: boolean;
  publicKey?: BrowserWalletPublicKey | null;
  connect(): Promise<{ publicKey?: BrowserWalletPublicKey | null } | null | undefined>;
  disconnect?(): Promise<void>;
  signTransaction?(transaction: VersionedTransaction): Promise<unknown>;
};

export type BrowserWalletWindow = {
  solana?: unknown;
};

function isBrowserWalletProvider(value: unknown): value is BrowserWalletProvider {
  if (typeof value !== 'object' || value == null) {
    return false;
  }

  return typeof Reflect.get(value, 'connect') === 'function';
}

export function getInjectedBrowserProvider(
  browserWindow: BrowserWalletWindow | undefined,
): BrowserWalletProvider | null {
  return isBrowserWalletProvider(browserWindow?.solana) ? browserWindow.solana : null;
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

function isSerializedTransaction(value: unknown): value is { serialize(): Uint8Array | ArrayBuffer } {
  if (typeof value !== 'object' || value == null) {
    return false;
  }

  return typeof Reflect.get(value, 'serialize') === 'function';
}

function normalizeSignedTransactionPayload(payload: unknown): Uint8Array {
  if (payload instanceof Uint8Array) {
    return payload;
  }

  if (payload instanceof ArrayBuffer) {
    return new Uint8Array(payload);
  }

  if (payload instanceof VersionedTransaction) {
    return payload.serialize();
  }

  if (isSerializedTransaction(payload)) {
    return normalizeSignedTransactionPayload(payload.serialize());
  }

  throw new Error('Wallet returned an unsupported signed transaction payload');
}

export async function signTransactionWithBrowserWallet(
  browserWindow: BrowserWalletWindow | undefined,
  serializedTransaction: Uint8Array,
): Promise<Uint8Array> {
  const provider = getInjectedBrowserProvider(browserWindow);

  if (!provider) {
    throw new Error('No supported browser wallet detected on this device');
  }

  if (provider.signTransaction == null) {
    throw new Error('Wallet does not support transaction signing');
  }

  const transaction = VersionedTransaction.deserialize(serializedTransaction);
  const signedPayload = await provider.signTransaction(transaction);
  return normalizeSignedTransactionPayload(signedPayload);
}

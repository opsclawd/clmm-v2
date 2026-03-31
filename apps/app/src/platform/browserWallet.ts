export type BrowserWalletPublicKey = {
  toBase58(): string;
};

export type BrowserWalletProvider = {
  isPhantom?: boolean;
  publicKey?: BrowserWalletPublicKey | null;
  connect(): Promise<{ publicKey?: BrowserWalletPublicKey | null } | null | undefined>;
  disconnect?(): Promise<void>;
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

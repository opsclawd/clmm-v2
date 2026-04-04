export type BrowserWalletPublicKey = {
  toBase58(): string;
};

export type BrowserWalletProvider = {
  isPhantom?: boolean;
  publicKey?: BrowserWalletPublicKey | null;
  connect(): Promise<{ publicKey?: BrowserWalletPublicKey | null } | null | undefined>;
  disconnect?(): Promise<void>;
  signTransaction?(payload: unknown): Promise<unknown>;
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

function normalizeSignedResult(payload: unknown): Uint8Array {
  if (payload instanceof Uint8Array) {
    return payload;
  }

  if (payload instanceof ArrayBuffer) {
    return new Uint8Array(payload);
  }

  if (isSerializedTransaction(payload)) {
    return normalizeSignedResult(payload.serialize());
  }

  throw new Error('Wallet returned an unsupported signed transaction payload');
}

function shouldRetryWithSerializablePayload(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes('serialize is not a function');
}

function buildSerializablePayload(payloadBytes: Uint8Array): { serialize(): Uint8Array } {
  return {
    serialize() {
      return payloadBytes;
    },
  };
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
  let signedPayload: unknown;

  try {
    signedPayload = await provider.signTransaction(payloadBytes);
  } catch (error: unknown) {
    if (!shouldRetryWithSerializablePayload(error)) {
      throw error;
    }

    signedPayload = await provider.signTransaction(buildSerializablePayload(payloadBytes));
  }

  return encodeBase64Payload(normalizeSignedResult(signedPayload));
}

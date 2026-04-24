import { describe, expect, it, vi } from 'vitest';
import { VersionedTransaction } from '@solana/web3.js';
import {
  connectBrowserWallet,
  disconnectBrowserWallet,
  getInjectedBrowserProvider,
  normalizeBrowserWalletAddress,
  readInjectedBrowserWalletWindow,
  signBrowserTransaction,
} from './browserWallet';

const VALID_SERIALIZED_PAYLOAD =
  'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQABA8Ad1mDmJHOT4w9SKImj8qzR0ItAoMpTpj/M0nP1p4YpfC/b4w9Qc3vmYbf/YFgTZoQYCeG3U3QFBeWvvqvS5/YAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQICAAEMAgAAAAEAAAAAAAAAAA==';

describe('browserWallet helpers', () => {
  it('returns null when no browser wallet provider exists', () => {
    expect(getInjectedBrowserProvider(undefined)).toBeNull();
  });

  it('returns the injected wallet provider when available', () => {
    const provider = {
      isPhantom: true,
      connect: () => Promise.resolve({ publicKey: { toBase58: () => 'abc' } }),
    };

    expect(getInjectedBrowserProvider({ solana: provider })).toBe(provider);
  });

  it('prefers the Phantom-scoped Solana provider over the legacy global provider', () => {
    const phantomProvider = {
      isPhantom: true,
      connect: () => Promise.resolve({ publicKey: { toBase58: () => 'phantom' } }),
    };
    const legacyProvider = {
      connect: () => Promise.resolve({ publicKey: { toBase58: () => 'legacy' } }),
    };

    expect(
      getInjectedBrowserProvider({
        phantom: { solana: phantomProvider },
        solana: legacyProvider,
      }),
    ).toBe(phantomProvider);
  });

  it('reads both Phantom-scoped and legacy global providers from the browser window', () => {
    const phantomProvider = {
      isPhantom: true,
      connect: () => Promise.resolve({ publicKey: { toBase58: () => 'phantom' } }),
    };
    const legacyProvider = {
      connect: () => Promise.resolve({ publicKey: { toBase58: () => 'legacy' } }),
    };
    vi.stubGlobal('window', {
      phantom: { solana: phantomProvider },
      solana: legacyProvider,
    });

    expect(readInjectedBrowserWalletWindow()).toEqual({
      phantom: { solana: phantomProvider },
      solana: legacyProvider,
    });
  });

  it('returns null when injected solana does not expose a connect function', () => {
    expect(
      getInjectedBrowserProvider({ solana: { isPhantom: true } } as unknown as { solana?: unknown }),
    ).toBeNull();
  });

  it('normalizes a provider public key into base58 address text', () => {
    expect(
      normalizeBrowserWalletAddress({
        toBase58: () => 'DemoWallet1111111111111111111111111111111111',
      }),
    ).toBe('DemoWallet1111111111111111111111111111111111');
  });

  it('connectBrowserWallet returns address when connect response has publicKey', async () => {
    const provider = {
      connect: () => Promise.resolve({
        publicKey: {
          toBase58: () => 'ConnectResult111111111111111111111111111111111',
        },
      }),
    };

    await expect(connectBrowserWallet({ solana: provider })).resolves.toBe(
      'ConnectResult111111111111111111111111111111111',
    );
  });

  it('connectBrowserWallet returns existing provider publicKey without calling connect', async () => {
    const connect = vi.fn(() => Promise.reject(new Error('connect should not be called')));
    const provider = {
      isConnected: true,
      publicKey: {
        toBase58: () => 'AlreadyConnected111111111111111111111111111111',
      },
      connect,
    };

    await expect(connectBrowserWallet({ solana: provider })).resolves.toBe(
      'AlreadyConnected111111111111111111111111111111',
    );
    expect(connect).not.toHaveBeenCalled();
  });

  it('connectBrowserWallet throws controlled error when no provider is injected', async () => {
    await expect(connectBrowserWallet(undefined)).rejects.toThrow(
      'No supported browser wallet detected on this device',
    );
  });

  it('connectBrowserWallet throws controlled error when injected solana shape is unsupported', async () => {
    await expect(
      connectBrowserWallet({ solana: { isPhantom: true } } as unknown as { solana?: unknown }),
    ).rejects.toThrow('No supported browser wallet detected on this device');
  });

  it('connectBrowserWallet uses provider.publicKey when connect returns undefined', async () => {
    const provider = {
      publicKey: {
        toBase58: () => 'ProviderState111111111111111111111111111111111',
      },
      connect: () => Promise.resolve(undefined),
    };

    await expect(connectBrowserWallet({ solana: provider })).resolves.toBe(
      'ProviderState111111111111111111111111111111111',
    );
  });

  it('connectBrowserWallet throws controlled error when no public key exists after connect', async () => {
    const provider = {
      connect: () => Promise.resolve(undefined),
    };

    await expect(connectBrowserWallet({ solana: provider })).rejects.toThrow(
      'Wallet provider did not return a public key',
    );
  });

  it('connectBrowserWallet rejects Phantom unauthorized errors immediately for manual retry', async () => {
    const unauthorizedError = Object.assign(
      new Error('The requested method and/or account has not been authorized by the user'),
      { code: 4100 },
    );
    const provider = {
      connect: vi.fn(() => Promise.reject(unauthorizedError)),
      on: vi.fn(),
    };

    await expect(connectBrowserWallet({ solana: provider })).rejects.toBe(unauthorizedError);
    expect(provider.on).not.toHaveBeenCalled();
  });

  it('connectBrowserWallet rejects user-denied Phantom errors immediately', async () => {
    vi.useFakeTimers();
    try {
      const rejectedError = Object.assign(new Error('User rejected the request'), { code: 4001 });
      const provider = {
        connect: vi.fn(() => Promise.reject(rejectedError)),
        on: vi.fn(),
      };

      await expect(connectBrowserWallet({ solana: provider })).rejects.toBe(rejectedError);
    } finally {
      vi.useRealTimers();
    }
  });

  it('disconnectBrowserWallet is safe when provider is missing', async () => {
    await expect(disconnectBrowserWallet(undefined)).resolves.toBeUndefined();
  });

  it('disconnectBrowserWallet calls provider.disconnect when provider exists', async () => {
    let disconnectCalls = 0;
    const provider = {
      connect: () => Promise.resolve({ publicKey: null }),
      disconnect: () => {
        disconnectCalls += 1;
        return Promise.resolve();
      },
    };

    await disconnectBrowserWallet({ solana: provider });

    expect(disconnectCalls).toBe(1);
  });

  it('signBrowserTransaction deserializes payload before passing it to the provider', async () => {
    let received: unknown;
    let signTransactionCalls = 0;
    const provider = {
      connect: () => Promise.resolve({ publicKey: null }),
      signTransaction: (payload: unknown) => {
        signTransactionCalls += 1;
        received = payload;
        return Promise.resolve({ serialize: () => new Uint8Array([4, 5, 6]) });
      },
    };

    await signBrowserTransaction({
      browserWindow: { solana: provider },
      serializedPayload: VALID_SERIALIZED_PAYLOAD,
    });

    expect(signTransactionCalls).toBe(1);
    expect(received).toBeInstanceOf(VersionedTransaction);
    expect(received).not.toBeInstanceOf(Uint8Array);
    expect(typeof (received as { serialize?: unknown }).serialize).toBe('function');
    expect((received as { signatures?: unknown }).signatures).toBeDefined();
    expect((received as { message?: unknown }).message).toBeDefined();
  });

  it('signBrowserTransaction serializes the signed transaction result and re-encodes as base64', async () => {
    const signedPayload = new Uint8Array([4, 5, 6]);
    const fakeSignedPayload = {
      serialize: () => signedPayload,
    };
    const provider = {
      connect: () => Promise.resolve({ publicKey: null }),
      signTransaction: () => Promise.resolve(fakeSignedPayload),
    };

    const result = await signBrowserTransaction({
      browserWindow: { solana: provider },
      serializedPayload: VALID_SERIALIZED_PAYLOAD,
    });

    expect(result).toBe(Buffer.from([4, 5, 6]).toString('base64'));
  });

  it('signBrowserTransaction throws when no browser wallet provider is injected', async () => {
    await expect(
      signBrowserTransaction({
        browserWindow: undefined,
        serializedPayload: VALID_SERIALIZED_PAYLOAD,
      }),
    ).rejects.toThrow('No supported browser wallet detected on this device');
  });

  it('signBrowserTransaction throws when the provider cannot sign transactions', async () => {
    const provider = {
      connect: () => Promise.resolve({ publicKey: null }),
    };

    await expect(
      signBrowserTransaction({
        browserWindow: { solana: provider },
        serializedPayload: VALID_SERIALIZED_PAYLOAD,
      }),
    ).rejects.toThrow('Connected browser wallet cannot sign transactions');
  });
});

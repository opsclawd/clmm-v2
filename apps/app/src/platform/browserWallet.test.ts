import { describe, expect, it } from 'vitest';
import {
  connectBrowserWallet,
  disconnectBrowserWallet,
  getInjectedBrowserProvider,
  normalizeBrowserWalletAddress,
  signBrowserTransaction,
} from './browserWallet';

const VALID_SERIALIZED_PAYLOAD = Buffer.from([1, 2, 3, 4]).toString('base64');

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

  it('signBrowserTransaction decodes payload and passes bytes to provider', async () => {
    let received: unknown;
    const provider = {
      connect: () => Promise.resolve({ publicKey: null }),
      signTransaction: (payload: unknown) => {
        received = payload;
        return Promise.resolve(new Uint8Array([4, 5, 6]));
      },
    };

    await signBrowserTransaction({
      browserWindow: { solana: provider },
      serializedPayload: VALID_SERIALIZED_PAYLOAD,
    });

    expect(received).toBeInstanceOf(Uint8Array);
    expect(Array.from(received as Uint8Array)).toEqual([1, 2, 3, 4]);
  });

  it('signBrowserTransaction normalizes serialized result and re-encodes as base64', async () => {
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

  it('signBrowserTransaction throws a clear error when the provider returns an unsupported result shape', async () => {
    const provider = {
      connect: () => Promise.resolve({ publicKey: null }),
      signTransaction: () => Promise.resolve('signed-payload'),
    };

    await expect(
      signBrowserTransaction({
        browserWindow: { solana: provider },
        serializedPayload: VALID_SERIALIZED_PAYLOAD,
      }),
    ).rejects.toThrow('Wallet returned an unsupported signed transaction payload');
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

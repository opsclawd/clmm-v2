import { describe, expect, it } from 'vitest';
import { VersionedTransaction } from '@solana/web3.js';
import {
  connectBrowserWallet,
  disconnectBrowserWallet,
  getInjectedBrowserProvider,
  normalizeBrowserWalletAddress,
  signTransactionWithBrowserWallet,
} from './browserWallet';

// Minimal valid serialized v0 transaction: 1 sig slot + v0 message with 1 account key, no instructions
const VALID_VERSIONED_TX_BYTES = new Uint8Array([
  0x01, // compact-u16: 1 signature
  ...new Array(64).fill(0), // placeholder signature (64 zero bytes)
  0x80, // version prefix: v0
  0x01, 0x00, 0x00, // header: 1 required signer, 0 readonly signed, 0 readonly unsigned
  0x01, // compact-u16: 1 account key
  ...new Array(32).fill(0), // account key (32 zero bytes)
  ...new Array(32).fill(0), // recent blockhash (32 zero bytes)
  0x00, // compact-u16: 0 instructions
  0x00, // compact-u16: 0 address table lookups
]);

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

  it('signTransactionWithBrowserWallet deserializes bytes and passes VersionedTransaction to provider', async () => {
    let received: unknown;
    const provider = {
      connect: () => Promise.resolve({ publicKey: null }),
      signTransaction: (transaction: unknown) => {
        received = transaction;
        return Promise.resolve(new Uint8Array([4, 5, 6]));
      },
    };

    await signTransactionWithBrowserWallet({ solana: provider }, VALID_VERSIONED_TX_BYTES);

    expect(received).toBeInstanceOf(VersionedTransaction);
  });

  it('signTransactionWithBrowserWallet normalizes VersionedTransaction result into Uint8Array', async () => {
    const signedBytes = new Uint8Array([4, 5, 6]);
    const fakeSignedTx = {
      serialize: () => signedBytes,
    } as unknown as VersionedTransaction;
    const provider = {
      connect: () => Promise.resolve({ publicKey: null }),
      signTransaction: () => Promise.resolve(fakeSignedTx),
    };

    const result = await signTransactionWithBrowserWallet({ solana: provider }, VALID_VERSIONED_TX_BYTES);

    expect(result).toBe(signedBytes);
  });

  it('signTransactionWithBrowserWallet throws a clear error when the provider returns an unsupported result shape', async () => {
    const provider = {
      connect: () => Promise.resolve({ publicKey: null }),
      signTransaction: () => Promise.resolve('signed-payload'),
    };

    await expect(
      signTransactionWithBrowserWallet({ solana: provider }, VALID_VERSIONED_TX_BYTES),
    ).rejects.toThrow('Wallet returned an unsupported signed transaction payload');
  });

  it('signTransactionWithBrowserWallet throws when no browser wallet provider is injected', async () => {
    await expect(
      signTransactionWithBrowserWallet(undefined, new Uint8Array([1, 2, 3])),
    ).rejects.toThrow('No supported browser wallet detected on this device');
  });

  it('signTransactionWithBrowserWallet throws when the provider cannot sign transactions', async () => {
    const provider = {
      connect: () => Promise.resolve({ publicKey: null }),
    };

    await expect(
      signTransactionWithBrowserWallet({ solana: provider }, new Uint8Array([1, 2, 3])),
    ).rejects.toThrow('Wallet does not support transaction signing');
  });
});

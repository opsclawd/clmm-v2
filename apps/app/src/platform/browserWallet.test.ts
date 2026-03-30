import { describe, expect, it } from 'vitest';
import {
  connectBrowserWallet,
  disconnectBrowserWallet,
  getInjectedBrowserProvider,
  normalizeBrowserWalletAddress,
} from './browserWallet.js';

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
});

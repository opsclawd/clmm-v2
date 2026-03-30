import { describe, expect, it } from 'vitest';
import {
  getInjectedBrowserProvider,
  normalizeBrowserWalletAddress,
} from './browserWallet.js';

describe('browserWallet helpers', () => {
  it('returns null when no browser wallet provider exists', () => {
    expect(getInjectedBrowserProvider(undefined)).toBeNull();
  });

  it('prefers phantom provider when available', () => {
    const provider = { isPhantom: true, connect: async () => ({ publicKey: { toBase58: () => 'abc' } }) };

    expect(getInjectedBrowserProvider({ solana: provider })).toBe(provider);
  });

  it('normalizes a provider public key into base58 address text', () => {
    expect(
      normalizeBrowserWalletAddress({
        toBase58: () => 'DemoWallet1111111111111111111111111111111111',
      }),
    ).toBe('DemoWallet1111111111111111111111111111111111');
  });
});

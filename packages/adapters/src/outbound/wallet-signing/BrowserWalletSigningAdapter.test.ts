import { describe, it, expect } from 'vitest';
import { BrowserWalletSigningAdapter } from './BrowserWalletSigningAdapter';
import { runWalletSigningPortContract } from '@clmm/testing/src/contracts/index.js';
import { makeWalletId } from '@clmm/domain';

runWalletSigningPortContract(() =>
  BrowserWalletSigningAdapter.create(
    async ({ transaction }) => ({ signedTransaction: transaction }),
  ),
);

describe('BrowserWalletSigningAdapter', () => {
  it('returns signed with the bytes from the callback', async () => {
    const signedBytes = new Uint8Array([9, 8, 7]);
    const adapter = BrowserWalletSigningAdapter.create(
      async (_config) => ({ signedTransaction: signedBytes }),
    );
    const result = await adapter.requestSignature(
      new Uint8Array([1, 2, 3]),
      makeWalletId('any-wallet'),
    );
    expect(result).toEqual({ kind: 'signed', signedPayload: signedBytes });
  });

  it('returns declined when callback throws a user-rejected message', async () => {
    const adapter = BrowserWalletSigningAdapter.create(async () => {
      throw new Error('User rejected the request');
    });
    const result = await adapter.requestSignature(
      new Uint8Array([1, 2, 3]),
      makeWalletId('any-wallet'),
    );
    expect(result).toEqual({ kind: 'declined' });
  });

  it('returns declined when callback throws a denied message', async () => {
    const adapter = BrowserWalletSigningAdapter.create(async () => {
      throw new Error('Transaction denied');
    });
    const result = await adapter.requestSignature(
      new Uint8Array([1, 2, 3]),
      makeWalletId('any-wallet'),
    );
    expect(result).toEqual({ kind: 'declined' });
  });

  it('returns interrupted when callback throws a timeout message', async () => {
    const adapter = BrowserWalletSigningAdapter.create(async () => {
      throw new Error('Request timeout');
    });
    const result = await adapter.requestSignature(
      new Uint8Array([1, 2, 3]),
      makeWalletId('any-wallet'),
    );
    expect(result).toEqual({ kind: 'interrupted' });
  });

  it('returns interrupted for any other thrown error', async () => {
    const adapter = BrowserWalletSigningAdapter.create(async () => {
      throw new Error('Something unexpected');
    });
    const result = await adapter.requestSignature(
      new Uint8Array([1, 2, 3]),
      makeWalletId('any-wallet'),
    );
    expect(result).toEqual({ kind: 'interrupted' });
  });
});

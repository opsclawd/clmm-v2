/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, vi } from 'vitest';
import {
  signMessageWithWallet,
  type BrowserMessageSigner,
} from './signMessageWithWallet';
import type { WalletConnectionKind } from '../state/walletSessionStore';

vi.mock('../platform/nativeWallet', () => ({
  signNativeMessage: (...args: unknown[]) => mockSignNative(...args),
}));

const mockSignNative = vi.fn();

function makeBrowserSigner(overrides: Partial<BrowserMessageSigner> = {}): BrowserMessageSigner {
  return {
    isConnected: true,
    account: 'wallet-1',
    signMessageBytes: vi.fn().mockResolvedValue(new Uint8Array(64)),
    ...overrides,
  };
}

describe('signMessageWithWallet', () => {
  const params = {
    walletId: 'wallet-1',
    message: 'test message',
    browserSigner: null as BrowserMessageSigner | null,
    connectionKind: 'browser' as WalletConnectionKind,
  };

  describe('native path', () => {
    it('returns ok with base64 signature on success', async () => {
      mockSignNative.mockResolvedValueOnce('base64sig');
      const result = await signMessageWithWallet({
        ...params,
        connectionKind: 'native',
        browserSigner: null,
      });
      expect(result).toEqual({ kind: 'ok', signatureBase64: 'base64sig' });
    });

    it('returns wallet-mismatch for "not return the requested authorized account"', async () => {
      mockSignNative.mockRejectedValueOnce(new Error('Native wallet did not return the requested authorized account'));
      const result = await signMessageWithWallet({
        ...params,
        connectionKind: 'native',
        browserSigner: null,
      });
      expect(result).toEqual({ kind: 'wallet-mismatch' });
    });

    it('returns rejected for user rejection errors', async () => {
      mockSignNative.mockRejectedValueOnce(new Error('User rejected the request'));
      const result = await signMessageWithWallet({
        ...params,
        connectionKind: 'native',
        browserSigner: null,
      });
      expect(result).toEqual({ kind: 'rejected' });
    });

    it('returns failed for unknown errors', async () => {
      mockSignNative.mockRejectedValueOnce(new Error('something unexpected'));
      const result = await signMessageWithWallet({
        ...params,
        connectionKind: 'native',
        browserSigner: null,
      });
      expect(result).toEqual({ kind: 'failed' });
    });
  });

  describe('browser path', () => {
    it('returns unsupported when browserSigner is null', async () => {
      const result = await signMessageWithWallet({
        ...params,
        browserSigner: null,
        connectionKind: 'browser',
      });
      expect(result).toEqual({ kind: 'unsupported' });
    });

    it('returns unsupported when browserSigner lacks signMessageBytes', async () => {
      const signer = { isConnected: true, account: 'wallet-1' } as unknown as BrowserMessageSigner;
      const result = await signMessageWithWallet({
        ...params,
        browserSigner: signer,
        connectionKind: 'browser',
      });
      expect(result).toEqual({ kind: 'unsupported' });
    });

    it('returns failed when signer is not connected', async () => {
      const result = await signMessageWithWallet({
        ...params,
        browserSigner: makeBrowserSigner({ isConnected: false }),
        connectionKind: 'browser',
      });
      expect(result).toEqual({ kind: 'failed' });
    });

    it('returns wallet-mismatch when account differs', async () => {
      const result = await signMessageWithWallet({
        ...params,
        browserSigner: makeBrowserSigner({ account: 'different-wallet' }),
        connectionKind: 'browser',
      });
      expect(result).toEqual({ kind: 'wallet-mismatch' });
    });

    it('returns ok with base64 on successful sign', async () => {
      const signedBytes = new Uint8Array([1, 2, 3, 4]);
      const result = await signMessageWithWallet({
        ...params,
        browserSigner: makeBrowserSigner({ signMessageBytes: vi.fn().mockResolvedValue(signedBytes) }),
        connectionKind: 'browser',
      });
      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        expect(typeof result.signatureBase64).toBe('string');
        expect(result.signatureBase64.length).toBeGreaterThan(0);
      }
    });

    it('returns rejected when signer throws a rejection error', async () => {
      const result = await signMessageWithWallet({
        ...params,
        browserSigner: makeBrowserSigner({ signMessageBytes: vi.fn().mockRejectedValue(new Error('User rejected')) }),
        connectionKind: 'browser',
      });
      expect(result).toEqual({ kind: 'rejected' });
    });

    it('returns unsupported for "not available" errors', async () => {
      const result = await signMessageWithWallet({
        ...params,
        browserSigner: makeBrowserSigner({ signMessageBytes: vi.fn().mockRejectedValue(new Error('signMessageBytes is not available')) }),
        connectionKind: 'browser',
      });
      expect(result).toEqual({ kind: 'unsupported' });
    });
  });
});
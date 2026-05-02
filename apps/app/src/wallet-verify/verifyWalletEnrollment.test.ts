/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyWalletEnrollment, type EnrollmentOutcome } from './verifyWalletEnrollment';
import type { ChallengeResult, EnrollResult, WalletChallenge } from '../api/wallets';
import type { SignMessageOutcome } from './signMessageWithWallet';

const mockRequestWalletChallenge = vi.fn();
const mockEnrollWalletWithProof = vi.fn();
const mockSignMessageWithWallet = vi.fn();

vi.mock('../api/wallets', () => ({
  requestWalletChallenge: (...args: unknown[]) => mockRequestWalletChallenge(...args),
  enrollWalletWithProof: (...args: unknown[]) => mockEnrollWalletWithProof(...args),
}));
vi.mock('./signMessageWithWallet', () => ({
  signMessageWithWallet: (...args: unknown[]) => mockSignMessageWithWallet(...args),
}));

const VALID_CHALLENGE: WalletChallenge = {
  walletId: 'wallet-1',
  nonce: 'a'.repeat(64),
  expiresAt: 1_777_750_000_000,
  message: 'CLMM wallet verification\n\nWallet: wallet-1\nNonce: …',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('verifyWalletEnrollment', () => {
  it('returns enrolled on the happy path', async () => {
    mockRequestWalletChallenge.mockResolvedValueOnce({
      kind: 'ok',
      challenge: VALID_CHALLENGE,
    } satisfies ChallengeResult);
    mockSignMessageWithWallet.mockResolvedValueOnce({
      kind: 'ok',
      signatureBase64: 'AAAA',
    } satisfies SignMessageOutcome);
    mockEnrollWalletWithProof.mockResolvedValueOnce({
      kind: 'ok',
      enrolledAt: 1_000_000,
    } satisfies EnrollResult);

    const outcome = await verifyWalletEnrollment({
      walletId: 'wallet-1',
      connectionKind: 'browser',
      browserSigner: { isConnected: true, account: 'wallet-1', signMessageBytes: () => Promise.resolve(new Uint8Array(64)) },
    });

    expect(outcome).toEqual({ kind: 'enrolled', enrolledAt: 1_000_000 } satisfies EnrollmentOutcome);
    expect(mockRequestWalletChallenge).toHaveBeenCalledWith('wallet-1');
    expect(mockSignMessageWithWallet).toHaveBeenCalledWith({
      walletId: 'wallet-1',
      connectionKind: 'browser',
      message: VALID_CHALLENGE.message,
      browserSigner: expect.anything(),
    });
    expect(mockEnrollWalletWithProof).toHaveBeenCalledWith('wallet-1', {
      nonce: VALID_CHALLENGE.nonce,
      message: VALID_CHALLENGE.message,
      signature: 'AAAA',
    });
  });

  it('returns challenge-failed on /challenge error and does not call /enroll or /monitor', async () => {
    mockRequestWalletChallenge.mockResolvedValueOnce({
      kind: 'error',
      code: 'WALLET_MALFORMED',
    } satisfies ChallengeResult);

    const outcome = await verifyWalletEnrollment({
      walletId: 'bad',
      connectionKind: 'browser',
      browserSigner: null,
    });

    expect(outcome).toEqual({ kind: 'challenge-failed', code: 'WALLET_MALFORMED' });
    expect(mockSignMessageWithWallet).not.toHaveBeenCalled();
    expect(mockEnrollWalletWithProof).not.toHaveBeenCalled();
  });

  it('returns signing-unsupported when the signer cannot sign messages', async () => {
    mockRequestWalletChallenge.mockResolvedValueOnce({ kind: 'ok', challenge: VALID_CHALLENGE });
    mockSignMessageWithWallet.mockResolvedValueOnce({ kind: 'unsupported' });

    const outcome = await verifyWalletEnrollment({
      walletId: 'wallet-1',
      connectionKind: 'browser',
      browserSigner: null,
    });

    expect(outcome).toEqual({ kind: 'signing-unsupported' });
    expect(mockEnrollWalletWithProof).not.toHaveBeenCalled();
  });

  it('returns wallet-mismatch when the signer account differs', async () => {
    mockRequestWalletChallenge.mockResolvedValueOnce({ kind: 'ok', challenge: VALID_CHALLENGE });
    mockSignMessageWithWallet.mockResolvedValueOnce({ kind: 'wallet-mismatch' });

    const outcome = await verifyWalletEnrollment({
      walletId: 'wallet-1',
      connectionKind: 'native',
      browserSigner: null,
    });

    expect(outcome).toEqual({ kind: 'wallet-mismatch' });
    expect(mockEnrollWalletWithProof).not.toHaveBeenCalled();
  });

  it('returns user-rejected when the user declines to sign', async () => {
    mockRequestWalletChallenge.mockResolvedValueOnce({ kind: 'ok', challenge: VALID_CHALLENGE });
    mockSignMessageWithWallet.mockResolvedValueOnce({ kind: 'rejected' });

    const outcome = await verifyWalletEnrollment({
      walletId: 'wallet-1',
      connectionKind: 'browser',
      browserSigner: { isConnected: true, account: 'wallet-1', signMessageBytes: () => Promise.resolve(new Uint8Array(64)) },
    });

    expect(outcome).toEqual({ kind: 'user-rejected' });
    expect(mockEnrollWalletWithProof).not.toHaveBeenCalled();
  });

  it('returns enroll-failed when /enroll returns an error code', async () => {
    mockRequestWalletChallenge.mockResolvedValueOnce({ kind: 'ok', challenge: VALID_CHALLENGE });
    mockSignMessageWithWallet.mockResolvedValueOnce({ kind: 'ok', signatureBase64: 'AAAA' });
    mockEnrollWalletWithProof.mockResolvedValueOnce({
      kind: 'error',
      code: 'CHALLENGE_EXPIRED',
    } satisfies EnrollResult);

    const outcome = await verifyWalletEnrollment({
      walletId: 'wallet-1',
      connectionKind: 'browser',
      browserSigner: { isConnected: true, account: 'wallet-1', signMessageBytes: () => Promise.resolve(new Uint8Array(64)) },
    });

    expect(outcome).toEqual({ kind: 'enroll-failed', code: 'CHALLENGE_EXPIRED' });
  });

  it('never calls /monitor on any failure path', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    mockRequestWalletChallenge
      .mockResolvedValueOnce({ kind: 'error', code: 'WALLET_MALFORMED' })
      .mockResolvedValue({ kind: 'ok', challenge: VALID_CHALLENGE });
    mockSignMessageWithWallet
      .mockResolvedValueOnce({ kind: 'unsupported' })
      .mockResolvedValueOnce({ kind: 'wallet-mismatch' })
      .mockResolvedValueOnce({ kind: 'rejected' })
      .mockResolvedValueOnce({ kind: 'failed' })
      .mockResolvedValue({ kind: 'ok', signatureBase64: 'AAAA' });
    mockEnrollWalletWithProof
      .mockResolvedValueOnce({ kind: 'error', code: 'CHALLENGE_EXPIRED' })
      .mockResolvedValue({ kind: 'ok', enrolledAt: 1_000_000 });

    for (let i = 0; i < 7; i++) {
      await verifyWalletEnrollment({
        walletId: 'wallet-1',
        connectionKind: 'browser',
        browserSigner: { isConnected: true, account: 'wallet-1', signMessageBytes: () => Promise.resolve(new Uint8Array(64)) },
      });
    }

    const monitorCalls = fetchSpy.mock.calls.filter(([input]: [unknown]) =>
      typeof input === 'string' && input.includes('/monitor'),
    );
    expect(monitorCalls).toEqual([]);

    vi.unstubAllGlobals();
  });
});
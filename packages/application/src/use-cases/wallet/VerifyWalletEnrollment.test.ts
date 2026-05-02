import { describe, it, expect } from 'vitest';
import { verifyWalletEnrollment } from './VerifyWalletEnrollment.js';
import type {
  WalletEnrollmentApiPort,
  WalletMessageSigningPort,
  EnrollmentErrorCode,
  ChallengeRequestResult,
  EnrollWithCredentialsResult,
  SignMessageOutcome,
} from '../../ports/index.js';

function fakeApi(overrides?: {
  challenge?: ChallengeRequestResult;
  enroll?: EnrollWithCredentialsResult;
}): WalletEnrollmentApiPort {
  const defaultChallenge: ChallengeRequestResult = {
    kind: 'ok' as const,
    challenge: {
      walletId: 'test-wallet',
      nonce: 'abc123',
      expiresAt: 1_714_000_000,
      message: 'verify-abc123-1714000000',
    },
  };
  const defaultEnroll: EnrollWithCredentialsResult = {
    kind: 'ok' as const,
    enrolledAt: 1_714_000_000,
  };
  return {
    requestChallenge: async () => overrides?.challenge ?? defaultChallenge,
    enrollWithCredentials: async () => overrides?.enroll ?? defaultEnroll,
  };
}

function fakeSigner(overrides?: {
  sign?: SignMessageOutcome;
}): WalletMessageSigningPort {
  const defaultResult: SignMessageOutcome = { kind: 'ok' as const, signatureBase64: 'sig==' };
  return {
    signMessage: async () => overrides?.sign ?? defaultResult,
  };
}

describe('verifyWalletEnrollment', () => {
  it('enrolls successfully when challenge, signing, and enroll all succeed', async () => {
    const outcome = await verifyWalletEnrollment({
      walletId: 'test-wallet',
      enrollmentApi: fakeApi(),
      messageSigner: fakeSigner(),
    });
    expect(outcome).toEqual({
      kind: 'enrolled',
      enrolledAt: 1_714_000_000,
    });
  });

  it('returns challenge-failed when challenge request fails', async () => {
    const outcome = await verifyWalletEnrollment({
      walletId: 'test-wallet',
      enrollmentApi: fakeApi({
        challenge: { kind: 'error', code: 'NETWORK_ERROR' as EnrollmentErrorCode },
      }),
      messageSigner: fakeSigner(),
    });
    expect(outcome).toEqual({ kind: 'challenge-failed', code: 'NETWORK_ERROR' });
  });

  it('returns signing-unsupported when signer returns unsupported', async () => {
    const outcome = await verifyWalletEnrollment({
      walletId: 'test-wallet',
      enrollmentApi: fakeApi(),
      messageSigner: fakeSigner({ sign: { kind: 'unsupported' } }),
    });
    expect(outcome).toEqual({ kind: 'signing-unsupported' });
  });

  it('returns wallet-mismatch when signer rejects with mismatch', async () => {
    const outcome = await verifyWalletEnrollment({
      walletId: 'test-wallet',
      enrollmentApi: fakeApi(),
      messageSigner: fakeSigner({ sign: { kind: 'wallet-mismatch' } }),
    });
    expect(outcome).toEqual({ kind: 'wallet-mismatch' });
  });

  it('returns user-rejected when signer returns rejected', async () => {
    const outcome = await verifyWalletEnrollment({
      walletId: 'test-wallet',
      enrollmentApi: fakeApi(),
      messageSigner: fakeSigner({ sign: { kind: 'rejected' } }),
    });
    expect(outcome).toEqual({ kind: 'user-rejected' });
  });

  it('returns signing-failed when signer returns failed', async () => {
    const outcome = await verifyWalletEnrollment({
      walletId: 'test-wallet',
      enrollmentApi: fakeApi(),
      messageSigner: fakeSigner({ sign: { kind: 'failed' } }),
    });
    expect(outcome).toEqual({ kind: 'signing-failed' });
  });

  it('returns enroll-failed when enroll request fails', async () => {
    const outcome = await verifyWalletEnrollment({
      walletId: 'test-wallet',
      enrollmentApi: fakeApi({
        enroll: { kind: 'error', code: 'SIGNATURE_INVALID' as EnrollmentErrorCode },
      }),
      messageSigner: fakeSigner(),
    });
    expect(outcome).toEqual({ kind: 'enroll-failed', code: 'SIGNATURE_INVALID' });
  });
});
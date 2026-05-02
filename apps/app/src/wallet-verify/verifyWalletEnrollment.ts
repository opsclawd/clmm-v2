import {
  requestWalletChallenge,
  enrollWalletWithProof,
  type EnrollErrorCode,
} from '../api/wallets';
import {
  signMessageWithWallet,
  type BrowserMessageSigner,
} from './signMessageWithWallet';
import type { WalletConnectionKind } from '../state/walletSessionStore';

export type EnrollmentOutcome =
  | { kind: 'enrolled'; enrolledAt: number }
  | { kind: 'challenge-failed'; code: EnrollErrorCode }
  | { kind: 'signing-unsupported' }
  | { kind: 'wallet-mismatch' }
  | { kind: 'user-rejected' }
  | { kind: 'signing-failed' }
  | { kind: 'enroll-failed'; code: EnrollErrorCode };

export async function verifyWalletEnrollment(params: {
  walletId: string;
  connectionKind: WalletConnectionKind;
  browserSigner: BrowserMessageSigner | null;
}): Promise<EnrollmentOutcome> {
  const challenge = await requestWalletChallenge(params.walletId);
  if (challenge.kind === 'error') {
    return { kind: 'challenge-failed', code: challenge.code };
  }

  const signed = await signMessageWithWallet({
    walletId: params.walletId,
    connectionKind: params.connectionKind,
    message: challenge.challenge.message,
    browserSigner: params.browserSigner,
  });

  switch (signed.kind) {
    case 'unsupported':
      return { kind: 'signing-unsupported' };
    case 'wallet-mismatch':
      return { kind: 'wallet-mismatch' };
    case 'rejected':
      return { kind: 'user-rejected' };
    case 'failed':
      return { kind: 'signing-failed' };
    case 'ok':
      break;
  }

  const enroll = await enrollWalletWithProof(params.walletId, {
    nonce: challenge.challenge.nonce,
    message: challenge.challenge.message,
    signature: signed.signatureBase64,
  });

  if (enroll.kind === 'error') {
    return { kind: 'enroll-failed', code: enroll.code };
  }
  return { kind: 'enrolled', enrolledAt: enroll.enrolledAt };
}
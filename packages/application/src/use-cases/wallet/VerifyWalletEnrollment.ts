import type {
  WalletEnrollmentApiPort,
  WalletMessageSigningPort,
  EnrollmentErrorCode,
} from '../../ports/index.js';

export type EnrollmentOutcome =
  | { kind: 'enrolled'; enrolledAt: number }
  | { kind: 'challenge-failed'; code: EnrollmentErrorCode }
  | { kind: 'signing-unsupported' }
  | { kind: 'wallet-mismatch' }
  | { kind: 'user-rejected' }
  | { kind: 'signing-failed' }
  | { kind: 'enroll-failed'; code: EnrollmentErrorCode };

export async function verifyWalletEnrollment(params: {
  walletId: string;
  enrollmentApi: WalletEnrollmentApiPort;
  messageSigner: WalletMessageSigningPort;
}): Promise<EnrollmentOutcome> {
  const challenge = await params.enrollmentApi.requestChallenge(params.walletId);
  if (challenge.kind === 'error') {
    return { kind: 'challenge-failed', code: challenge.code };
  }

  const signed = await params.messageSigner.signMessage({
    walletId: params.walletId,
    message: challenge.challenge.message,
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

  const enroll = await params.enrollmentApi.enrollWithCredentials(
    params.walletId,
    {
      nonce: challenge.challenge.nonce,
      message: challenge.challenge.message,
      signature: signed.signatureBase64,
    },
  );

  if (enroll.kind === 'error') {
    return { kind: 'enroll-failed', code: enroll.code };
  }
  return { kind: 'enrolled', enrolledAt: enroll.enrolledAt };
}
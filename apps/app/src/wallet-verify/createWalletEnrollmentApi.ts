import type {
  WalletEnrollmentApiPort,
  ChallengeRequestResult,
  EnrollWithCredentialsResult,
} from '@clmm/application/public';
import { requestWalletChallenge, enrollWalletWithCredentials } from '../api/wallets';

export function createWalletEnrollmentApi(): WalletEnrollmentApiPort {
  return {
    async requestChallenge(walletId: string): Promise<ChallengeRequestResult> {
      return requestWalletChallenge(walletId);
    },
    async enrollWithCredentials(
      walletId: string,
      credentials: { nonce: string; message: string; signature: string },
    ): Promise<EnrollWithCredentialsResult> {
      return enrollWalletWithCredentials(walletId, credentials);
    },
  };
}
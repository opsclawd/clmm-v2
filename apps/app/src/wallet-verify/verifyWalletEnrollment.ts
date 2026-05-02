import {
  verifyWalletEnrollment as domainVerifyWalletEnrollment,
  type EnrollmentOutcome,
} from '@clmm/application/public';
import type { WalletConnectionKind } from '../state/walletSessionStore';
import type { BrowserMessageSigner } from './signMessageWithWallet';
import { createWalletEnrollmentApi } from './createWalletEnrollmentApi';
import { createWalletMessageSigner } from './createWalletMessageSigner';

export type { EnrollmentOutcome };

export async function verifyWalletEnrollment(params: {
  walletId: string;
  connectionKind: WalletConnectionKind;
  browserSigner: BrowserMessageSigner | null;
}): Promise<EnrollmentOutcome> {
  return domainVerifyWalletEnrollment({
    walletId: params.walletId,
    enrollmentApi: createWalletEnrollmentApi(),
    messageSigner: createWalletMessageSigner({
      connectionKind: params.connectionKind,
      browserSigner: params.browserSigner,
    }),
  });
}
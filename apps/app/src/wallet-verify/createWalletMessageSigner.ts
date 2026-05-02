import type {
  WalletMessageSigningPort,
  SignMessageOutcome,
} from '@clmm/application/public';
import { signMessageWithWallet } from './signMessageWithWallet';
import type { BrowserMessageSigner } from './signMessageWithWallet';
import type { WalletConnectionKind } from '../state/walletSessionStore';

export function createWalletMessageSigner(params: {
  connectionKind: WalletConnectionKind;
  browserSigner: BrowserMessageSigner | null;
}): WalletMessageSigningPort {
  return {
    async signMessage(signParams: {
      walletId: string;
      message: string;
    }): Promise<SignMessageOutcome> {
      return signMessageWithWallet({
        walletId: signParams.walletId,
        connectionKind: params.connectionKind,
        message: signParams.message,
        browserSigner: params.browserSigner,
      });
    },
  };
}
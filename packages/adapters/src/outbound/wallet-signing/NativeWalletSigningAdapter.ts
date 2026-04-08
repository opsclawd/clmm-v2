/**
 * NativeWalletSigningAdapter
 *
 * Uses @solana-mobile/mobile-wallet-adapter-protocol with @solana/kit for React Native.
 * Signing remains EXPLICIT and USER-MEDIATED — backend NEVER stores signing authority.
 *
 * Docs: @solana-mobile/mobile-wallet-adapter-protocol-kit
 *       https://docs.solanamobile.com/get-started/react-native/mobile-wallet-adapter
 */
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-kit';
import type { KitMobileWallet } from '@solana-mobile/mobile-wallet-adapter-protocol-kit';
import {
  getTransactionDecoder,
  getBase64EncodedWireTransaction,
} from '@solana/kit';
import type { WalletSigningPort } from '@clmm/application';
import type { WalletId } from '@clmm/domain';

const APP_IDENTITY = {
  name: 'CLMM V2',
  uri: 'https://clmm.v2.app',
  icon: 'favicon.ico',
};

export class NativeWalletSigningAdapter implements WalletSigningPort {
  constructor(private readonly cluster: string = 'solana:mainnet') {}

  async requestSignature(
    serializedPayload: Uint8Array,
    walletId: WalletId,
  ): Promise<
    | { kind: 'signed'; signedPayload: Uint8Array }
    | { kind: 'declined' }
    | { kind: 'interrupted' }
  > {
    try {
      const signedTransactions = await transact(
        async (wallet: KitMobileWallet) => {
          const authResult = await wallet.authorize({
            identity: APP_IDENTITY,
            chain: this.cluster,
          });

          const account = authResult.accounts[0];
          if (!account || account.address !== walletId) {
            throw new Error(
              `Wallet address mismatch: expected ${walletId}, got ${account?.address ?? 'no account'}`,
            );
          }

          const transactionDecoder = getTransactionDecoder();
          const transaction = transactionDecoder.decode(serializedPayload);

          const signed = await wallet.signTransactions({
            transactions: [transaction],
          });
          return signed;
        },
      );

      if (!signedTransactions || signedTransactions.length === 0) {
        return { kind: 'declined' };
      }

      const signedTransaction = signedTransactions[0]!;
      const serialized = getBase64EncodedWireTransaction(signedTransaction);
      return {
        kind: 'signed',
        signedPayload: new Uint8Array(Buffer.from(serialized, 'base64')),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes('User rejected') ||
        errorMessage.includes('denied') ||
        errorMessage.includes('declined')
      ) {
        return { kind: 'declined' };
      }
      if (
        errorMessage.includes('timeout') ||
        errorMessage.includes('interrupted') ||
        errorMessage.includes('closed')
      ) {
        return { kind: 'interrupted' };
      }
      return { kind: 'interrupted' };
    }
  }
}

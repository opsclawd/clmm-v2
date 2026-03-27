/**
 * NativeWalletSigningAdapter
 *
 * Uses @solana-mobile/mobile-wallet-adapter-protocol (MWA) for React Native.
 * Signing remains EXPLICIT and USER-MEDIATED — backend NEVER stores signing authority.
 *
 * Docs: @solana-mobile/mobile-wallet-adapter-protocol-web3js v2
 *       https://docs.solanamobile.com/get-started/react-native/mobile-wallet-adapter
 */
import { transact, Web3MobileWallet } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { Transaction } from '@solana/web3.js';
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
        async (wallet: Web3MobileWallet) => {
          const authResult = await wallet.authorize({
            cluster: this.cluster as any,
            identity: APP_IDENTITY,
          });

          const account = authResult.accounts[0];
          if (!account || account.address !== walletId) {
            throw new Error(
              `Wallet address mismatch: expected ${walletId}, got ${account?.address ?? 'no account'}`,
            );
          }

          const transaction = Transaction.from(serializedPayload);
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
      return {
        kind: 'signed',
        signedPayload: signedTransaction.serialize(),
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
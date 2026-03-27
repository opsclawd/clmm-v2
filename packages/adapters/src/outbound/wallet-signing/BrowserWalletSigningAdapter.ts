/**
 * BrowserWalletSigningAdapter
 *
 * Uses @solana/wallet-adapter-react for desktop PWA.
 * This adapter uses a factory pattern - create it with a signTransaction function
 * obtained from useWallet() hook within a WalletProvider context.
 *
 * Usage in PWA:
 * ```tsx
 * import { useWallet } from '@solana/wallet-adapter-react';
 * import { BrowserWalletSigningAdapter } from '@clmm/adapters';
 *
 * function MyComponent() {
 *   const { signTransaction } = useWallet();
 *   const signingAdapter = BrowserWalletSigningAdapter.create(signTransaction);
 *   // use signingAdapter.requestSignature(...)
 * }
 * ```
 *
 * Docs: @solana/wallet-adapter-react
 *       https://github.com/anza-xyz/wallet-adapter
 */
import { Transaction } from '@solana/web3.js';
import type { WalletSigningPort } from '@clmm/application';
import type { WalletId } from '@clmm/domain';

export class BrowserWalletSigningAdapter implements WalletSigningPort {
  private constructor(
    private readonly signTx: (tx: Transaction) => Promise<Transaction>,
  ) {}

  static create(signTransaction: (tx: Transaction) => Promise<Transaction>): BrowserWalletSigningAdapter {
    return new BrowserWalletSigningAdapter(signTransaction);
  }

  async requestSignature(
    serializedPayload: Uint8Array,
    _walletId: WalletId,
  ): Promise<
    | { kind: 'signed'; signedPayload: Uint8Array }
    | { kind: 'declined' }
    | { kind: 'interrupted' }
  > {
    try {
      if (!this.signTx) {
        return { kind: 'interrupted' };
      }

      const transaction = Transaction.from(serializedPayload);
      const signedTransaction = await this.signTx(transaction);
      return {
        kind: 'signed',
        signedPayload: signedTransaction.serialize(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes('User rejected') ||
        errorMessage.includes('declined') ||
        errorMessage.includes('denied')
      ) {
        return { kind: 'declined' };
      }
      if (
        errorMessage.includes('timeout') ||
        errorMessage.includes('interrupted')
      ) {
        return { kind: 'interrupted' };
      }
      return { kind: 'interrupted' };
    }
  }
}
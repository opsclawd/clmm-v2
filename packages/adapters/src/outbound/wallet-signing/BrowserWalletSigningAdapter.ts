/**
 * BrowserWalletSigningAdapter
 *
 * Library-agnostic signing adapter for browser / PWA environments.
 * Accepts a SignSerializedTransaction callback — bytes in, bytes out.
 *
 * The PWA layer is responsible for adapting the wallet library's API
 * to this shape. For example, with @solana/react:
 *
 * ```tsx
 * import { useSignTransaction, useSelectedWalletAccount } from '@solana/react';
 * import { BrowserWalletSigningAdapter } from '@clmm/adapters';
 *
 * function MyComponent() {
 *   const [selectedAccount] = useSelectedWalletAccount();
 *   const signTransaction = useSignTransaction(selectedAccount, 'solana:mainnet');
 *   const adapter = BrowserWalletSigningAdapter.create(
 *     async (serializedTransaction) => {
 *       const { signedTransaction } = await signTransaction({
 *         transaction: serializedTransaction,
 *       });
 *       return signedTransaction;
 *     },
 *   );
 *   // use adapter.requestSignature(...)
 * }
 * ```
 */
import type { WalletSigningPort } from '@clmm/application';
import type { WalletId } from '@clmm/domain';

type SignSerializedTransaction = (
  serializedTransaction: Uint8Array,
) => Promise<Uint8Array>;

export class BrowserWalletSigningAdapter implements WalletSigningPort {
  private constructor(private readonly signTx: SignSerializedTransaction) {}

  static create(signTransaction: SignSerializedTransaction): BrowserWalletSigningAdapter {
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
      const signedPayload = await this.signTx(serializedPayload);
      return { kind: 'signed', signedPayload };
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

/**
 * BrowserWalletSigningAdapter
 *
 * Wallet Standard-compatible signing adapter for browser / PWA environments.
 * Accepts a SignTransactionFn whose shape matches the @solana/react
 * useSignTransaction() hook — consumers can pass it directly with no wrapper.
 *
 * Usage in PWA:
 * ```tsx
 * import { useSignTransaction, useSelectedWalletAccount } from '@solana/react';
 * import { BrowserWalletSigningAdapter } from '@clmm/adapters';
 *
 * function MyComponent() {
 *   const [selectedAccount] = useSelectedWalletAccount();
 *   const signTransaction = useSignTransaction(selectedAccount, 'solana:mainnet');
 *   const adapter = BrowserWalletSigningAdapter.create(signTransaction);
 *   // use adapter.requestSignature(...)
 * }
 * ```
 *
 * Docs: https://github.com/anza-xyz/kit/tree/main/packages/react
 *       https://github.com/wallet-standard/wallet-standard
 */
import type { WalletSigningPort } from '@clmm/application';
import type { WalletId } from '@clmm/domain';

type SignTransactionFn = (
  config: { transaction: Uint8Array },
) => Promise<{ signedTransaction: Uint8Array }>;

export class BrowserWalletSigningAdapter implements WalletSigningPort {
  private constructor(private readonly signTx: SignTransactionFn) {}

  static create(signTransaction: SignTransactionFn): BrowserWalletSigningAdapter {
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
      const { signedTransaction } = await this.signTx({ transaction: serializedPayload });
      return { kind: 'signed', signedPayload: signedTransaction };
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

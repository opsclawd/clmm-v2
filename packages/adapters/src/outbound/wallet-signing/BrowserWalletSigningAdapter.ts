/**
 * BrowserWalletSigningAdapter
 *
 * Uses @solana/wallet-adapter-react for desktop PWA.
 * ⚠️ Use solana-adapter-docs skill before implementing
 */
import type { WalletSigningPort } from '@clmm/application';
import type { WalletId } from '@clmm/domain';

export class BrowserWalletSigningAdapter implements WalletSigningPort {
  async requestSignature(
    _serializedPayload: Uint8Array,
    _walletId: WalletId,
  ): Promise<
    | { kind: 'signed'; signedPayload: Uint8Array }
    | { kind: 'declined' }
    | { kind: 'interrupted' }
  > {
    throw new Error('BrowserWalletSigningAdapter: invoke solana-adapter-docs skill first');
  }
}

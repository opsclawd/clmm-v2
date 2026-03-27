/**
 * NativeWalletSigningAdapter
 *
 * Uses @solana-mobile/mobile-wallet-adapter-protocol (MWA) for React Native.
 * Signing remains EXPLICIT and USER-MEDIATED — backend NEVER stores signing authority.
 *
 * ⚠️ Use solana-adapter-docs skill before implementing — MWA session management varies by version
 */
import type { WalletSigningPort } from '@clmm/application';
import type { WalletId } from '@clmm/domain';

export class NativeWalletSigningAdapter implements WalletSigningPort {
  async requestSignature(
    serializedPayload: Uint8Array,
    walletId: WalletId,
  ): Promise<
    | { kind: 'signed'; signedPayload: Uint8Array }
    | { kind: 'declined' }
    | { kind: 'interrupted' }
  > {
    throw new Error('NativeWalletSigningAdapter: invoke solana-adapter-docs skill first');
  }
}

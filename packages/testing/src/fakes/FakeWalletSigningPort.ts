import type { WalletSigningPort } from '@clmm/application';
import type { WalletId } from '@clmm/domain';

type SigningResult =
  | { kind: 'signed'; signedPayload: Uint8Array }
  | { kind: 'declined' }
  | { kind: 'interrupted' };

export class FakeWalletSigningPort implements WalletSigningPort {
  private _nextResult: SigningResult = {
    kind: 'signed',
    signedPayload: new Uint8Array([1, 2, 3]),
  };

  willDecline(): void {
    this._nextResult = { kind: 'declined' };
  }

  willInterrupt(): void {
    this._nextResult = { kind: 'interrupted' };
  }

  async requestSignature(
    _payload: Uint8Array,
    _walletId: WalletId,
  ): Promise<SigningResult> {
    return this._nextResult;
  }
}

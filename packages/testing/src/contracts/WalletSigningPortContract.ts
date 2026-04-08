import { describe, it, expect } from 'vitest';
import type { WalletSigningPort } from '@clmm/application';
import { makeWalletId } from '@clmm/domain';

export function runWalletSigningPortContract(
  factory: () => WalletSigningPort,
): void {
  describe('WalletSigningPort contract', () => {
    it('signed result contains a non-empty signedPayload', async () => {
      const port = factory();
      const result = await port.requestSignature(
        new Uint8Array([1, 2, 3]),
        makeWalletId('test-wallet'),
      );
      if (result.kind === 'signed') {
        expect(result.signedPayload.length).toBeGreaterThan(0);
      }
    });

    it('result kind is one of: signed | declined | interrupted', async () => {
      const port = factory();
      const result = await port.requestSignature(
        new Uint8Array([1, 2, 3]),
        makeWalletId('test-wallet'),
      );
      expect(['signed', 'declined', 'interrupted']).toContain(result.kind);
    });
  });
}

/**
 * Contract test: validates any SupportedPositionReadPort implementation.
 * Wire this with a real adapter + test database / recorded fixture to run.
 */
import { describe, it, expect } from 'vitest';
import type { SupportedPositionReadPort } from '@clmm/application';
import { makeWalletId } from '@clmm/domain';

export function runPositionReadPortContract(
  factory: () => SupportedPositionReadPort,
): void {
  describe('SupportedPositionReadPort contract', () => {
    it('returns an array from listSupportedPositions (may be empty)', async () => {
      const port = factory();
      const result = await port.listSupportedPositions(makeWalletId('test-wallet'));
      expect(Array.isArray(result)).toBe(true);
    });

    it('positions have positionId, bounds, rangeState', async () => {
      const port = factory();
      const positions = await port.listSupportedPositions(makeWalletId('test-wallet'));
      for (const pos of positions) {
        expect(pos.positionId).toBeTruthy();
        expect(pos.bounds.lowerBound).toBeDefined();
        expect(pos.bounds.upperBound).toBeDefined();
        expect(['in-range', 'below-range', 'above-range']).toContain(pos.rangeState.kind);
      }
    });

    it('adapter does not decide breach direction — rangeState is structural, not policy', async () => {
      const port = factory();
      const positions = await port.listSupportedPositions(makeWalletId('test-wallet'));
      for (const pos of positions) {
        expect(['in-range', 'below-range', 'above-range']).toContain(pos.rangeState.kind);
      }
    });
  });
}

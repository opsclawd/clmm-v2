/**
 * OrcaPositionPrincipalQuoteHelper TDD tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrcaPositionPrincipalQuoteHelper } from './OrcaPositionPrincipalQuoteHelper';

vi.mock('@orca-so/whirlpools-core', () => ({
  decreaseLiquidityQuote: vi.fn(),
}));

describe('OrcaPositionPrincipalQuoteHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('quote', () => {
    it('returns estimated principal amounts for full liquidity', async () => {
      const { decreaseLiquidityQuote } = await import('@orca-so/whirlpools-core');

      vi.mocked(decreaseLiquidityQuote).mockReturnValue({
        liquidityDelta: 100000n,
        tokenEstA: 50000n,
        tokenEstB: 25000n,
        tokenMinA: 49900n,
        tokenMinB: 24950n,
      } as never);

      const helper = new OrcaPositionPrincipalQuoteHelper();
      const result = helper.quote({
        liquidity: 100000n,
        sqrtPrice: 184467440737095516n,
        tickLowerIndex: -18304,
        tickUpperIndex: -17956,
      });

      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') throw new Error('expected ok');
      expect(result.amountA).toBe(50000n);
      expect(result.amountB).toBe(25000n);
      expect(decreaseLiquidityQuote).toHaveBeenCalledWith(
        100000n,
        0,
        184467440737095516n,
        -18304,
        -17956,
      );
    });

    it('preserves successful zero principal amounts', async () => {
      const { decreaseLiquidityQuote } = await import('@orca-so/whirlpools-core');

      vi.mocked(decreaseLiquidityQuote).mockReturnValue({
        liquidityDelta: 0n,
        tokenEstA: 0n,
        tokenEstB: 0n,
        tokenMinA: 0n,
        tokenMinB: 0n,
      } as never);

      const helper = new OrcaPositionPrincipalQuoteHelper();
      const result = helper.quote({
        liquidity: 0n,
        sqrtPrice: 184467440737095516n,
        tickLowerIndex: -18304,
        tickUpperIndex: -17956,
      });

      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') throw new Error('expected ok');
      expect(result.amountA).toBe(0n);
      expect(result.amountB).toBe(0n);
    });

    it('rejects invalid principal quote inputs before calling Orca', async () => {
      const { decreaseLiquidityQuote } = await import('@orca-so/whirlpools-core');

      const helper = new OrcaPositionPrincipalQuoteHelper();

      const negativeLiquidityResult = helper.quote({
        liquidity: -1n,
        sqrtPrice: 184467440737095516n,
        tickLowerIndex: -18304,
        tickUpperIndex: -17956,
      });
      expect(negativeLiquidityResult.kind).toBe('unavailable');
      if (negativeLiquidityResult.kind !== 'unavailable') throw new Error('expected unavailable');
      expect(negativeLiquidityResult.reason).toBe('quote-input-invalid');
      expect(decreaseLiquidityQuote).not.toHaveBeenCalled();

      const reversedBoundsResult = helper.quote({
        liquidity: 100000n,
        sqrtPrice: 184467440737095516n,
        tickLowerIndex: -17956,
        tickUpperIndex: -18304,
      });
      expect(reversedBoundsResult.kind).toBe('unavailable');
      if (reversedBoundsResult.kind !== 'unavailable') throw new Error('expected unavailable');
      expect(reversedBoundsResult.reason).toBe('quote-input-invalid');
      expect(decreaseLiquidityQuote).not.toHaveBeenCalled();

      const equalBoundsResult = helper.quote({
        liquidity: 100000n,
        sqrtPrice: 184467440737095516n,
        tickLowerIndex: -18304,
        tickUpperIndex: -18304,
      });
      expect(equalBoundsResult.kind).toBe('unavailable');
      if (equalBoundsResult.kind !== 'unavailable') throw new Error('expected unavailable');
      expect(equalBoundsResult.reason).toBe('quote-input-invalid');
      expect(decreaseLiquidityQuote).not.toHaveBeenCalled();
    });

    it('sanitizes a thrown principal quote failure', async () => {
      const { decreaseLiquidityQuote } = await import('@orca-so/whirlpools-core');

      vi.mocked(decreaseLiquidityQuote).mockImplementation(() => {
        throw new Error('wasm overflow');
      });

      const helper = new OrcaPositionPrincipalQuoteHelper();
      const result = helper.quote({
        liquidity: 100000n,
        sqrtPrice: 184467440737095516n,
        tickLowerIndex: -18304,
        tickUpperIndex: -17956,
      });

      expect(result.kind).toBe('unavailable');
      if (result.kind !== 'unavailable') throw new Error('expected unavailable');
      expect(result.reason).toBe('principal-quote-failed');
      expect(result.errorName).toBe('Error');
      expect(result.errorMessage).toBe('wasm overflow');
    });

    it('truncates error message to 200 characters', async () => {
      const { decreaseLiquidityQuote } = await import('@orca-so/whirlpools-core');

      const longMessage = 'x'.repeat(300);
      vi.mocked(decreaseLiquidityQuote).mockImplementation(() => {
        throw new Error(longMessage);
      });

      const helper = new OrcaPositionPrincipalQuoteHelper();
      const result = helper.quote({
        liquidity: 100000n,
        sqrtPrice: 184467440737095516n,
        tickLowerIndex: -18304,
        tickUpperIndex: -17956,
      });

      expect(result.kind).toBe('unavailable');
      if (result.kind !== 'unavailable') throw new Error('expected unavailable');
      expect(result.errorMessage!.length).toBe(200);
      expect(result.errorMessage).toBe('x'.repeat(200));
    });

    it('handles non-Error thrown values', async () => {
      const { decreaseLiquidityQuote } = await import('@orca-so/whirlpools-core');

      vi.mocked(decreaseLiquidityQuote).mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw 'string error';
      });

      const helper = new OrcaPositionPrincipalQuoteHelper();
      const result = helper.quote({
        liquidity: 100000n,
        sqrtPrice: 184467440737095516n,
        tickLowerIndex: -18304,
        tickUpperIndex: -17956,
      });

      expect(result.kind).toBe('unavailable');
      if (result.kind !== 'unavailable') throw new Error('expected unavailable');
      expect(result.reason).toBe('principal-quote-failed');
      expect(result.errorMessage).toBe('string error');
    });
  });
});

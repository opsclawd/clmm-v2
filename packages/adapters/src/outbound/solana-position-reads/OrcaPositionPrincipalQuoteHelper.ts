/**
 * OrcaPositionPrincipalQuoteHelper
 *
 * Computes estimated principal amounts for full liquidity removal from an Orca
 * position using the Whirlpools SDK direct quote path. Returns a discriminated
 * `PrincipalTokenAmountsQuoteResult` union; the caller decides what to log and
 * how to surface unavailability.
 *
 * Docs: @orca-so/whirlpools-core v3.1.0
 */
import { decreaseLiquidityQuote } from '@orca-so/whirlpools-core';

export type PrincipalTokenAmountsQuoteResult =
  | { kind: 'ok'; amountA: bigint; amountB: bigint }
  | {
      kind: 'unavailable';
      reason: 'quote-input-invalid' | 'principal-quote-failed';
      errorName?: string;
      errorMessage?: string;
    };

export type PrincipalQuoteArgs = {
  liquidity: bigint;
  sqrtPrice: bigint;
  tickLowerIndex: number;
  tickUpperIndex: number;
};

const ERROR_MESSAGE_MAX_LENGTH = 200;

function describeError(err: unknown): { errorName?: string; errorMessage?: string } {
  if (err instanceof Error) {
    return {
      errorName: err.name,
      errorMessage: err.message.slice(0, ERROR_MESSAGE_MAX_LENGTH),
    };
  }
  return { errorMessage: String(err).slice(0, ERROR_MESSAGE_MAX_LENGTH) };
}

export class OrcaPositionPrincipalQuoteHelper {
  quote(args: PrincipalQuoteArgs): PrincipalTokenAmountsQuoteResult {
    if (args.liquidity < 0n || args.tickLowerIndex >= args.tickUpperIndex) {
      return { kind: 'unavailable', reason: 'quote-input-invalid' };
    }
    try {
      const quote = decreaseLiquidityQuote(
        args.liquidity,
        0,
        args.sqrtPrice,
        args.tickLowerIndex,
        args.tickUpperIndex,
      );
      return { kind: 'ok', amountA: quote.tokenEstA, amountB: quote.tokenEstB };
    } catch (error) {
      return { kind: 'unavailable', reason: 'principal-quote-failed', ...describeError(error) };
    }
  }
}

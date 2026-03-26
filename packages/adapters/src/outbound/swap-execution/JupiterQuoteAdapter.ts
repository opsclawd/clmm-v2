/**
 * JupiterQuoteAdapter
 *
 * Fetches a swap quote from Jupiter API v6 REST.
 * The swap instruction comes FROM the domain (DirectionalExitPolicyService).
 * This adapter MUST NOT rewrite fromAsset/toAsset — it preserves whatever the domain provided.
 *
 * ⚠️ Use solana-adapter-docs skill before editing — Jupiter v6 endpoint params change frequently
 */
import type { SwapQuotePort } from '@clmm/application';
import type { SwapInstruction, TokenAmount, ClockTimestamp } from '@clmm/domain';
import { makeTokenAmount, makeClockTimestamp } from '@clmm/domain';

const JUPITER_API_BASE = 'https://quote-api.jup.ag/v6';

const TOKEN_MINTS: Record<string, string> = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};

export class JupiterQuoteAdapter implements SwapQuotePort {
  async getQuote(instruction: SwapInstruction): Promise<{
    estimatedOutputAmount: TokenAmount;
    priceImpactPercent: number;
    routeLabel: string;
    quotedAt: ClockTimestamp;
  }> {
    const inputMint = TOKEN_MINTS[instruction.fromAsset];
    const outputMint = TOKEN_MINTS[instruction.toAsset];

    if (!inputMint || !outputMint) {
      throw new Error(
        `JupiterQuoteAdapter: unsupported asset pair ${instruction.fromAsset}→${instruction.toAsset}`,
      );
    }

    throw new Error('JupiterQuoteAdapter.getQuote: invoke solana-adapter-docs skill first for current v6 API params');
  }
}

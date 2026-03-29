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

    const amount = instruction.amountBasis?.raw.toString() ?? '1000000';
    const slippageBps = '50';

    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount,
      slippageBps,
    });

    const url = `${JUPITER_API_BASE}/quote?${params.toString()}`;
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`JupiterQuoteAdapter: Jupiter API error ${res.status}`);
    }

    // boundary: Jupiter v6 REST /quote response is untyped JSON
    const data = (await res.json()) as {
      outAmount: string;
      priceImpactPct?: string;
      routePlan?: Array<{ swapInfo?: { label?: string } }>;
    };

    const decimals = instruction.toAsset === 'SOL' ? 9 : instruction.toAsset === 'USDC' ? 6 : 9;
    const estimatedOutputAmount = makeTokenAmount(
      BigInt(data.outAmount),
      decimals,
      instruction.toAsset,
    );

    const routeLabel = data.routePlan?.[0]?.swapInfo?.label ?? 'unknown';

    return {
      estimatedOutputAmount,
      priceImpactPercent: parseFloat(data.priceImpactPct ?? '0'),
      routeLabel,
      quotedAt: makeClockTimestamp(Date.now()),
    };
  }
}

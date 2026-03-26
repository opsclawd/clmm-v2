import type { SwapQuotePort } from '@clmm/application';
import type { SwapInstruction, TokenAmount, ClockTimestamp } from '@clmm/domain';
import { makeTokenAmount, makeClockTimestamp } from '@clmm/domain';

export class FakeSwapQuotePort implements SwapQuotePort {
  private _shouldFail = false;

  failNext(): void {
    this._shouldFail = true;
  }

  async getQuote(instruction: SwapInstruction): Promise<{
    estimatedOutputAmount: TokenAmount;
    priceImpactPercent: number;
    routeLabel: string;
    quotedAt: ClockTimestamp;
  }> {
    if (this._shouldFail) {
      this._shouldFail = false;
      throw new Error('FakeSwapQuotePort: simulated failure');
    }
    return {
      estimatedOutputAmount: makeTokenAmount(BigInt(1_000_000), 6, instruction.toAsset),
      priceImpactPercent: 0.1,
      routeLabel: 'fake-route',
      quotedAt: makeClockTimestamp(Date.now()),
    };
  }
}

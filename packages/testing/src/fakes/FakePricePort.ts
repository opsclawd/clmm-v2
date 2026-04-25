import type { PricePort } from '@clmm/application';
import type { PriceQuote } from '@clmm/domain';

export class FakePricePort implements PricePort {
  constructor(private readonly quotes: PriceQuote[] = []) {}

  async getPrices(tokenMints: readonly string[]): Promise<readonly PriceQuote[]> {
    return this.quotes.filter((q) => tokenMints.includes(q.tokenMint));
  }
}
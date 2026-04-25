import type { PricePort } from '@clmm/application';
import type { PriceQuote } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';
import { KNOWN_TOKENS } from './known-tokens.js';

const JUPITER_PRICE_API_BASE = 'https://price-api.jup.ag/v6/price';

type CacheEntry = {
  price: number;
  symbol: string;
  fetchedAt: number;
};

export class JupiterPriceAdapter implements PricePort {
  private readonly apiKey: string | undefined;
  private readonly cacheTtlMs: number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(params?: { apiKey?: string; cacheTtlMs?: number }) {
    this.apiKey =
      params?.apiKey ??
      (process.env as Record<string, string | undefined>)['JUPITER_API_KEY'];
    this.cacheTtlMs = params?.cacheTtlMs ?? 30_000;
  }

  async getPrices(tokenMints: readonly string[]): Promise<readonly PriceQuote[]> {
    if (tokenMints.length === 0) return [];

    const now = Date.now();
    const uncached = tokenMints.filter((mint) => {
      const entry = this.cache.get(mint);
      return !entry || now - entry.fetchedAt >= this.cacheTtlMs;
    });

    if (uncached.length > 0) {
      const ids = uncached.join(',');
      const url = `${JUPITER_PRICE_API_BASE}?ids=${ids}`;
      const headers: Record<string, string> = {};
      if (this.apiKey) headers['x-api-key'] = this.apiKey;

      const res = await fetch(url, { headers });

      if (!res.ok) {
        throw new Error(
          `JupiterPriceAdapter: price API error ${res.status}`,
        );
      }

      const body = (await res.json()) as {
        data: Record<
          string,
          { id: string; symbol: string; price: number }
        >;
      };

      for (const mint of uncached) {
        const item = body.data?.[mint];
        const known = KNOWN_TOKENS[mint];
        this.cache.set(mint, {
          price: item?.price ?? 0,
          symbol: item?.symbol ?? known?.symbol ?? 'UNKNOWN',
          fetchedAt: now,
        });
      }
    }

    const quotedAt = makeClockTimestamp(Date.now());
    return tokenMints.map((mint) => {
      const entry = this.cache.get(mint)!;
      return {
        tokenMint: mint,
        usdValue: entry.price,
        symbol: entry.symbol,
        quotedAt,
      };
    });
  }
}
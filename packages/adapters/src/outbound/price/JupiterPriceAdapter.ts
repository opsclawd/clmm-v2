import type { PricePort } from '@clmm/application';
import type { PriceQuote } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';
import { KNOWN_TOKENS } from './known-tokens.js';

const JUPITER_PRICE_API_BASE = 'https://api.jup.ag/price/v3';
const JUPITER_BATCH_SIZE = 50; // max tokens per request per Jupiter docs

type CachedPrice = {
  price: number;
  symbol: string;
  fetchedAt: number;
};

export class JupiterPriceAdapter implements PricePort {
  private readonly apiKey: string | undefined;
  private readonly cacheTtlMs: number;
  private readonly cache = new Map<string, CachedPrice>();

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
      await this.fetchBatched(uncached);
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

  private async fetchBatched(uncached: readonly string[]): Promise<void> {
    const now = Date.now();

    for (let i = 0; i < uncached.length; i += JUPITER_BATCH_SIZE) {
      const batch = uncached.slice(i, i + JUPITER_BATCH_SIZE);
      const ids = batch.join(',');
      const url = `${JUPITER_PRICE_API_BASE}?ids=${ids}`;
      const headers: Record<string, string> = {};
      if (this.apiKey) headers['x-api-key'] = this.apiKey;

      const res = await fetch(url, { headers });
      if (!res.ok) {
        throw new Error(`JupiterPriceAdapter: price API error ${res.status}`);
      }

      const body = (await res.json()) as Record<
        string,
        { usdPrice?: number; decimals?: number; symbol?: string } | undefined
      >;

      for (const mint of batch) {
        const data = body[mint];
        const known = KNOWN_TOKENS[mint];
        this.cache.set(mint, {
          price: data?.usdPrice ?? 0,
          symbol: known?.symbol ?? data?.symbol ?? 'UNKNOWN',
          fetchedAt: now,
        });
      }
    }
  }
}
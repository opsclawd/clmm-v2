import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JupiterPriceAdapter } from './JupiterPriceAdapter.js';
import { SOL_MINT, USDC_MINT } from './known-tokens.js';

const originalFetch = globalThis.fetch;

function mockFetch(fn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = fn as typeof fetch;
}

function jsonRes(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('JupiterPriceAdapter', () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches prices for known token mints', async () => {
    const fetchSpy = vi.fn(() =>
      jsonRes({
        data: {
          [SOL_MINT]: { id: SOL_MINT, symbol: 'SOL', price: 150.5 },
          [USDC_MINT]: { id: USDC_MINT, symbol: 'USDC', price: 1.0 },
        },
      }),
    );
    mockFetch(fetchSpy);

    const adapter = new JupiterPriceAdapter({ apiKey: 'test-key' });
    const quotes = await adapter.getPrices([SOL_MINT, USDC_MINT]);

    expect(quotes).toHaveLength(2);
    expect(quotes[0]!.usdValue).toBe(150.5);
    expect(quotes[0]!.symbol).toBe('SOL');
    expect(quotes[1]!.usdValue).toBe(1.0);
    expect(quotes[1]!.symbol).toBe('USDC');
    expect(quotes[0]!.quotedAt).toBeTypeOf('number');

    expect(fetchSpy).toHaveBeenCalledOnce();
    const calledUrl = (fetchSpy.mock.calls[0] as unknown[])[0] as string;
    expect(calledUrl).toContain('price-api.jup.ag/v6/price');
    expect(calledUrl).toContain(SOL_MINT);
    expect(calledUrl).toContain(USDC_MINT);
  });

  it('uses cache on second call within TTL', async () => {
    const fetchSpy = vi.fn(() =>
      jsonRes({
        data: {
          [SOL_MINT]: { id: SOL_MINT, symbol: 'SOL', price: 150.5 },
        },
      }),
    );
    mockFetch(fetchSpy);

    const adapter = new JupiterPriceAdapter({ cacheTtlMs: 60_000 });
    await adapter.getPrices([SOL_MINT]);
    await adapter.getPrices([SOL_MINT]);

    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('throws when API returns non-OK response', async () => {
    mockFetch(() => jsonRes({}, 429));

    const adapter = new JupiterPriceAdapter();
    await expect(adapter.getPrices([SOL_MINT])).rejects.toThrow(
      'price API error 429',
    );
  });

  it('throws on 5xx responses', async () => {
    mockFetch(() => jsonRes({}, 503));

    const adapter = new JupiterPriceAdapter();
    await expect(adapter.getPrices([SOL_MINT])).rejects.toThrow(
      'price API error 503',
    );
  });

  it('fetches only uncached mints on partial cache miss', async () => {
    const fetchSpy = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => {
      if (fetchSpy.mock.calls.length === 1) {
        return jsonRes({
          data: {
            [SOL_MINT]: { id: SOL_MINT, symbol: 'SOL', price: 150.5 },
          },
        });
      }
      return jsonRes({
        data: {
          [USDC_MINT]: { id: USDC_MINT, symbol: 'USDC', price: 1.0 },
        },
      });
    });
    mockFetch(fetchSpy);

    const adapter = new JupiterPriceAdapter({ cacheTtlMs: 60_000 });
    await adapter.getPrices([SOL_MINT]);

    const quotes = await adapter.getPrices([SOL_MINT, USDC_MINT]);
    expect(quotes).toHaveLength(2);
    expect(quotes[0]!.usdValue).toBe(150.5);
    expect(quotes[1]!.usdValue).toBe(1.0);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const secondUrl = fetchSpy.mock.calls[1]![0] as string;
    expect(secondUrl).toContain(USDC_MINT);
    expect(secondUrl).not.toContain(SOL_MINT);
  });

  it('sends x-api-key header when apiKey is provided', async () => {
    const fetchSpy = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => {
      return jsonRes({
        data: {
          [SOL_MINT]: { id: SOL_MINT, symbol: 'SOL', price: 150.5 },
        },
      });
    });
    mockFetch(fetchSpy);

    const adapter = new JupiterPriceAdapter({ apiKey: 'test-key' });
    await adapter.getPrices([SOL_MINT]);

    const init = fetchSpy.mock.calls[0]![1];
    expect((init?.headers as Record<string, string>)['x-api-key']).toBe('test-key');
  });

  it('returns empty array for empty input', async () => {
    const adapter = new JupiterPriceAdapter();
    const quotes = await adapter.getPrices([]);
    expect(quotes).toEqual([]);
  });
});
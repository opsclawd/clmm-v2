import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JupiterQuoteAdapter } from './JupiterQuoteAdapter.js';
import { makeTokenAmount } from '@clmm/domain';
import type { SwapInstruction } from '@clmm/domain';

const JUPITER_QUOTE_RESPONSE = {
  inputMint: 'So11111111111111111111111111111111111111112',
  inAmount: '1000000',
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  outAmount: '995000',
  otherAmountThreshold: '990000',
  swapMode: 'ExactIn',
  slippageBps: 50,
  platformFee: null,
  priceImpactPct: '0.1',
  routePlan: [
    {
      swapInfo: {
        ammKey: 'SomeAMMKey',
        label: 'Meteora DLMM',
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        inAmount: '1000000',
        outAmount: '995000',
        feeAmount: null,
        feeMint: null,
      },
      percent: 100,
      bps: null,
    },
  ],
  contextSlot: 123456789,
  timeTaken: 0.5,
};

describe('JupiterQuoteAdapter', () => {
  let adapter: JupiterQuoteAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new JupiterQuoteAdapter();
  });

  it('fetches quote from Jupiter API v6 and returns domain types', async () => {
    const instruction: SwapInstruction = {
      fromAsset: 'SOL',
      toAsset: 'USDC',
      policyReason: 'Exit SOL to USDC on lower-bound breach',
      amountBasis: makeTokenAmount(BigInt(1000000), 9, 'SOL'),
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => JUPITER_QUOTE_RESPONSE,
    } as Response);

    const result = await adapter.getQuote(instruction);

    expect(result.estimatedOutputAmount.raw).toBe(BigInt(995000));
    expect(result.estimatedOutputAmount.decimals).toBe(6);
    expect(result.estimatedOutputAmount.symbol).toBe('USDC');
    expect(result.priceImpactPercent).toBe(0.1);
    expect(result.routeLabel).toBe('Meteora DLMM');
    expect(result.quotedAt).toBeDefined();
  });

  it('calls Jupiter with correct inputMint and outputMint for SOL->USDC', async () => {
    const instruction: SwapInstruction = {
      fromAsset: 'SOL',
      toAsset: 'USDC',
      policyReason: 'Exit SOL to USDC',
      amountBasis: makeTokenAmount(BigInt(1000000), 9, 'SOL'),
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => JUPITER_QUOTE_RESPONSE,
    } as Response);

    await adapter.getQuote(instruction);

    const fetchCalls = vi.mocked(global.fetch).mock.calls;
    expect(fetchCalls.length).toBeGreaterThan(0);
    const url = new URL(fetchCalls[0]![0] as string);
    expect(url.searchParams.get('inputMint')).toBe('So11111111111111111111111111111111111111112');
    expect(url.searchParams.get('outputMint')).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(url.searchParams.get('amount')).toBe('1000000');
    expect(url.searchParams.get('slippageBps')).toBe('50');
  });

  it('calls Jupiter with correct inputMint and outputMint for USDC->SOL', async () => {
    const instruction: SwapInstruction = {
      fromAsset: 'USDC',
      toAsset: 'SOL',
      policyReason: 'Exit USDC to SOL on upper-bound breach',
      amountBasis: makeTokenAmount(BigInt(1000000), 6, 'USDC'),
    };

    const reversedResponse = {
      ...JUPITER_QUOTE_RESPONSE,
      inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      outputMint: 'So11111111111111111111111111111111111111112',
      inAmount: '1000000',
      outAmount: '995000',
      routePlan: [
        {
          swapInfo: {
            ...JUPITER_QUOTE_RESPONSE.routePlan[0]!.swapInfo,
            inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            outputMint: 'So11111111111111111111111111111111111111112',
            label: 'Orca Whirlpool',
          },
          percent: 100,
          bps: null,
        },
      ],
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => reversedResponse,
    } as Response);

    await adapter.getQuote(instruction);

    const fetchCalls = vi.mocked(global.fetch).mock.calls;
    expect(fetchCalls.length).toBeGreaterThan(0);
    const url = new URL(fetchCalls[0]![0] as string);
    expect(url.searchParams.get('inputMint')).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(url.searchParams.get('outputMint')).toBe('So11111111111111111111111111111111111111112');
  });

  it('throws error for unsupported asset pair', async () => {
    const instruction: SwapInstruction = {
      fromAsset: 'SOL',
      // boundary: intentionally invalid value to test error path
      toAsset: 'UNSUPPORTED' as unknown as SwapInstruction['toAsset'],
      policyReason: 'Test',
    };

    await expect(adapter.getQuote(instruction)).rejects.toThrow(
      'JupiterQuoteAdapter: unsupported asset pair SOL→UNSUPPORTED',
    );
  });

  it('throws error when Jupiter API returns non-OK response', async () => {
    const instruction: SwapInstruction = {
      fromAsset: 'SOL',
      toAsset: 'USDC',
      policyReason: 'Test',
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Invalid input' }),
    } as Response);

    await expect(adapter.getQuote(instruction)).rejects.toThrow();
  });

  it('uses default amount when amountBasis is not provided', async () => {
    const instruction: SwapInstruction = {
      fromAsset: 'SOL',
      toAsset: 'USDC',
      policyReason: 'Test',
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => JUPITER_QUOTE_RESPONSE,
    } as Response);

    await adapter.getQuote(instruction);

    const fetchCalls = vi.mocked(global.fetch).mock.calls;
    expect(fetchCalls.length).toBeGreaterThan(0);
    const url = new URL(fetchCalls[0]![0] as string);
    expect(url.searchParams.get('amount')).toBe('1000000');
  });
});

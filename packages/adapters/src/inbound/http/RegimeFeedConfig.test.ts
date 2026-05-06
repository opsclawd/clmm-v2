import { describe, it, expect } from 'vitest';
import { resolveRegimeFeedConfig } from './RegimeFeedConfig.js';

describe('resolveRegimeFeedConfig', () => {
  it('returns kind:"ok" when every required env var is present', () => {
    const result = resolveRegimeFeedConfig(
      {
        REGIME_ENGINE_SOURCE: 'geckoterminal',
        REGIME_ENGINE_NETWORK: 'solana',
        REGIME_ENGINE_POOL_ADDRESS: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
        REGIME_ENGINE_TIMEFRAME: '1h',
      },
      'SOL/USDC',
    );

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.config).toEqual({
      symbol: 'SOL/USDC',
      source: 'geckoterminal',
      network: 'solana',
      poolAddress: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
      timeframe: '1h',
    });
  });

  it('returns kind:"missing" listing every missing var', () => {
    const result = resolveRegimeFeedConfig({}, 'SOL/USDC');
    expect(result.kind).toBe('missing');
    if (result.kind !== 'missing') return;
    expect(result.missing.sort()).toEqual(
      [
        'REGIME_ENGINE_NETWORK',
        'REGIME_ENGINE_POOL_ADDRESS',
        'REGIME_ENGINE_SOURCE',
        'REGIME_ENGINE_TIMEFRAME',
      ].sort(),
    );
  });

  it('treats empty strings as missing', () => {
    const result = resolveRegimeFeedConfig(
      {
        REGIME_ENGINE_SOURCE: '',
        REGIME_ENGINE_NETWORK: 'solana',
        REGIME_ENGINE_POOL_ADDRESS: 'pool',
        REGIME_ENGINE_TIMEFRAME: '1h',
      },
      'SOL/USDC',
    );
    expect(result.kind).toBe('missing');
    if (result.kind !== 'missing') return;
    expect(result.missing).toEqual(['REGIME_ENGINE_SOURCE']);
  });
});

import { Controller, Get, Inject, NotFoundException, Param } from '@nestjs/common';
import type { RegimeReadPort, RegimeReadResult } from '@clmm/application';
import type { RegimePoolEntry } from './RegimeFeedConfig.js';
import { resolveRegimeFeedConfig } from './RegimeFeedConfig.js';
import { REGIME_READ_PORT, REGIME_POOL_ALLOWLIST } from './tokens.js';

@Controller('regime')
export class RegimeController {
  constructor(
    @Inject(REGIME_READ_PORT)
    private readonly regimePort: RegimeReadPort,
    @Inject(REGIME_POOL_ALLOWLIST)
    private readonly regimeAllowlist: Map<string, RegimePoolEntry>,
  ) {}

  @Get('pools/:poolId/current')
  async getCurrent(@Param('poolId') poolId: string) {
    const entry = this.regimeAllowlist.get(poolId);
    if (!entry) {
      throw new NotFoundException(`Pool not supported: ${poolId}`);
    }

    const feedConfig = resolveRegimeFeedConfig(
      process.env as Record<string, string | undefined>,
      entry.symbol,
    );
    if (feedConfig.kind === 'missing') {
      return { regime: null, unavailableReason: 'config-error' };
    }

    const result = await this.regimePort.fetchCurrent({
      symbol: feedConfig.config.symbol,
      source: feedConfig.config.source,
      network: feedConfig.config.network,
      poolAddress: feedConfig.config.poolAddress,
      timeframe: feedConfig.config.timeframe,
    });

    return this.mapResult(result);
  }

  private mapResult(result: RegimeReadResult) {
    switch (result.kind) {
      case 'block':
        return { regime: result.block };
      case 'not-found':
        return { regime: null, unavailableReason: 'not-found' };
      case 'config-error':
        return { regime: null, unavailableReason: 'config-error' };
      case 'upstream-error':
        return { regime: null, unavailableReason: 'upstream-error' };
    }
  }
}

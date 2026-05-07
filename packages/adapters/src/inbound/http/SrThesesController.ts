import { Controller, Get, Inject, NotFoundException, Param } from '@nestjs/common';
import type { SrThesesReadPort, SrThesesReadResult } from '@clmm/application';
import { SR_THESES_READ_PORT, SR_THESES_POOL_ALLOWLIST } from './tokens.js';

@Controller('sr-theses')
export class SrThesesController {
  constructor(
    @Inject(SR_THESES_READ_PORT)
    private readonly srThesesPort: SrThesesReadPort,
    @Inject(SR_THESES_POOL_ALLOWLIST)
    private readonly srThesesAllowlist: Map<string, { symbol: string; source: string }>,
  ) {}

  @Get('pools/:poolId/current')
  async getCurrent(@Param('poolId') poolId: string) {
    const entry = this.srThesesAllowlist.get(poolId);
    if (!entry) {
      throw new NotFoundException(`Pool not supported: ${poolId}`);
    }
    const result = await this.srThesesPort.fetchCurrent(entry.symbol, entry.source);
    return this.mapResult(result);
  }

  private mapResult(result: SrThesesReadResult) {
    switch (result.kind) {
      case 'block':
        return { srTheses: result.block };
      case 'not-found':
        return { srTheses: null, unavailableReason: 'not-found' as const };
      case 'config-error':
        return { srTheses: null, unavailableReason: 'config-error' as const };
      case 'upstream-error':
        return { srTheses: null, unavailableReason: 'upstream-error' as const };
    }
  }
}

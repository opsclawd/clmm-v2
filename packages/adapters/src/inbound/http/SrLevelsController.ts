import { Controller, Get, Inject, NotFoundException, Param } from '@nestjs/common';
import type { CurrentSrLevelsPort } from '../../outbound/regime-engine/types.js';
import { CURRENT_SR_LEVELS_PORT, SR_LEVELS_POOL_ALLOWLIST } from './tokens.js';

@Controller('sr-levels')
export class SrLevelsController {
  constructor(
    @Inject(CURRENT_SR_LEVELS_PORT)
    private readonly srLevelsPort: CurrentSrLevelsPort,
    @Inject(SR_LEVELS_POOL_ALLOWLIST)
    private readonly srLevelsAllowlist: Map<string, { symbol: string; source: string }>,
  ) {}

  @Get('pools/:poolId/current')
  async getCurrent(@Param('poolId') poolId: string) {
    const entry = this.srLevelsAllowlist.get(poolId);
    if (!entry) {
      throw new NotFoundException(`Pool not supported: ${poolId}`);
    }

    const srLevels = await this.srLevelsPort.fetchCurrent(entry.symbol, entry.source);
    return { srLevels };
  }
}
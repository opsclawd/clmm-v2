import { Controller, Get, Inject, Param, NotFoundException } from '@nestjs/common';
import type {
  EvidenceReadPort,
  EvidenceReadResult,
  SupportedPositionReadPort,
} from '@clmm/application';
import { makeWalletId, makePositionId } from '@clmm/domain';
import { EVIDENCE_READ_PORT, SUPPORTED_POSITION_READ_PORT } from './tokens.js';

@Controller('evidence')
export class EvidenceController {
  constructor(
    @Inject(EVIDENCE_READ_PORT)
    private readonly evidencePort: EvidenceReadPort,
    @Inject(SUPPORTED_POSITION_READ_PORT)
    private readonly positionReadPort: SupportedPositionReadPort,
  ) {}

  @Get('sol-usdc/current')
  async getCurrent() {
    const result = await this.evidencePort.fetchCurrent();
    return this.mapResult(result);
  }

  @Get('sol-usdc/:walletId/:positionId/current')
  async getCurrentForPosition(
    @Param('walletId') walletId: string,
    @Param('positionId') positionId: string,
  ) {
    const position = await this.positionReadPort.getPosition(
      makeWalletId(walletId),
      makePositionId(positionId),
    );
    if (!position) {
      throw new NotFoundException(`Position not found: ${positionId}`);
    }

    const result = await this.evidencePort.fetchCurrent({
      walletAddress: walletId,
      whirlpoolAddress: position.poolId,
      positionId,
    });
    return this.mapResult(result);
  }

  private mapResult(result: EvidenceReadResult) {
    switch (result.kind) {
      case 'block':
        return { evidence: result.block };
      case 'not-found':
        return { evidence: null, unavailableReason: 'not-found' as const };
      case 'store-unavailable':
        return { evidence: null, unavailableReason: 'store-unavailable' as const };
      case 'config-error':
        return { evidence: null, unavailableReason: 'config-error' as const };
      case 'malformed':
        return { evidence: null, unavailableReason: 'malformed' as const };
      case 'upstream-error':
        return { evidence: null, unavailableReason: 'upstream-error' as const };
    }
  }
}

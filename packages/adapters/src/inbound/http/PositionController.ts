import { Controller, Get, Param, Inject } from '@nestjs/common';
import type { SupportedPositionReadPort, PositionSummaryDto } from '@clmm/application';
import { listSupportedPositions } from '@clmm/application';
import type { LiquidityPosition } from '@clmm/domain';
import { makeWalletId } from '@clmm/domain';
import { SUPPORTED_POSITION_READ_PORT } from './tokens.js';

function toPositionSummaryDto(p: LiquidityPosition): PositionSummaryDto {
  return {
    positionId: p.positionId,
    poolId: p.poolId,
    rangeState: p.rangeState.kind,
    hasActionableTrigger: false,
    monitoringStatus: p.monitoringReadiness.kind,
  };
}

@Controller('positions')
export class PositionController {
  constructor(
    @Inject(SUPPORTED_POSITION_READ_PORT)
    private readonly positionReadPort: SupportedPositionReadPort,
  ) {}

  @Get(':walletId')
  async listPositions(@Param('walletId') walletId: string) {
    const { positions } = await listSupportedPositions({
      walletId: makeWalletId(walletId),
      positionReadPort: this.positionReadPort,
    });
    return { positions: positions.map(toPositionSummaryDto) };
  }
}

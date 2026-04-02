import { Controller, Get, Param, Inject, NotFoundException } from '@nestjs/common';
import type {
  SupportedPositionReadPort,
  TriggerRepository,
  PositionSummaryDto,
  PositionDetailDto,
} from '@clmm/application';
import { listSupportedPositions, getPositionDetail } from '@clmm/application';
import type { LiquidityPosition, ExitTrigger } from '@clmm/domain';
import { makeWalletId, makePositionId } from '@clmm/domain';
import { SUPPORTED_POSITION_READ_PORT, TRIGGER_REPOSITORY } from './tokens.js';
import { isTransientPositionReadFailure } from './transient-errors.js';

function toPositionSummaryDto(p: LiquidityPosition, hasActionableTrigger = false): PositionSummaryDto {
  return {
    positionId: p.positionId,
    poolId: p.poolId,
    rangeState: p.rangeState.kind,
    hasActionableTrigger,
    monitoringStatus: p.monitoringReadiness.kind,
  };
}

function toPositionDetailDto(p: LiquidityPosition, trigger: ExitTrigger | null): PositionDetailDto {
  return {
    ...toPositionSummaryDto(p),
    hasActionableTrigger: trigger !== null,
    lowerBound: p.bounds.lowerBound,
    upperBound: p.bounds.upperBound,
    currentPrice: p.rangeState.currentPrice,
    ...(trigger
      ? {
          triggerId: trigger.triggerId,
          breachDirection: trigger.breachDirection,
        }
      : {}),
  };
}

@Controller('positions')
export class PositionController {
  constructor(
    @Inject(SUPPORTED_POSITION_READ_PORT)
    private readonly positionReadPort: SupportedPositionReadPort,
    @Inject(TRIGGER_REPOSITORY)
    private readonly triggerRepo: TriggerRepository,
  ) {}

  @Get(':walletId/:positionId')
  async getPosition(
    @Param('walletId') walletId: string,
    @Param('positionId') positionId: string,
  ) {
    const wallet = makeWalletId(walletId);
    const result = await getPositionDetail({
      positionId: makePositionId(positionId),
      positionReadPort: this.positionReadPort,
    });

    if (result.kind === 'not-found') {
      throw new NotFoundException(`Position not found: ${positionId}`);
    }

    if (result.position.walletId !== wallet) {
      throw new NotFoundException(`Position not found: ${positionId}`);
    }

    let trigger: import('@clmm/domain').ExitTrigger | null = null;
    let triggerError: string | undefined;

    try {
      const actionableTriggers = await this.triggerRepo.listActionableTriggers(wallet);
      trigger =
        actionableTriggers.find((candidate) => candidate.positionId === result.position.positionId) ?? null;
    } catch (error: unknown) {
      if (!isTransientPositionReadFailure(error)) {
        throw error;
      }
      triggerError = 'Unable to fetch trigger data. Position data temporarily unavailable.';
    }

    return {
      position: toPositionDetailDto(result.position, trigger),
      ...(triggerError ? { error: triggerError } : {}),
    };
  }

  @Get(':walletId')
  async listPositions(@Param('walletId') walletId: string) {
    const wallet = makeWalletId(walletId);

    let positions: LiquidityPosition[];
    try {
      ({ positions } = await listSupportedPositions({
        walletId: wallet,
        positionReadPort: this.positionReadPort,
      }));
    } catch (error: unknown) {
      if (!isTransientPositionReadFailure(error)) {
        throw error;
      }
      return {
        positions: [],
        error: 'Unable to fetch positions. Position data temporarily unavailable.',
      };
    }

    let triggerPositionIds: ReadonlySet<string> = new Set();
    let triggerError: string | undefined;

    try {
      const actionableTriggers = await this.triggerRepo.listActionableTriggers(wallet);
      triggerPositionIds = new Set(actionableTriggers.map((t) => t.positionId));
    } catch (error: unknown) {
      if (!isTransientPositionReadFailure(error)) {
        throw error;
      }
      triggerError = 'Unable to fetch trigger data. Trigger status may be incomplete.';
    }

    return {
      positions: positions.map((p) => toPositionSummaryDto(p, triggerPositionIds.has(p.positionId))),
      ...(triggerError ? { error: triggerError } : {}),
    };
  }
}

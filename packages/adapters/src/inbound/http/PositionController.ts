import { Controller, Get, Param, Inject, NotFoundException } from '@nestjs/common';
import type {
  SupportedPositionReadPort,
  PricePort,
  TriggerRepository,
  PositionSummaryDto,
  PositionDetailDto,
} from '@clmm/application';
import { listSupportedPositions, getPositionDetail } from '@clmm/application';
import type { ExitTrigger } from '@clmm/domain';
import { makeWalletId, makePositionId } from '@clmm/domain';
import { SUPPORTED_POSITION_READ_PORT, TRIGGER_REPOSITORY, PRICE_PORT } from './tokens.js';

import { isTransientPositionReadFailure } from './transient-errors.js';

function toPositionSummaryDto(
  dto: PositionSummaryDto,
  hasActionableTrigger = false,
): PositionSummaryDto {
  return {
    ...dto,
    hasActionableTrigger,
  };
}

function toPositionDetailDto(
  dto: PositionDetailDto,
  trigger: ExitTrigger | null,
): PositionDetailDto {
  return {
    ...dto,
    hasActionableTrigger: trigger !== null,
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
    @Inject(PRICE_PORT)
    private readonly pricePort: PricePort,
  ) {}

  @Get(':walletId/:positionId')
  async getPosition(
    @Param('walletId') walletId: string,
    @Param('positionId') positionId: string,
  ) {
    const wallet = makeWalletId(walletId);
    const result = await getPositionDetail({
      walletId: wallet,
      positionId: makePositionId(positionId),
      positionReadPort: this.positionReadPort,
      pricePort: this.pricePort,
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
      position: toPositionDetailDto(result.detailDto, trigger),
      ...(triggerError ? { error: triggerError } : {}),
    };
  }

  @Get(':walletId')
  async listPositions(@Param('walletId') walletId: string) {
    const wallet = makeWalletId(walletId);

    let summaryDtos: PositionSummaryDto[];
    try {
      const result = await listSupportedPositions({
        walletId: wallet,
        positionReadPort: this.positionReadPort,
      });
      summaryDtos = result.summaryDtos;
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
      positions: summaryDtos.map((dto) => toPositionSummaryDto(dto, triggerPositionIds.has(dto.positionId))),
      ...(triggerError ? { error: triggerError } : {}),
    };
  }
}

import {
  Controller,
  Get,
  Param,
  Inject,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
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

type ListPositionsErrorResponse = {
  positions: [];
  error: string;
};

type ListPositionsSuccessResponse = {
  positions: PositionSummaryDto[];
  warning?: string;
};

type ListPositionsResponse = ListPositionsErrorResponse | ListPositionsSuccessResponse;

type GetPositionDetailResponse = {
  position: PositionDetailDto;
  warning?: string;
};

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
  ): Promise<GetPositionDetailResponse> {
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

    if (result.kind === 'cannot-build-supported-detail-dto') {
      throw new UnprocessableEntityException(
        `Position detail unavailable: missing token metadata for ${positionId}`,
      );
    }

    if (result.position.walletId !== wallet) {
      throw new NotFoundException(`Position not found: ${positionId}`);
    }

    let trigger: import('@clmm/domain').ExitTrigger | null = null;
    let triggerError: string | undefined;

    try {
      const actionableTriggers = await this.triggerRepo.listActionableTriggers(wallet);
      trigger =
        actionableTriggers.find(
          (candidate) => candidate.positionId === result.position.positionId,
        ) ?? null;
    } catch (error: unknown) {
      if (!isTransientPositionReadFailure(error)) {
        throw error;
      }
      triggerError = 'Unable to fetch trigger data. Position data temporarily unavailable.';
    }

    return {
      position: toPositionDetailDto(result.detailDto, trigger),
      ...(triggerError ? { warning: triggerError } : {}),
    };
  }

  @Get(':walletId')
  async listPositions(@Param('walletId') walletId: string): Promise<ListPositionsResponse> {
    const wallet = makeWalletId(walletId);

    let summaryDtos: PositionSummaryDto[];
    let poolMetadataFailures = 0;
    try {
      const result = await listSupportedPositions({
        walletId: wallet,
        positionReadPort: this.positionReadPort,
      });
      summaryDtos = result.summaryDtos;
      poolMetadataFailures = result.poolMetadataFailures;
    } catch (error: unknown) {
      if (!isTransientPositionReadFailure(error)) {
        throw error;
      }
      return {
        positions: [],
        error: 'Unable to fetch positions. Position data temporarily unavailable.',
      };
    }

    if (poolMetadataFailures > 0 && summaryDtos.length === 0) {
      return {
        positions: [],
        error: 'Unable to fetch position data. Pool metadata unavailable.',
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

    const warnings: string[] = [];
    if (triggerError) warnings.push(triggerError);
    if (poolMetadataFailures > 0)
      warnings.push('Some pool data unavailable. Position list may be incomplete.');

    const response: ListPositionsSuccessResponse = {
      positions: summaryDtos.map((dto) =>
        toPositionSummaryDto(dto, triggerPositionIds.has(dto.positionId)),
      ),
    };
    if (warnings.length > 0) response.warning = warnings.join(' ');
    return response;
  }
}

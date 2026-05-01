import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Param,
} from '@nestjs/common';
import {
  getSolUsdcInsightPoolSnapshot,
  getSolUsdcInsightPositions,
  getSolUsdcInsightBundle,
} from '@clmm/application';
import type {
  SupportedPositionReadPort,
  TriggerRepository,
  PricePort,
  SrLevelsReadPort,
  SolUsdcInsightErrorDto,
} from '@clmm/application';
import { makePoolId, makeWalletId } from '@clmm/domain';
import {
  SUPPORTED_POSITION_READ_PORT,
  TRIGGER_REPOSITORY,
  PRICE_PORT,
  SR_LEVELS_READ_PORT,
  SR_LEVELS_POOL_ALLOWLIST,
} from './tokens.js';

type SrLevelsAllowlist = Map<string, { symbol: string; source: string }>;

@Controller('insights/sol-usdc')
export class InsightsDataController {
  private readonly poolIdRaw: string;
  private readonly srLevelsLookup: { symbol: string; source: string };

  constructor(
    @Inject(SUPPORTED_POSITION_READ_PORT)
    private readonly positionReadPort: SupportedPositionReadPort,
    @Inject(TRIGGER_REPOSITORY)
    private readonly triggerRepo: TriggerRepository,
    @Inject(PRICE_PORT)
    private readonly pricePort: PricePort,
    @Inject(SR_LEVELS_READ_PORT)
    private readonly srLevelsReadPort: SrLevelsReadPort,
    @Inject(SR_LEVELS_POOL_ALLOWLIST)
    private readonly srLevelsAllowlist: SrLevelsAllowlist,
    private readonly now: () => number = Date.now,
  ) {
    if (this.srLevelsAllowlist.size !== 1) {
      throw new Error(
        `InsightsDataController expects exactly one allowlist entry, found ${this.srLevelsAllowlist.size}`,
      );
    }
    const [poolIdRaw, lookup] = this.srLevelsAllowlist.entries().next().value as [
      string,
      { symbol: string; source: string },
    ];
    this.poolIdRaw = poolIdRaw;
    this.srLevelsLookup = lookup;
  }

  @Get('pool')
  async getPool() {
    const result = await getSolUsdcInsightPoolSnapshot({
      poolId: makePoolId(this.poolIdRaw),
      positionReadPort: this.positionReadPort,
      now: this.now,
    });
    if (result.kind === 'pool-unavailable') {
      throw this.poolUnavailable();
    }
    return { pool: result.pool };
  }

  @Get('positions/:walletId')
  async getPositions(@Param('walletId') walletIdRaw: string) {
    const result = await getSolUsdcInsightPositions({
      walletId: makeWalletId(walletIdRaw),
      poolId: makePoolId(this.poolIdRaw),
      positionReadPort: this.positionReadPort,
      triggerRepo: this.triggerRepo,
      pricePort: this.pricePort,
      now: this.now,
    });
    if (result.kind === 'pool-unavailable') {
      throw this.poolUnavailable(walletIdRaw);
    }
    if (result.kind === 'position-list-unavailable') {
      throw this.positionListUnavailable(walletIdRaw);
    }
    if (result.kind === 'position-detail-unavailable') {
      throw this.positionDetailUnavailable(walletIdRaw, result.positionId);
    }
    return { snapshot: result.snapshot };
  }

  @Get('bundle/:walletId')
  async getBundle(@Param('walletId') walletIdRaw: string) {
    const result = await getSolUsdcInsightBundle({
      walletId: makeWalletId(walletIdRaw),
      poolId: makePoolId(this.poolIdRaw),
      srLevelsLookup: this.srLevelsLookup,
      positionReadPort: this.positionReadPort,
      triggerRepo: this.triggerRepo,
      pricePort: this.pricePort,
      srLevelsReadPort: this.srLevelsReadPort,
      now: this.now,
    });
    if (result.kind === 'pool-unavailable') {
      throw this.poolUnavailable(walletIdRaw);
    }
    if (result.kind === 'position-list-unavailable') {
      throw this.positionListUnavailable(walletIdRaw);
    }
    if (result.kind === 'position-detail-unavailable') {
      throw this.positionDetailUnavailable(walletIdRaw, result.positionId);
    }
    return { bundle: result.bundle };
  }

  private poolUnavailable(walletIdRaw?: string): HttpException {
    const body: SolUsdcInsightErrorDto = {
      code: 'pool_snapshot_unavailable',
      message: 'Unable to read SOL/USDC pool snapshot.',
      pair: 'SOL/USDC',
      poolId: this.poolIdRaw,
      ...(walletIdRaw !== undefined ? { walletId: walletIdRaw } : {}),
      retryable: true,
    };
    return new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
  }

  private positionListUnavailable(walletIdRaw: string): HttpException {
    const body: SolUsdcInsightErrorDto = {
      code: 'position_list_unavailable',
      message: 'Unable to read SOL/USDC position list.',
      pair: 'SOL/USDC',
      poolId: this.poolIdRaw,
      walletId: walletIdRaw,
      retryable: true,
    };
    return new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
  }

  private positionDetailUnavailable(walletIdRaw: string, positionId: string): HttpException {
    const body: SolUsdcInsightErrorDto = {
      code: 'position_detail_unavailable',
      message: 'Unable to read SOL/USDC position detail.',
      pair: 'SOL/USDC',
      poolId: this.poolIdRaw,
      walletId: walletIdRaw,
      positionId,
      retryable: true,
    };
    return new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
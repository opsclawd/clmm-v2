import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  UseGuards,
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- used via @Inject
  INSIGHTS_API_KEY,
} from './tokens.js';
import { InsightsApiKeyGuard } from './InsightsApiKeyGuard.js';

type SrLevelsAllowlist = Map<string, { symbol: string; source: string }>;

// v1 design: the insights pipeline is single-pool. Multi-pool support
// would require a naming overhaul of SolUsdc* types and routes.
const EXPECTED_ALLOWLIST_SIZE_V1 = 1;

const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

@Controller('insights/sol-usdc')
@UseGuards(InsightsApiKeyGuard)
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
    if (this.srLevelsAllowlist.size !== EXPECTED_ALLOWLIST_SIZE_V1) {
      throw new Error(
        `InsightsDataController expects exactly ${EXPECTED_ALLOWLIST_SIZE_V1} allowlist entry, found ${this.srLevelsAllowlist.size}`,
      );
    }
    const [poolIdRaw, lookup] = this.srLevelsAllowlist.entries().next().value as [
      string,
      { symbol: string; source: string },
    ];
    this.poolIdRaw = poolIdRaw;
    this.srLevelsLookup = lookup;
  }

  private validateWalletId(walletIdRaw: string): string {
    if (!BASE58_REGEX.test(walletIdRaw)) {
      throw new HttpException(
        { code: 'invalid_wallet_id', message: 'walletId must be a valid Solana address.', retryable: false },
        HttpStatus.BAD_REQUEST,
      );
    }
    return walletIdRaw;
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
    this.validateWalletId(walletIdRaw);
    const result = await getSolUsdcInsightPositions({
      walletId: makeWalletId(walletIdRaw),
      poolId: makePoolId(this.poolIdRaw),
      positionReadPort: this.positionReadPort,
      triggerRepo: this.triggerRepo,
      pricePort: this.pricePort,
      now: this.now,
    });
    if (result.kind === 'pool-unavailable') {
      throw this.poolUnavailable();
    }
    if (result.kind === 'position-list-unavailable') {
      throw this.positionListUnavailable();
    }
    if (result.kind === 'position-detail-unavailable') {
      throw this.positionDetailUnavailable(result.positionId);
    }
    return { snapshot: result.snapshot };
  }

  @Get('bundle/:walletId')
  async getBundle(@Param('walletId') walletIdRaw: string) {
    this.validateWalletId(walletIdRaw);
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
      throw this.poolUnavailable();
    }
    if (result.kind === 'position-list-unavailable') {
      throw this.positionListUnavailable();
    }
    if (result.kind === 'position-detail-unavailable') {
      throw this.positionDetailUnavailable(result.positionId);
    }
    return { bundle: result.bundle };
  }

  private poolUnavailable(): HttpException {
    const body: SolUsdcInsightErrorDto = {
      code: 'pool_snapshot_unavailable',
      message: 'Unable to read SOL/USDC pool snapshot.',
      pair: 'SOL/USDC',
      poolId: this.poolIdRaw,
      retryable: true,
    };
    return new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
  }

  private positionListUnavailable(): HttpException {
    const body: SolUsdcInsightErrorDto = {
      code: 'position_list_unavailable',
      message: 'Unable to read SOL/USDC position list.',
      pair: 'SOL/USDC',
      poolId: this.poolIdRaw,
      retryable: true,
    };
    return new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
  }

  private positionDetailUnavailable(positionId: string): HttpException {
    const body: SolUsdcInsightErrorDto = {
      code: 'position_detail_unavailable',
      message: 'Unable to read SOL/USDC position detail.',
      pair: 'SOL/USDC',
      poolId: this.poolIdRaw,
      positionId,
      retryable: true,
    };
    return new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
import { Controller, Post, Param, Inject } from '@nestjs/common';
import type { MonitoredWalletRepository, ClockPort } from '@clmm/application';
import type { WalletId } from '@clmm/domain';
import { MONITORED_WALLET_REPOSITORY, CLOCK_PORT } from './tokens.js';

@Controller('wallets')
export class WalletController {
  constructor(
    @Inject(MONITORED_WALLET_REPOSITORY)
    private readonly monitoredWalletRepo: MonitoredWalletRepository,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
  ) {}

  @Post(':walletId/monitor')
  async enrollForMonitoring(@Param('walletId') walletId: string) {
    const enrolledAt = this.clock.now();
    await this.monitoredWalletRepo.enroll(walletId as WalletId, enrolledAt);
    return { enrolled: true, enrolledAt };
  }
}

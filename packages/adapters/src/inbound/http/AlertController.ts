import { Controller, Get, Param, Post, Inject, NotFoundException } from '@nestjs/common';
import type { TriggerRepository, ActionableAlertDto, SupportedPositionReadPort } from '@clmm/application';
import { listActionableAlerts, acknowledgeAlert } from '@clmm/application';
import type { ExitTrigger, ExitTriggerId } from '@clmm/domain';
import { makeWalletId } from '@clmm/domain';
import { TRIGGER_REPOSITORY, SUPPORTED_POSITION_READ_PORT } from './tokens.js';

function toActionableAlertDto(t: ExitTrigger): ActionableAlertDto {
  return {
    triggerId: t.triggerId,
    positionId: t.positionId,
    breachDirection: t.breachDirection,
    triggeredAt: t.triggeredAt,
  };
}

@Controller('alerts')
export class AlertController {
  constructor(
    @Inject(TRIGGER_REPOSITORY)
    private readonly triggerRepo: TriggerRepository,
    @Inject(SUPPORTED_POSITION_READ_PORT)
    private readonly positionReadPort: SupportedPositionReadPort,
  ) {}

  @Get(':walletId')
  async listAlerts(@Param('walletId') walletId: string) {
    const wallet = makeWalletId(walletId);
    const { triggers } = await listActionableAlerts({
      walletId: wallet,
      triggerRepo: this.triggerRepo,
    });
    const positions = await this.positionReadPort.listSupportedPositions(wallet);
    const ownedPositionIds = new Set(positions.map((position) => position.positionId));
    return {
      alerts: triggers
        .filter((trigger) => ownedPositionIds.has(trigger.positionId))
        .map(toActionableAlertDto),
    };
  }

  @Post(':triggerId/acknowledge')
  async acknowledgeAlert(@Param('triggerId') triggerId: string) {
    const result = await acknowledgeAlert({
      triggerId: triggerId as ExitTriggerId,
      triggerRepo: this.triggerRepo,
    });
    if (result.kind === 'not-found') {
      throw new NotFoundException(`Trigger not found: ${triggerId}`);
    }
    return { acknowledged: true };
  }
}

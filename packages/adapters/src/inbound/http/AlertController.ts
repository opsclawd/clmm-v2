import { Controller, Get, Param, Post, Inject, NotFoundException } from '@nestjs/common';
import type { TriggerRepository, ActionableAlertDto } from '@clmm/application';
import { listActionableAlerts } from '../../../../application/src/use-cases/alerts/ListActionableAlerts.js';
import { acknowledgeAlert } from '../../../../application/src/use-cases/alerts/AcknowledgeAlert.js';
import type { ExitTrigger, ExitTriggerId } from '@clmm/domain';
import { makeWalletId } from '@clmm/domain';
import { TRIGGER_REPOSITORY } from './tokens.js';

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
  ) {}

  @Get(':walletId')
  async listAlerts(@Param('walletId') walletId: string) {
    const { triggers } = await listActionableAlerts({
      walletId: makeWalletId(walletId),
      triggerRepo: this.triggerRepo,
    });
    return { alerts: triggers.map(toActionableAlertDto) };
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

/**
 * AlertController
 *
 * Handles alert-related HTTP endpoints for the NestJS BFF.
 */
import { Controller, Get, Param, Post } from '@nestjs/common';

@Controller('alerts')
export class AlertController {
  constructor(
    // TODO: inject use case facades in Epic 5 composition
  ) {}

  @Get(':walletId')
  listAlerts(@Param('walletId') _walletId: string) {
    // TODO: invoke ListActionableAlerts use case
    return { alerts: [] };
  }

  @Post(':triggerId/acknowledge')
  acknowledgeAlert(@Param('triggerId') _triggerId: string) {
    // TODO: invoke AcknowledgeAlert use case
    return { acknowledged: true };
  }
}

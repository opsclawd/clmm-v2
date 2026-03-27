/**
 * ExecutionController
 *
 * Handles execution HTTP endpoints for the NestJS BFF.
 */
import { Controller, Get, Param, Post, Body } from '@nestjs/common';

@Controller('executions')
export class ExecutionController {
  constructor(
    // TODO: inject use case facades in Epic 5 composition
  ) {}

  @Get(':attemptId')
  async getExecution(@Param('attemptId') attemptId: string) {
    // TODO: invoke GetExecutionAttemptDetail use case
    return { execution: null };
  }

  @Get('history/:positionId')
  async getExecutionHistory(@Param('positionId') positionId: string) {
    // TODO: invoke GetExecutionHistory use case
    return { history: [] };
  }

  @Post(':attemptId/submit')
  async submitExecution(
    @Param('attemptId') attemptId: string,
    @Body() body: { signedPayload: string },
  ) {
    // TODO: invoke ReconcileExecutionAttempt use case
    return { success: true };
  }

  @Post(':attemptId/abandon')
  async abandonExecution(@Param('attemptId') attemptId: string) {
    // TODO: invoke RecordExecutionAbandonment use case
    return { abandoned: true };
  }
}
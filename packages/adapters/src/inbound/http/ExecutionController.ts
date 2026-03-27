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
  getExecution(@Param('attemptId') _attemptId: string) {
    // TODO: invoke GetExecutionAttemptDetail use case
    return { execution: null };
  }

  @Get('history/:positionId')
  getExecutionHistory(@Param('positionId') _positionId: string) {
    // TODO: invoke GetExecutionHistory use case
    return { history: [] };
  }

  @Post(':attemptId/submit')
  submitExecution(
    @Param('attemptId') _attemptId: string,
    @Body() _body: { signedPayload: string },
  ) {
    // TODO: invoke ReconcileExecutionAttempt use case
    return { success: true };
  }

  @Post(':attemptId/abandon')
  abandonExecution(@Param('attemptId') _attemptId: string) {
    // TODO: invoke RecordExecutionAbandonment use case
    return { abandoned: true };
  }
}

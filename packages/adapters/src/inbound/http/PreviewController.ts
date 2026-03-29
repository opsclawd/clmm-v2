import { Controller, Get, Param, Post, Inject, NotFoundException } from '@nestjs/common';
import type {
  ExecutionRepository,
  TriggerRepository,
  SwapQuotePort,
  ClockPort,
  IdGeneratorPort,
  ExecutionPreviewDto,
} from '@clmm/application';
import { getExecutionPreview, refreshExecutionPreview } from '@clmm/application';
import type { ExitTriggerId, ExecutionPreview, PositionId, BreachDirection } from '@clmm/domain';
import {
  EXECUTION_REPOSITORY,
  TRIGGER_REPOSITORY,
  SWAP_QUOTE_PORT,
  CLOCK_PORT,
  ID_GENERATOR_PORT,
} from './tokens.js';

function toPreviewDto(
  previewId: string,
  positionId: PositionId,
  breachDirection: BreachDirection,
  preview: ExecutionPreview,
): ExecutionPreviewDto {
  const plan = preview.plan;
  return {
    previewId,
    positionId,
    breachDirection,
    postExitPosture: plan.postExitPosture,
    steps: plan.steps.map((step) => {
      if (step.kind === 'swap-assets') {
        return {
          kind: 'swap-assets' as const,
          fromAsset: step.instruction.fromAsset,
          toAsset: step.instruction.toAsset,
          policyReason: step.instruction.policyReason,
        };
      }
      return { kind: step.kind };
    }),
    freshness: preview.freshness,
    estimatedAt: preview.estimatedAt as ExecutionPreviewDto['estimatedAt'],
  };
}

@Controller('previews')
export class PreviewController {
  constructor(
    @Inject(EXECUTION_REPOSITORY)
    private readonly executionRepo: ExecutionRepository,
    @Inject(TRIGGER_REPOSITORY)
    private readonly triggerRepo: TriggerRepository,
    @Inject(SWAP_QUOTE_PORT)
    private readonly swapQuotePort: SwapQuotePort,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
    @Inject(ID_GENERATOR_PORT)
    private readonly ids: IdGeneratorPort,
  ) {}

  @Get(':previewId')
  async getPreview(@Param('previewId') previewId: string) {
    const result = await getExecutionPreview({ previewId, executionRepo: this.executionRepo });
    if (result.kind === 'not-found') {
      throw new NotFoundException(`Preview not found: ${previewId}`);
    }
    return {
      preview: toPreviewDto(previewId, result.positionId, result.breachDirection, result.preview),
    };
  }

  @Post(':triggerId/refresh')
  async refreshPreview(@Param('triggerId') triggerId: string) {
    const trigger = await this.triggerRepo.getTrigger(triggerId as ExitTriggerId);
    if (!trigger) {
      throw new NotFoundException(`Trigger not found: ${triggerId}`);
    }
    const result = await refreshExecutionPreview({
      previewId: '',
      positionId: trigger.positionId,
      breachDirection: trigger.breachDirection,
      swapQuotePort: this.swapQuotePort,
      executionRepo: this.executionRepo,
      clock: this.clock,
      ids: this.ids,
    });
    return {
      preview: toPreviewDto(result.previewId, trigger.positionId, trigger.breachDirection, result.preview),
    };
  }
}

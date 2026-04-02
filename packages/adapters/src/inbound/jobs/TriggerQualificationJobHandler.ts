import { Inject, Injectable } from '@nestjs/common';
import { qualifyActionableTrigger } from '@clmm/application';
import type {
  TriggerRepository,
  ClockPort,
  IdGeneratorPort,
  ObservabilityPort,
} from '@clmm/application';
import type { BreachDirection, PositionId, ClockTimestamp } from '@clmm/domain';
import {
  TRIGGER_REPOSITORY,
  CLOCK_PORT,
  ID_GENERATOR_PORT,
  OBSERVABILITY_PORT,
  PG_BOSS,
} from './tokens.js';

type EnqueueFn = (name: string, data: unknown) => Promise<void>;

type QualifyTriggerPayload = {
  positionId: string;
  walletId: string;
  directionKind: 'lower-bound-breach' | 'upper-bound-breach';
  observedAt: number;
  episodeId: string;
};

@Injectable()
export class TriggerQualificationJobHandler {
  static readonly JOB_NAME = 'qualify-trigger';

  constructor(
    @Inject(TRIGGER_REPOSITORY)
    private readonly triggerRepo: TriggerRepository,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
    @Inject(ID_GENERATOR_PORT)
    private readonly ids: IdGeneratorPort,
    @Inject(OBSERVABILITY_PORT)
    private readonly observability: ObservabilityPort,
    @Inject(PG_BOSS)
    private readonly enqueue: EnqueueFn,
  ) {}

  async handle(data: QualifyTriggerPayload): Promise<void> {
    try {
      const direction: BreachDirection = { kind: data.directionKind };

      const result = await qualifyActionableTrigger({
        observation: {
          positionId: data.positionId as PositionId,
          direction,
          observedAt: data.observedAt as ClockTimestamp,
          episodeId: data.episodeId,
        },
        consecutiveCount: 3, // MVP confirmation threshold
        triggerRepo: this.triggerRepo,
        clock: this.clock,
        ids: this.ids,
      });

      if (result.kind === 'trigger-created') {
        await this.enqueue('dispatch-notification', {
          triggerId: result.trigger.triggerId,
          walletId: data.walletId,
          positionId: data.positionId,
          directionKind: data.directionKind,
        });
        this.observability.log('info', `Trigger created for position ${data.positionId}`, {
          triggerId: result.trigger.triggerId,
          directionKind: data.directionKind,
        });
      } else if (result.kind === 'duplicate-suppressed') {
        this.observability.log('info', `Duplicate trigger suppressed for episode ${data.episodeId}`, {
          existingTriggerId: result.existingTriggerId,
        });
      } else {
        this.observability.log('info', `Trigger not qualified: ${result.reason}`, {
          positionId: data.positionId,
        });
      }
    } catch (error: unknown) {
      this.observability.log('error', `Trigger qualification failed for position ${data.positionId}`, {
        positionId: data.positionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error; // pg-boss will retry
    }
  }
}

import type { BreachDirection, PostExitAssetPosture, SwapInstruction } from '@clmm/domain';
import {
  makeWalletId,
} from '@clmm/domain';
import { scanPositionsForBreaches } from '@clmm/application';
import { qualifyActionableTrigger } from '@clmm/application';
import { createExecutionPreview } from '@clmm/application';
import type { BreachObservationResult } from '@clmm/application';
import {
  FakeSupportedPositionReadPort,
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeBreachEpisodeRepository,
  FakeSwapQuotePort,
  FakeExecutionRepository,
  FakeExecutionPreparationPort,
  FakeWalletSigningPort,
  FakeExecutionSubmissionPort,
  FakeExecutionHistoryRepository,
} from '../fakes/index.js';
import { FIXTURE_POSITION_BELOW_RANGE, FIXTURE_POSITION_ABOVE_RANGE } from '../fixtures/index.js';
import { runApprovalFlow } from './approvalFlow.js';
import type { ScenarioApprovalOutcome } from './approvalFlow.js';

export type ScenarioResult = {
  previewPosture: PostExitAssetPosture;
  swapInstruction: SwapInstruction;
  approvalOutcome: ScenarioApprovalOutcome;
};

export async function runBreachToExitScenario(params: {
  direction: BreachDirection;
}): Promise<ScenarioResult> {
  const walletId = makeWalletId('scenario-wallet');
  const clock = new FakeClockPort();
  const ids = new FakeIdGeneratorPort('scenario');

  const fixturePosition =
    params.direction.kind === 'lower-bound-breach'
      ? FIXTURE_POSITION_BELOW_RANGE
      : FIXTURE_POSITION_ABOVE_RANGE;

  const positionRead = new FakeSupportedPositionReadPort([fixturePosition]);
  const episodeRepo = new FakeBreachEpisodeRepository();
  const swapQuote = new FakeSwapQuotePort();
  const executionRepo = new FakeExecutionRepository();
  const prepPort = new FakeExecutionPreparationPort();
  const signingPort = new FakeWalletSigningPort();
  const submissionPort = new FakeExecutionSubmissionPort();
  const historyRepo = new FakeExecutionHistoryRepository();

  let obs: BreachObservationResult | null = null;
  for (let i = 0; i < 3; i += 1) {
    const { observations } = await scanPositionsForBreaches({
      walletId,
      positionReadPort: positionRead,
      clock,
      episodeRepo,
    });
    if (observations.length === 0) throw new Error('No observations from scan');
    obs = observations[0]!;
    clock.advance(60_000);
  }

  if (!obs) throw new Error('No observation available for qualification');

  const qualifyResult = await qualifyActionableTrigger({
    observation: obs,
    episodeRepo,
    ids,
  });
  if (qualifyResult.kind !== 'trigger-created') {
    throw new Error(`Expected trigger-created, got ${qualifyResult.kind}`);
  }

  const previewResult = await createExecutionPreview({
    positionId: obs.positionId,
    breachDirection: obs.direction,
    swapQuotePort: swapQuote,
    executionRepo,
    clock,
    ids,
  });

  const approvalOutcome = await runApprovalFlow({
    previewId: previewResult.previewId,
    walletId,
    executionRepo,
    prepPort,
    signingPort,
    submissionPort,
    historyRepo,
    clock,
    ids,
  });

  return {
    previewPosture: previewResult.plan.postExitPosture,
    swapInstruction: previewResult.plan.swapInstruction,
    approvalOutcome,
  };
}

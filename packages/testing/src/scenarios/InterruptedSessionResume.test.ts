import { describe, it, expect } from 'vitest';
import {
  makeWalletId,
} from '@clmm/domain';
import {
  scanPositionsForBreaches,
  qualifyActionableTrigger,
  createExecutionPreview,
  resumeExecutionAttempt,
} from '@clmm/application';
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
import { FIXTURE_POSITION_BELOW_RANGE } from '../fixtures/index.js';
import { runApprovalFlow } from './approvalFlow.js';

/**
 * Interrupted-session resume smoke scenario.
 *
 * Exercises the lifecycle:
 *   breach → scan → trigger → preview → approve (interrupted) → resume → re-approve → submit
 *
 * Validates that an interrupted awaiting-signature session is resumable,
 * preserves directional context, and can complete after re-approval.
 * Also validates that declined (abandoned) attempts are NOT resumable.
 */
describe('Interrupted-Session Resume Smoke Scenario', () => {
  function buildFakes() {
    const walletId = makeWalletId('interrupted-resume-wallet');
    const clock = new FakeClockPort();
    const ids = new FakeIdGeneratorPort('interrupted');
    const positionRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_BELOW_RANGE]);
    const episodeRepo = new FakeBreachEpisodeRepository();
    const swapQuote = new FakeSwapQuotePort();
    const executionRepo = new FakeExecutionRepository();
    const prepPort = new FakeExecutionPreparationPort();
    const signingPort = new FakeWalletSigningPort();
    const submissionPort = new FakeExecutionSubmissionPort();
    const historyRepo = new FakeExecutionHistoryRepository();

    return {
      walletId, clock, ids, positionRead, episodeRepo, swapQuote,
      executionRepo, prepPort, signingPort, submissionPort, historyRepo,
    };
  }

  it('interrupted signing session is resumable and can complete after re-approval', async () => {
    const fakes = buildFakes();
    const {
      walletId, clock, ids, positionRead, episodeRepo, swapQuote,
      executionRepo, prepPort, signingPort, submissionPort, historyRepo,
    } = fakes;

    // 1. Scan — detect below-range position
    let obs: BreachObservationResult | null = null;
    for (let i = 0; i < 3; i += 1) {
      const { observations } = await scanPositionsForBreaches({
        walletId,
        positionReadPort: positionRead,
        clock,
        episodeRepo,
      });
      expect(observations.length).toBeGreaterThan(0);
      obs = observations[0]!;
      clock.advance(60_000);
    }
    if (!obs) throw new Error('Expected breach observation');
    expect(obs.direction.kind).toBe('lower-bound-breach');

    // 2. Qualify — create actionable trigger
    const qualifyResult = await qualifyActionableTrigger({
      observation: obs,
      episodeRepo,
      ids,
    });
    expect(qualifyResult.kind).toBe('trigger-created');

    // 3. Preview — generate execution preview
    const previewResult = await createExecutionPreview({
      positionId: obs.positionId,
      breachDirection: obs.direction,
      swapQuotePort: swapQuote,
      executionRepo,
      clock,
      ids,
    });
    expect(previewResult.plan.postExitPosture.kind).toBe('exit-to-usdc');

    // 4. Interrupt signing — simulate MWA/wallet interruption
    signingPort.willInterrupt();
    const interruptedOutcome = await runApprovalFlow({
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
    expect(interruptedOutcome.kind).toBe('interrupted');
    if (interruptedOutcome.kind !== 'interrupted') throw new Error('Expected interrupted');

    // 5. Resume — interrupted session should be resumable
    const resumeResult = await resumeExecutionAttempt({
      attemptId: interruptedOutcome.attemptId,
      executionRepo,
    });
    expect(resumeResult.kind).toBe('resumable');
    if (resumeResult.kind !== 'resumable') throw new Error('Expected resumable');

    // Verify resume preserves directional context
    expect(resumeResult.breachDirection.kind).toBe('lower-bound-breach');

    // 6. Re-approve — set signing port to sign and create fresh preview
    signingPort._nextResult = { kind: 'signed', signedPayload: new Uint8Array([4, 5, 6]) };

    const freshPreview = await createExecutionPreview({
      positionId: obs.positionId,
      breachDirection: obs.direction,
      swapQuotePort: swapQuote,
      executionRepo,
      clock,
      ids,
    });

    const reApprovalOutcome = await runApprovalFlow({
      previewId: freshPreview.previewId,
      walletId,
      executionRepo,
      prepPort,
      signingPort,
      submissionPort,
      historyRepo,
      clock,
      ids,
    });
    expect(reApprovalOutcome.kind).toBe('submitted');

    // 7. Verify history has both 'signature-interrupted' and 'submitted' event types
    const eventTypes = historyRepo.events.map((e) => e.eventType);
    expect(eventTypes).toContain('signature-interrupted');
    expect(eventTypes).toContain('submitted');

    // 8. Verify all history events preserve breach direction
    for (const event of historyRepo.events) {
      expect(event.breachDirection.kind).toBe('lower-bound-breach');
    }
  });

  it('interrupted attempt is distinct from declined (abandoned) attempt', async () => {
    const fakes = buildFakes();
    const {
      walletId, clock, ids, positionRead, episodeRepo, swapQuote,
      executionRepo, prepPort, signingPort, submissionPort, historyRepo,
    } = fakes;

    // 1. Scan — detect below-range position
    let obs: BreachObservationResult | null = null;
    for (let i = 0; i < 3; i += 1) {
      const { observations } = await scanPositionsForBreaches({
        walletId,
        positionReadPort: positionRead,
        clock,
        episodeRepo,
      });
      expect(observations.length).toBeGreaterThan(0);
      obs = observations[0]!;
      clock.advance(60_000);
    }
    if (!obs) throw new Error('Expected breach observation');

    // 2. Qualify — create actionable trigger
    const qualifyResult = await qualifyActionableTrigger({
      observation: obs,
      episodeRepo,
      ids,
    });
    expect(qualifyResult.kind).toBe('trigger-created');

    // 3. Preview — generate execution preview
    const previewResult = await createExecutionPreview({
      positionId: obs.positionId,
      breachDirection: obs.direction,
      swapQuotePort: swapQuote,
      executionRepo,
      clock,
      ids,
    });

    // 4. Decline signing — simulate user declining wallet signature
    signingPort.willDecline();
    const declinedOutcome = await runApprovalFlow({
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
    expect(declinedOutcome.kind).toBe('declined');
    if (declinedOutcome.kind !== 'declined') throw new Error('Expected declined');

    // 5. Resume declined attempt — should NOT be resumable (abandoned is terminal)
    const resumeResult = await resumeExecutionAttempt({
      attemptId: declinedOutcome.attemptId,
      executionRepo,
    });
    expect(resumeResult.kind).toBe('not-resumable');
    if (resumeResult.kind === 'not-resumable') {
      expect(resumeResult.currentState).toBe('abandoned');
    }
  });
});

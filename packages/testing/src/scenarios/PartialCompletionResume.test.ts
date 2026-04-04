import { describe, it, expect } from 'vitest';
import {
  makeWalletId,
} from '@clmm/domain';
import {
  scanPositionsForBreaches,
  qualifyActionableTrigger,
  createExecutionPreview,
  reconcileExecutionAttempt,
  resumeExecutionAttempt,
} from '@clmm/application';
import {
  FakeSupportedPositionReadPort,
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeTriggerRepository,
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
 * Partial-completion resume smoke scenario.
 *
 * Exercises the full lifecycle:
 *   breach → scan → trigger → preview → approve → submit → reconcile → partial → resume-not-resumable
 *
 * Validates that partial is terminal for resume purposes (domain invariant:
 * partial → NO TRANSITIONS, no blind full replay).
 */
describe('Partial-Completion Resume Smoke Scenario', () => {
  function buildFakes() {
    const walletId = makeWalletId('partial-resume-wallet');
    const clock = new FakeClockPort();
    const ids = new FakeIdGeneratorPort('partial');
    const positionRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_BELOW_RANGE]);
    const triggerRepo = new FakeTriggerRepository();
    const swapQuote = new FakeSwapQuotePort();
    const executionRepo = new FakeExecutionRepository();
    const prepPort = new FakeExecutionPreparationPort();
    const signingPort = new FakeWalletSigningPort();
    const submissionPort = new FakeExecutionSubmissionPort();
    const historyRepo = new FakeExecutionHistoryRepository();

    return {
      walletId, clock, ids, positionRead, triggerRepo, swapQuote,
      executionRepo, prepPort, signingPort, submissionPort, historyRepo,
    };
  }

  async function runThroughSubmission(fakes: ReturnType<typeof buildFakes>) {
    const {
      walletId, clock, ids, positionRead, triggerRepo, swapQuote,
      executionRepo, prepPort, signingPort, submissionPort, historyRepo,
    } = fakes;

    // 1. Scan — detect below-range position
    const observations = await scanPositionsForBreaches({
      walletId,
      positionReadPort: positionRead,
      clock,
      ids,
    });
    expect(observations.length).toBeGreaterThan(0);
    const obs = observations[0]!;
    expect(obs.direction.kind).toBe('lower-bound-breach');

    // 2. Qualify — create actionable trigger
    const qualifyResult = await qualifyActionableTrigger({
      observation: obs,
      consecutiveCount: 3,
      triggerRepo,
      clock,
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

    // 4. Approve — sign and submit
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
    expect(approvalOutcome.kind).toBe('submitted');
    if (approvalOutcome.kind !== 'submitted') throw new Error('Expected submitted');

    return { obs, previewResult, approvalOutcome };
  }

  it('partial completion: resume returns not-resumable (partial is terminal)', async () => {
    const fakes = buildFakes();
    const { approvalOutcome, obs } = await runThroughSubmission(fakes);
    if (approvalOutcome.kind !== 'submitted') throw new Error('Expected submitted');

    // 5. Set only 1 confirmed step → partial
    fakes.submissionPort.setConfirmedSteps(['remove-liquidity']);

    // 6. Reconcile — should yield partial
    const reconcileResult = await reconcileExecutionAttempt({
      attemptId: approvalOutcome.attemptId,
      positionId: obs.positionId,
      breachDirection: obs.direction,
      executionRepo: fakes.executionRepo,
      submissionPort: fakes.submissionPort,
      historyRepo: fakes.historyRepo,
      clock: fakes.clock,
      ids: fakes.ids,
    });
    expect(reconcileResult.kind).toBe('partial');
    if (reconcileResult.kind === 'partial') {
      expect(reconcileResult.confirmedSteps).toContain('remove-liquidity');
    }

    // 7. Resume — partial is terminal, should NOT be resumable
    const resumeResult = await resumeExecutionAttempt({
      attemptId: approvalOutcome.attemptId,
      executionRepo: fakes.executionRepo,
    });
    expect(resumeResult.kind).toBe('not-resumable');
    if (resumeResult.kind === 'not-resumable') {
      expect(resumeResult.currentState).toBe('partial');
    }
  });

  it('full completion: resume returns not-resumable (confirmed is terminal)', async () => {
    const fakes = buildFakes();
    const { approvalOutcome, obs } = await runThroughSubmission(fakes);
    if (approvalOutcome.kind !== 'submitted') throw new Error('Expected submitted');

    // 5. Set all 3 steps confirmed → confirmed
    fakes.submissionPort.setConfirmedSteps(['remove-liquidity', 'collect-fees', 'swap-assets']);

    // 6. Reconcile — should yield confirmed
    const reconcileResult = await reconcileExecutionAttempt({
      attemptId: approvalOutcome.attemptId,
      positionId: obs.positionId,
      breachDirection: obs.direction,
      executionRepo: fakes.executionRepo,
      submissionPort: fakes.submissionPort,
      historyRepo: fakes.historyRepo,
      clock: fakes.clock,
      ids: fakes.ids,
    });
    expect(reconcileResult.kind).toBe('confirmed');

    // 7. Resume — confirmed is terminal, should NOT be resumable
    const resumeResult = await resumeExecutionAttempt({
      attemptId: approvalOutcome.attemptId,
      executionRepo: fakes.executionRepo,
    });
    expect(resumeResult.kind).toBe('not-resumable');
    if (resumeResult.kind === 'not-resumable') {
      expect(resumeResult.currentState).toBe('confirmed');
    }
  });
});

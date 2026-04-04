import { describe, expect, it } from 'vitest';
import { recordSignatureInterruption } from './RecordSignatureInterruption.js';
import {
  FIXTURE_POSITION_ID,
  FakeClockPort,
  FakeExecutionHistoryRepository,
  FakeExecutionRepository,
  FakeIdGeneratorPort,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH, makeClockTimestamp } from '@clmm/domain';
import type { StoredExecutionAttempt } from '../../ports/index.js';

describe('RecordSignatureInterruption', () => {
  it('keeps awaiting-signature attempts resumable and records interruption history', async () => {
    const clock = new FakeClockPort();
    const ids = new FakeIdGeneratorPort();
    const executionRepo = new FakeExecutionRepository();
    const historyRepo = new FakeExecutionHistoryRepository();

    const attempt: StoredExecutionAttempt = {
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    };
    await executionRepo.saveAttempt(attempt);
    await executionRepo.savePreparedPayload({
      payloadId: 'payload-1',
      attemptId: 'attempt-1',
      unsignedPayload: new Uint8Array([9, 8, 7]),
      payloadVersion: 'v1',
      expiresAt: makeClockTimestamp(1_060_000),
      createdAt: makeClockTimestamp(1_000_000),
    });

    const result = await recordSignatureInterruption({
      attemptId: 'attempt-1',
      executionRepo,
      historyRepo,
      clock,
      ids,
    });

    expect(result.kind).toBe('interrupted');
    expect((await executionRepo.getAttempt('attempt-1'))?.lifecycleState.kind).toBe('awaiting-signature');
    expect(await executionRepo.getPreparedPayload('attempt-1')).toMatchObject({
      payloadVersion: 'v1',
      unsignedPayload: new Uint8Array([9, 8, 7]),
    });
    expect(historyRepo.events.at(-1)).toMatchObject({
      eventType: 'signature-interrupted',
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
    });
  });

  it('returns not-found for missing attempt', async () => {
    const result = await recordSignatureInterruption({
      attemptId: 'missing-attempt',
      executionRepo: new FakeExecutionRepository(),
      historyRepo: new FakeExecutionHistoryRepository(),
      clock: new FakeClockPort(),
      ids: new FakeIdGeneratorPort(),
    });

    expect(result.kind).toBe('not-found');
  });

  it('refuses interruption recording once the attempt is no longer awaiting signature', async () => {
    const executionRepo = new FakeExecutionRepository();
    await executionRepo.saveAttempt({
      attemptId: 'attempt-submitted',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'submitted' },
      completedSteps: [],
      transactionReferences: [],
    });

    const result = await recordSignatureInterruption({
      attemptId: 'attempt-submitted',
      executionRepo,
      historyRepo: new FakeExecutionHistoryRepository(),
      clock: new FakeClockPort(),
      ids: new FakeIdGeneratorPort(),
    });

    expect(result).toEqual({
      kind: 'already-terminal',
      state: 'submitted',
    });
  });
});

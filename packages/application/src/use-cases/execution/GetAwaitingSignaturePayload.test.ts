import { describe, expect, it } from 'vitest';
import { getAwaitingSignaturePayload } from './GetAwaitingSignaturePayload.js';
import {
  FIXTURE_POSITION_ID,
  FakeClockPort,
  FakeExecutionHistoryRepository,
  FakeExecutionRepository,
  FakeIdGeneratorPort,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH, makeClockTimestamp } from '@clmm/domain';

describe('GetAwaitingSignaturePayload', () => {
  it('returns the persisted unsigned payload for awaiting-signature attempts', async () => {
    const executionRepo = new FakeExecutionRepository();
    await executionRepo.saveAttempt({
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });
    await executionRepo.savePreparedPayload({
      payloadId: 'payload-1',
      attemptId: 'attempt-1',
      unsignedPayload: new Uint8Array([9, 8, 7]),
      payloadVersion: 'v1',
      expiresAt: makeClockTimestamp(1_060_000),
      createdAt: makeClockTimestamp(1_000_000),
    });

    const result = await getAwaitingSignaturePayload({
      attemptId: 'attempt-1',
      executionRepo,
      historyRepo: new FakeExecutionHistoryRepository(),
      clock: new FakeClockPort(),
      ids: new FakeIdGeneratorPort(),
    });

    expect(result).toEqual({
      kind: 'found',
      attemptId: 'attempt-1',
      serializedPayload: new Uint8Array([9, 8, 7]),
      payloadVersion: 'v1',
      lifecycleState: { kind: 'awaiting-signature' },
      signingExpiresAt: makeClockTimestamp(1_060_000),
    });
  });

  it('returns not-found for unknown attempts', async () => {
    const result = await getAwaitingSignaturePayload({
      attemptId: 'missing-attempt',
      executionRepo: new FakeExecutionRepository(),
      historyRepo: new FakeExecutionHistoryRepository(),
      clock: new FakeClockPort(),
      ids: new FakeIdGeneratorPort(),
    });

    expect(result).toEqual({ kind: 'not-found' });
  });

  it('rejects attempts that are no longer signable', async () => {
    const executionRepo = new FakeExecutionRepository();
    await executionRepo.saveAttempt({
      attemptId: 'attempt-submitted',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'submitted' },
      completedSteps: [],
      transactionReferences: [],
    });
    await executionRepo.savePreparedPayload({
      payloadId: 'payload-submitted',
      attemptId: 'attempt-submitted',
      unsignedPayload: new Uint8Array([9, 8, 7]),
      payloadVersion: 'v1',
      expiresAt: makeClockTimestamp(1_060_000),
      createdAt: makeClockTimestamp(1_000_000),
    });

    const result = await getAwaitingSignaturePayload({
      attemptId: 'attempt-submitted',
      executionRepo,
      historyRepo: new FakeExecutionHistoryRepository(),
      clock: new FakeClockPort(),
      ids: new FakeIdGeneratorPort(),
    });

    expect(result).toEqual({
      kind: 'not-signable',
      currentState: 'submitted',
    });
  });

  it('returns missing-payload when the attempt is awaiting signature without a prepared payload', async () => {
    const executionRepo = new FakeExecutionRepository();
    await executionRepo.saveAttempt({
      attemptId: 'attempt-missing-payload',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });

    const result = await getAwaitingSignaturePayload({
      attemptId: 'attempt-missing-payload',
      executionRepo,
      historyRepo: new FakeExecutionHistoryRepository(),
      clock: new FakeClockPort(),
      ids: new FakeIdGeneratorPort(),
    });

    expect(result).toEqual({
      kind: 'missing-payload',
      currentState: 'awaiting-signature',
    });
  });

  it('expires stale awaiting-signature attempts before returning a signing payload', async () => {
    const clock = new FakeClockPort(makeClockTimestamp(1_060_001));
    const ids = new FakeIdGeneratorPort();
    const executionRepo = new FakeExecutionRepository();
    const historyRepo = new FakeExecutionHistoryRepository();

    await executionRepo.saveAttempt({
      attemptId: 'attempt-expired',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });
    await executionRepo.savePreparedPayload({
      payloadId: 'payload-expired',
      attemptId: 'attempt-expired',
      unsignedPayload: new Uint8Array([9, 8, 7]),
      payloadVersion: 'v1',
      expiresAt: makeClockTimestamp(1_060_000),
      createdAt: makeClockTimestamp(1_000_000),
    });

    const result = await getAwaitingSignaturePayload({
      attemptId: 'attempt-expired',
      executionRepo,
      historyRepo,
      clock,
      ids,
    });

    expect(result).toEqual({
      kind: 'expired',
      currentState: 'expired',
    });
    expect((await executionRepo.getAttempt('attempt-expired'))?.lifecycleState).toEqual({ kind: 'expired' });
    expect(historyRepo.events).toContainEqual(
      expect.objectContaining({
        eventType: 'preview-expired',
        lifecycleState: { kind: 'expired' },
      }),
    );
  });

  it('treats payload as expired when clock.now() equals expiresAt (boundary case)', async () => {
    const clock = new FakeClockPort(makeClockTimestamp(1_060_000));
    const ids = new FakeIdGeneratorPort();
    const executionRepo = new FakeExecutionRepository();
    const historyRepo = new FakeExecutionHistoryRepository();

    await executionRepo.saveAttempt({
      attemptId: 'attempt-at-boundary',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });
    await executionRepo.savePreparedPayload({
      payloadId: 'payload-at-boundary',
      attemptId: 'attempt-at-boundary',
      unsignedPayload: new Uint8Array([9, 8, 7]),
      payloadVersion: 'v1',
      expiresAt: makeClockTimestamp(1_060_000),
      createdAt: makeClockTimestamp(1_000_000),
    });

    const result = await getAwaitingSignaturePayload({
      attemptId: 'attempt-at-boundary',
      executionRepo,
      historyRepo,
      clock,
      ids,
    });

    expect(result).toEqual({
      kind: 'expired',
      currentState: 'expired',
    });
  });
});

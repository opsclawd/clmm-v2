import { describe, it, expect } from 'vitest';
import { resolveExecutionEntryContext } from '@clmm/application';
import { FIXTURE_POSITION_ID } from '@clmm/testing';
import { FakeDeepLinkEntryPort } from '../fakes/FakeDeepLinkEntryPort.js';
import type { ExitTriggerId } from '@clmm/domain';

describe('ResolveExecutionEntryContext', () => {
  it('resolves trigger deep link to trigger-preview context', () => {
    const deepLinkPort = new FakeDeepLinkEntryPort();
    const triggerId = 'trigger-1' as ExitTriggerId;
    deepLinkPort.setNextResult({
      kind: 'trigger',
      positionId: FIXTURE_POSITION_ID,
      triggerId,
    });

    const result = resolveExecutionEntryContext({
      url: 'clmmv2://trigger/trigger-1',
      deepLinkPort,
    });

    expect(result.kind).toBe('trigger-preview');
    if (result.kind === 'trigger-preview') {
      expect(result.positionId).toBe(FIXTURE_POSITION_ID);
      expect(result.triggerId).toBe(triggerId);
    }
  });

  it('resolves unknown deep link to degraded-recovery', () => {
    const deepLinkPort = new FakeDeepLinkEntryPort();
    deepLinkPort.setNextResult({ kind: 'unknown' });

    const result = resolveExecutionEntryContext({
      url: 'clmmv2://unknown',
      deepLinkPort,
    });

    expect(result.kind).toBe('degraded-recovery');
  });

  it('resolves history deep link', () => {
    const deepLinkPort = new FakeDeepLinkEntryPort();
    deepLinkPort.setNextResult({
      kind: 'history',
      positionId: FIXTURE_POSITION_ID,
    });

    const result = resolveExecutionEntryContext({
      url: 'clmmv2://history/pos-1',
      deepLinkPort,
    });

    expect(result.kind).toBe('history');
    if (result.kind === 'history') {
      expect(result.positionId).toBe(FIXTURE_POSITION_ID);
    }
  });
});

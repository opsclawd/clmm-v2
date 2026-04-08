import { describe, it, expect, vi } from 'vitest';
import { SolanaExecutionSubmissionAdapter } from './SolanaExecutionSubmissionAdapter';
import type { TransactionReference } from '@clmm/domain';

type RpcStatus = { confirmationStatus?: 'processed' | 'confirmed' | 'finalized'; err?: unknown } | null;

const makeRef = (hint: string, stepKind: TransactionReference['stepKind']): TransactionReference => ({
  signature: hint,
  stepKind,
});

const makeMockRpc = (statusBySignature: Record<string, RpcStatus>) => {
  const getSignatureStatuses = vi.fn().mockImplementation((signatures: [unknown]) => ({
    send: vi.fn().mockResolvedValue({
      value: [statusBySignature[String(signatures[0])] ?? null],
    }),
  }));
  return {
    getSignatureStatuses,
    sendTransaction: vi.fn().mockImplementation(() => ({
      send: vi.fn(),
    })),
  };
};

const makeAdapter = (mockRpc: ReturnType<typeof makeMockRpc>) => {
  const adapter = new SolanaExecutionSubmissionAdapter('https://api.mainnet-beta.solana.com');
  (adapter as unknown as { getRpc: () => unknown }).getRpc = () => mockRpc;
  return adapter;
};

describe('SolanaExecutionSubmissionAdapter', () => {
  describe('reconcileExecution classification', () => {
    it('returns confirmed when all references are confirmed', async () => {
      const adapter = makeAdapter(makeMockRpc({
        'sig1': { confirmationStatus: 'confirmed' },
        'sig2': { confirmationStatus: 'confirmed' },
      }));

      const result = await adapter.reconcileExecution([
        makeRef('sig1', 'remove-liquidity'),
        makeRef('sig2', 'collect-fees'),
      ]);

      expect(result.finalState).toEqual({ kind: 'confirmed' });
      expect(result.confirmedSteps).toEqual(['remove-liquidity', 'collect-fees']);
    });

    it('returns partial when some references are confirmed and others are unresolved', async () => {
      const adapter = makeAdapter(makeMockRpc({
        'sig1': { confirmationStatus: 'confirmed' },
        'sig2': null,
      }));

      const result = await adapter.reconcileExecution([
        makeRef('sig1', 'swap-assets'),
        makeRef('sig2', 'collect-fees'),
      ]);

      expect(result.finalState).toEqual({ kind: 'partial' });
      expect(result.confirmedSteps).toEqual(['swap-assets']);
    });

    it('returns failed when some references fail and others are unresolved with zero confirmed', async () => {
      const adapter = makeAdapter(makeMockRpc({
        'sig-fail-1': { err: { err: 'Transaction failed' } },
        'sig-pending-1': null,
        'sig-pending-2': null,
      }));

      const result = await adapter.reconcileExecution([
        makeRef('sig-fail-1', 'remove-liquidity'),
        makeRef('sig-pending-1', 'collect-fees'),
        makeRef('sig-pending-2', 'swap-assets'),
      ]);

      expect(result.finalState).toEqual({ kind: 'failed' });
      expect(result.confirmedSteps).toEqual([]);
    });

    it('returns null when the references array is empty', async () => {
      const adapter = makeAdapter(makeMockRpc({}));

      const result = await adapter.reconcileExecution([]);

      expect(result.finalState).toBeNull();
      expect(result.confirmedSteps).toEqual([]);
    });

    it('treats err with confirmed/finalized status as failed, not confirmed', async () => {
      const adapter = makeAdapter(makeMockRpc({
        'sig1': { confirmationStatus: 'confirmed', err: { err: 'transaction failed' } },
        'sig2': { confirmationStatus: 'finalized', err: { err: 'instruction error' } },
      }));

      const result = await adapter.reconcileExecution([
        makeRef('sig1', 'swap-assets'),
        makeRef('sig2', 'remove-liquidity'),
      ]);

      expect(result.finalState).toEqual({ kind: 'failed' });
      expect(result.confirmedSteps).toEqual([]);
    });
  });
});

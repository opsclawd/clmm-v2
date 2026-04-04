/**
 * Contract test: any TriggerRepository implementation must satisfy these behaviors.
 * Import this in adapter-specific test files and pass the real adapter under test.
 */
import { describe, it, expect } from 'vitest';
import type { TriggerRepository } from '@clmm/application';
import type { ExitTriggerId, WalletId } from '@clmm/domain';

export function runTriggerRepositoryContract(
  factory: () => TriggerRepository,
): void {
  describe('TriggerRepository contract', () => {
    it('returns null for unknown trigger', async () => {
      const repo = factory();
      const result = await repo.getTrigger('nonexistent' as ExitTriggerId);
      expect(result).toBeNull();
    });

    it('lists actionable triggers', async () => {
      const repo = factory();
      const result = await repo.listActionableTriggers('wallet-contract-1' as WalletId);
      expect(Array.isArray(result)).toBe(true);
    });

    it('deletes missing trigger without throwing', async () => {
      const repo = factory();
      await expect(repo.deleteTrigger('missing-trigger' as ExitTriggerId)).resolves.toBeUndefined();
    });
  });
}

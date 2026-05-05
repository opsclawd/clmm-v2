import { describe, it, expect } from 'vitest';
import { WalletChallengePostgresAdapter } from './WalletChallengePostgresAdapter.js';

describe('WalletChallengePostgresAdapter (unit shape)', () => {
  it('implements issue, get, and consumeAndEnrollIfMatches', () => {
    const methods = ['issue', 'get', 'consumeAndEnrollIfMatches'] as const;
    for (const method of methods) {
      expect(
        typeof WalletChallengePostgresAdapter.prototype[
          method as keyof WalletChallengePostgresAdapter
        ],
      ).toBe('function');
    }
  });
});

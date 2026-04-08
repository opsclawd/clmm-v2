import { describe, it, expect } from 'vitest';
import { MonitoredWalletStorageAdapter } from './MonitoredWalletStorageAdapter.js';

// These tests use a minimal in-memory approach.
// For CI, use a real test Postgres or the fake.
// Here we test the adapter shape against the port contract.

describe('MonitoredWalletStorageAdapter (unit shape)', () => {
  it('implements enroll, unenroll, listActiveWallets, markScanned', () => {
    // Verify the adapter class has the expected methods
    const methods = ['enroll', 'unenroll', 'listActiveWallets', 'markScanned'] as const;
    for (const method of methods) {
      expect(typeof MonitoredWalletStorageAdapter.prototype[method as keyof MonitoredWalletStorageAdapter]).toBe('function');
    }
  });
});

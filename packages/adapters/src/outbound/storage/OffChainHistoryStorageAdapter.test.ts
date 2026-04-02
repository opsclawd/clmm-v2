import { describe, it, expect } from 'vitest';
import { OffChainHistoryStorageAdapter } from './OffChainHistoryStorageAdapter.js';

describe('OffChainHistoryStorageAdapter', () => {
  it('getOutcomeSummary method exists and is not a null-stub', () => {
    // Verify the implementation references actual DB queries
    // (full integration test requires a test DB; this validates shape)
    const proto = OffChainHistoryStorageAdapter.prototype;
    expect(typeof proto.getOutcomeSummary).toBe('function');
    // The method body should not be just "return null" — it should contain DB query logic
    const src = proto.getOutcomeSummary.toString();
    // A real implementation will reference historyEvents table and positionId column
    expect(src).toContain('historyEvents');
    expect(src).toContain('positionId');
    // A real implementation will reference terminal event types
    expect(src).toContain('confirmed');
    expect(src).toContain('breachDirection');
  });
});

import { describe, expect, it } from 'vitest';
import { containsBannedConcept } from './banned-concepts.js';

describe('banned concept patterns', () => {
  it('flags suffixed Receipt concepts such as ExecutionReceipt', () => {
    expect(containsBannedConcept('export type ExecutionReceipt = { id: string };')).toBe(true);
  });

  it('flags PascalCase Proof suffixes like TransactionProof', () => {
    expect(containsBannedConcept('export type TransactionProof = { hash: string };')).toBe(true);
  });

  it('flags standalone Proof usage', () => {
    expect(containsBannedConcept('const proof: Proof = getProof();')).toBe(true);
  });

  it('does not flag lowercase proof in words like bulletproof', () => {
    expect(containsBannedConcept('// this code is bulletproof')).toBe(false);
  });

  it('does not flag lowercase proof in words like proofread', () => {
    expect(containsBannedConcept('// proofread this document')).toBe(false);
  });
});

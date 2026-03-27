import { describe, expect, it } from 'vitest';
import { containsBannedConcept } from './banned-concepts.js';

describe('banned concept patterns', () => {
  it('flags suffixed Receipt concepts such as ExecutionReceipt', () => {
    expect(containsBannedConcept('export type ExecutionReceipt = { id: string };')).toBe(true);
  });
});

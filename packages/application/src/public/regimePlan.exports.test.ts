import { describe, expect, it } from 'vitest';
import { parseRegimePlanResponse, parseRegimeExecutionResult } from './index.js';

describe('regimePlan public exports', () => {
  it('exports parseRegimePlanResponse and parseRegimeExecutionResult', () => {
    expect(typeof parseRegimePlanResponse).toBe('function');
    expect(typeof parseRegimeExecutionResult).toBe('function');
  });
});

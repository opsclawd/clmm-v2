import { describe, expect, it } from 'vitest';
import { queryClient } from './queryClient';

describe('queryClient', () => {
  it('disables automatic retries by default', () => {
    expect(queryClient.getDefaultOptions().queries?.retry).toBe(false);
  });
});

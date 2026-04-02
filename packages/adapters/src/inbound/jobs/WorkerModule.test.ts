import { describe, it, expect } from 'vitest';

describe('WorkerModule bootstrap', () => {
  it('loads without importing browser-only notification modules', async () => {
    await expect(import('./WorkerModule.js')).resolves.toBeDefined();
  });
});

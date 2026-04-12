import { describe, it, expect } from 'vitest';
import { HealthController } from './HealthController.js';

describe('HealthController', () => {
  const controller = new HealthController();

  it('returns ok status', () => {
    const result = controller.health();
    expect(result).toEqual({ status: 'ok' });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const bossInstances: FakePgBoss[] = [];

class FakePgBoss extends EventEmitter {
  constructor(public readonly config: { connectionString: string }) {
    super();
    bossInstances.push(this);
  }
}

vi.mock('pg-boss', () => ({
  PgBoss: FakePgBoss,
}));

describe('createPgBossProvider', () => {
  beforeEach(() => {
    bossInstances.length = 0;
    vi.restoreAllMocks();
  });

  it('logs pg-boss internal error and warning events', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { createPgBossProvider } = await import('./PgBossProvider.js');

    createPgBossProvider('postgresql://example.test/clmm');

    const boss = bossInstances[0]!;
    boss.emit('error', new Error('cron loop failed'));
    boss.emit('warning', { type: 'clock_skew', message: 'clock skew detected' });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('pg-boss error');
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('cron loop failed');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('pg-boss warning');
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('clock skew detected');
  });
});

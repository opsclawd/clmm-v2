import type { ObservabilityPort } from '@clmm/application';

type LogEntry = {
  level: 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown> | undefined;
};

type TimingEntry = {
  event: string;
  durationMs: number;
  tags?: Record<string, string> | undefined;
};

export class FakeObservabilityPort implements ObservabilityPort {
  readonly logs: LogEntry[] = [];
  readonly timings: TimingEntry[] = [];

  log(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>): void {
    this.logs.push({ level, message, context });
  }

  recordTiming(event: string, durationMs: number, tags?: Record<string, string>): void {
    this.timings.push({ event, durationMs, tags });
  }
}

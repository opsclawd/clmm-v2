import type { ClockPort } from '@clmm/application';
import type { ClockTimestamp } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';

export class FakeClockPort implements ClockPort {
  private _now: ClockTimestamp;

  constructor(initialMs = 1_000_000) {
    this._now = makeClockTimestamp(initialMs);
  }

  now(): ClockTimestamp {
    return this._now;
  }

  advance(ms: number): void {
    this._now = makeClockTimestamp(this._now + ms);
  }

  set(ms: number): void {
    this._now = makeClockTimestamp(ms);
  }
}

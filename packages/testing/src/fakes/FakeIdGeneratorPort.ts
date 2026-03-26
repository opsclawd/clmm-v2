import type { IdGeneratorPort } from '@clmm/application';

export class FakeIdGeneratorPort implements IdGeneratorPort {
  private _counter = 0;
  private readonly _prefix: string;

  constructor(prefix = 'fake') {
    this._prefix = prefix;
  }

  generateId(): string {
    this._counter++;
    return `${this._prefix}-${this._counter}`;
  }
}

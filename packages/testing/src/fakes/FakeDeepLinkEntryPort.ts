import type { DeepLinkEntryPort, DeepLinkMetadata } from '@clmm/application';

export class FakeDeepLinkEntryPort implements DeepLinkEntryPort {
  private _nextResult: DeepLinkMetadata = { kind: 'unknown' };

  setNextResult(metadata: DeepLinkMetadata): void {
    this._nextResult = metadata;
  }

  parseDeepLink(_url: string): DeepLinkMetadata {
    return this._nextResult;
  }
}

import type { DeepLinkEntryPort, DeepLinkMetadata } from '@clmm/application';
import type { PositionId, ExitTriggerId } from '@clmm/domain';

export class ExpoDeepLinkAdapter implements DeepLinkEntryPort {
  parseDeepLink(url: string): DeepLinkMetadata {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\//, '');
    const parts = path.split('/');

    if (parts[0] === 'preview' && parts[1] && parts[2]) {
      return {
        kind: 'preview',
        triggerId: parts[1] as ExitTriggerId,
        positionId: parts[2] as PositionId,
      };
    }
    if (parts[0] === 'history' && parts[1]) {
      return { kind: 'history', positionId: parts[1] as PositionId };
    }
    return { kind: 'unknown' };
  }
}

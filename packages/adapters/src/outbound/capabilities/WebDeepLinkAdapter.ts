/**
 * WebDeepLinkAdapter
 *
 * Parses deep links for web/PWA context.
 * Handles clmmv2:// scheme deep links.
 */
import type { DeepLinkEntryPort, DeepLinkMetadata } from '@clmm/application';
import type { PositionId, ExitTriggerId } from '@clmm/domain';

export class WebDeepLinkAdapter implements DeepLinkEntryPort {
  parseDeepLink(url: string): DeepLinkMetadata {
    try {
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
      if (parts[0] === 'trigger' && parts[1]) {
        const triggerId = parts[1] as ExitTriggerId;
        const positionId = parts[2] as PositionId | undefined;
        return positionId
          ? { kind: 'trigger', triggerId, positionId }
          : { kind: 'trigger', triggerId };
      }
    } catch {
      // Invalid URL, return unknown
    }
    return { kind: 'unknown' };
  }
}
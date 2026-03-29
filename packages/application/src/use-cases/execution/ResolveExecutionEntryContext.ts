import type { DeepLinkEntryPort } from '../../ports/index.js';
import type { EntryContextDto } from '../../dto/index.js';

export function resolveExecutionEntryContext(params: {
  url: string;
  deepLinkPort: DeepLinkEntryPort;
}): EntryContextDto {
  const { url, deepLinkPort } = params;
  const metadata = deepLinkPort.parseDeepLink(url);

  switch (metadata.kind) {
    case 'trigger':
      if (metadata.positionId && metadata.triggerId) {
        return {
          kind: 'trigger-preview',
          positionId: metadata.positionId,
          triggerId: metadata.triggerId,
        };
      }
      return { kind: 'degraded-recovery', reason: 'Trigger deep link missing required parameters' };

    case 'preview':
      if (metadata.positionId && metadata.triggerId) {
        return {
          kind: 'trigger-preview',
          positionId: metadata.positionId,
          triggerId: metadata.triggerId,
        };
      }
      return { kind: 'degraded-recovery', reason: 'Preview deep link missing required parameters' };

    case 'history':
      if (metadata.positionId) {
        return {
          kind: 'history',
          positionId: metadata.positionId,
        };
      }
      return { kind: 'degraded-recovery', reason: 'History deep link missing positionId' };

    case 'unknown':
      return { kind: 'degraded-recovery', reason: 'Unrecognized deep link format' };

    default: {
      const _exhaustive: never = metadata.kind;
      return { kind: 'degraded-recovery', reason: `Unhandled deep link kind: ${String(_exhaustive)}` };
    }
  }
}

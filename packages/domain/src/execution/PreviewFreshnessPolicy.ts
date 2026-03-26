import type { PreviewFreshness } from './index.js';

const PREVIEW_TTL_MS = 60_000;
const PREVIEW_STALE_AFTER_MS = 30_000;

export function evaluatePreviewFreshness(
  estimatedAt: number,
  now: number,
): PreviewFreshness {
  const age = now - estimatedAt;

  if (age > PREVIEW_TTL_MS) {
    return { kind: 'expired' };
  }

  if (age > PREVIEW_STALE_AFTER_MS) {
    return { kind: 'stale' };
  }

  return { kind: 'fresh', expiresAt: estimatedAt + PREVIEW_TTL_MS };
}

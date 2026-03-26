import { describe, it, expect } from 'vitest';
import { evaluatePreviewFreshness } from './PreviewFreshnessPolicy.js';

const PREVIEW_TTL_MS = 60_000; // 60 seconds

describe('PreviewFreshnessPolicy', () => {
  const estimatedAt = 1_000_000;

  it('returns fresh when within TTL', () => {
    const now = estimatedAt + 30_000;
    const result = evaluatePreviewFreshness(estimatedAt, now);
    expect(result.kind).toBe('fresh');
  });

  it('returns stale when past half-TTL but within TTL', () => {
    const now = estimatedAt + 45_000;
    const result = evaluatePreviewFreshness(estimatedAt, now);
    expect(result.kind).toBe('stale');
  });

  it('returns expired when past TTL', () => {
    const now = estimatedAt + PREVIEW_TTL_MS + 1;
    const result = evaluatePreviewFreshness(estimatedAt, now);
    expect(result.kind).toBe('expired');
  });

  it('fresh result includes expiresAt', () => {
    const now = estimatedAt + 10_000;
    const result = evaluatePreviewFreshness(estimatedAt, now);
    expect(result.kind).toBe('fresh');
    if (result.kind === 'fresh') {
      expect(result.expiresAt).toBe(estimatedAt + PREVIEW_TTL_MS);
    }
  });
});

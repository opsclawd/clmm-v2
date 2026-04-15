import { describe, expect, it } from 'vitest';
import {
  buildExecutionPath,
  buildPositionDetailPath,
  buildPreviewPath,
  buildSigningPath,
} from './appRoutes';

describe('appRoutes', () => {
  it('builds a static position detail path with query params', () => {
    expect(buildPositionDetailPath({ positionId: 'pos-123' })).toBe('/position?id=pos-123');
    expect(buildPositionDetailPath({ positionId: 'pos-123', triggerId: 'trig-456' })).toBe(
      '/position?id=pos-123&triggerId=trig-456',
    );
  });

  it('builds a static preview path with query params', () => {
    expect(buildPreviewPath({ triggerId: 'trig-456' })).toBe('/preview?triggerId=trig-456');
  });

  it('builds a static signing path with query params', () => {
    expect(
      buildSigningPath({
        attemptId: 'attempt-123',
        previewId: 'prev-456',
        triggerId: 'trig-789',
        episodeId: 'ep-000',
      }),
    ).toBe('/signing?attemptId=attempt-123&previewId=prev-456&triggerId=trig-789&episodeId=ep-000');
  });

  it('builds a static execution path with query params', () => {
    expect(buildExecutionPath({ attemptId: 'attempt-123' })).toBe('/execution?attemptId=attempt-123');
  });
});

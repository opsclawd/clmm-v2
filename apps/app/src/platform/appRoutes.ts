function buildQueryPath(pathname: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value != null && value.length > 0) {
      search.set(key, value);
    }
  }

  const query = search.toString();
  return query.length > 0 ? `${pathname}?${query}` : pathname;
}

export function buildPositionDetailPath(params: {
  positionId: string;
  triggerId?: string;
}): string {
  return buildQueryPath('/position', {
    id: params.positionId,
    triggerId: params.triggerId,
  });
}

export function buildPreviewPath(params: { triggerId: string }): string {
  return buildQueryPath('/preview', {
    triggerId: params.triggerId,
  });
}

export function buildSigningPath(params: {
  attemptId: string;
  previewId?: string;
  triggerId?: string;
  episodeId?: string;
}): string {
  return buildQueryPath('/signing', {
    attemptId: params.attemptId,
    previewId: params.previewId,
    triggerId: params.triggerId,
    episodeId: params.episodeId,
  });
}

export function buildExecutionPath(params: { attemptId: string }): string {
  return buildQueryPath('/execution', {
    attemptId: params.attemptId,
  });
}

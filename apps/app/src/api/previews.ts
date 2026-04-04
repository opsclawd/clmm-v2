import type { ExecutionPreviewDto } from '@clmm/application/public';
import { fetchJson, getBffBaseUrl } from './http';

type PreviewResponse = {
  preview: ExecutionPreviewDto;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function fetchPreview(previewId: string): Promise<ExecutionPreviewDto> {
  try {
    const payload = (await fetchJson(`/previews/${previewId}`)) as Partial<PreviewResponse>;
    if (!payload.preview) {
      throw new Error('Malformed preview response');
    }
    return payload.preview;
  } catch (cause: unknown) {
    throw new Error('Could not load execution preview', { cause });
  }
}

export async function refreshPreview(triggerId: string): Promise<ExecutionPreviewDto> {
  try {
    const response = await fetch(`${getBffBaseUrl()}/previews/${triggerId}/refresh`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = (await response.json()) as Partial<PreviewResponse>;
    if (!payload.preview) {
      throw new Error('Malformed refresh response');
    }
    return payload.preview;
  } catch (cause: unknown) {
    throw new Error('Could not refresh preview', { cause });
  }
}

export async function createPreview(triggerId: string): Promise<ExecutionPreviewDto> {
  try {
    const payload = await fetchJson(`/previews/${triggerId}`, { method: 'POST' });
    if (!isRecord(payload) || !isRecord(payload['preview'])) {
      throw new Error('Invalid create-preview response');
    }
    return payload['preview'] as ExecutionPreviewDto;
  } catch (cause: unknown) {
    throw new Error('Could not create preview', { cause });
  }
}

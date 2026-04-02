import type { ExecutionPreviewDto } from '@clmm/application/public';
import { fetchJson, getBffBaseUrl } from './http.js';

type PreviewResponse = {
  preview: ExecutionPreviewDto;
};

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

import type { ExecutionPreviewDto } from '@clmm/application/public';
import { buildPreviewViewModel, type PreviewViewModel } from '../view-models/PreviewViewModel.js';

export type PreviewPresentation = {
  preview: PreviewViewModel;
  canProceed: boolean;
  warningMessage?: string;
};

export function presentPreview(dto: ExecutionPreviewDto): PreviewPresentation {
  const preview = buildPreviewViewModel(dto);

  if (preview.isExpired) {
    return {
      preview,
      canProceed: preview.canSign,
      warningMessage: 'Quote has expired. You must refresh before proceeding.',
    };
  }

  if (preview.isStale) {
    return {
      preview,
      canProceed: preview.canSign,
      warningMessage: 'Quote is stale. Refresh before signing to get the latest rate.',
    };
  }

  return {
    preview,
    canProceed: preview.canSign,
  };
}

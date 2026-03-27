/**
 * PreviewController
 *
 * Handles execution preview HTTP endpoints for the NestJS BFF.
 */
import { Controller, Get, Param, Post } from '@nestjs/common';

@Controller('previews')
export class PreviewController {
  constructor(
    // TODO: inject use case facades in Epic 5 composition
  ) {}

  @Get(':previewId')
  getPreview(@Param('previewId') _previewId: string) {
    // TODO: invoke GetExecutionPreview use case
    return { preview: null };
  }

  @Post(':triggerId/refresh')
  refreshPreview(@Param('triggerId') _triggerId: string) {
    // TODO: invoke RefreshExecutionPreview use case
    return { preview: null };
  }
}

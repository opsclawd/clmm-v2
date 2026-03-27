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
  async getPreview(@Param('previewId') previewId: string) {
    // TODO: invoke GetExecutionPreview use case
    return { preview: null };
  }

  @Post(':triggerId/refresh')
  async refreshPreview(@Param('triggerId') triggerId: string) {
    // TODO: invoke RefreshExecutionPreview use case
    return { preview: null };
  }
}
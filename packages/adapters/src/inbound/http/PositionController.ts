import { Controller, Get, Param } from '@nestjs/common';

@Controller('positions')
export class PositionController {
  constructor(
    // TODO: inject use case facades in Epic 5 composition
  ) {}

  @Get(':walletId')
  listPositions(@Param('walletId') _walletId: string) {
    // TODO: invoke ListSupportedPositions use case
    return { positions: [] };
  }
}

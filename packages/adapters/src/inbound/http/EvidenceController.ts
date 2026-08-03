import { Controller, Get, Inject } from '@nestjs/common';
import type { EvidenceReadPort, EvidenceReadResult } from '@clmm/application';
import { EVIDENCE_READ_PORT } from './tokens.js';

@Controller('evidence')
export class EvidenceController {
  constructor(
    @Inject(EVIDENCE_READ_PORT)
    private readonly evidencePort: EvidenceReadPort,
  ) {}

  @Get('sol-usdc/current')
  async getCurrent() {
    const result = await this.evidencePort.fetchCurrent();
    return this.mapResult(result);
  }

  private mapResult(result: EvidenceReadResult) {
    switch (result.kind) {
      case 'block':
        return { evidence: result.block };
      case 'not-found':
        return { evidence: null, unavailableReason: 'not-found' as const };
      case 'store-unavailable':
        return { evidence: null, unavailableReason: 'store-unavailable' as const };
      case 'config-error':
        return { evidence: null, unavailableReason: 'config-error' as const };
      case 'malformed':
        return { evidence: null, unavailableReason: 'malformed' as const };
      case 'upstream-error':
        return { evidence: null, unavailableReason: 'upstream-error' as const };
    }
  }
}

import { Controller, Get, Inject } from '@nestjs/common';
import type { PolicyInsightsReadPort, PolicyInsightsReadResult } from '@clmm/application';
import { POLICY_INSIGHTS_READ_PORT } from './tokens.js';

@Controller('policy-insights')
export class PolicyInsightsController {
  constructor(
    @Inject(POLICY_INSIGHTS_READ_PORT)
    private readonly policyInsightsPort: PolicyInsightsReadPort,
  ) {}

  @Get('sol-usdc/current')
  async getCurrent() {
    const result = await this.policyInsightsPort.fetchCurrent();
    return this.mapResult(result);
  }

  private mapResult(result: PolicyInsightsReadResult) {
    switch (result.kind) {
      case 'block':
        return { policyInsight: result.block };
      case 'not-found':
        return { policyInsight: null, unavailableReason: 'not-found' as const };
      case 'store-unavailable':
        return { policyInsight: null, unavailableReason: 'store-unavailable' as const };
      case 'config-error':
        return { policyInsight: null, unavailableReason: 'config-error' as const };
      case 'upstream-error':
        return { policyInsight: null, unavailableReason: 'upstream-error' as const };
    }
  }
}

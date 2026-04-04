import type { BreachDirection } from '@clmm/application/public';
import { renderDirectionalPolicyText } from './DirectionalPolicyCardUtils.js';

export type StepLabel = {
  step: number;
  label: string;
  sublabel?: string;
};

export function buildPreviewStepLabels(direction: BreachDirection): StepLabel[] {
  const policy = renderDirectionalPolicyText(direction);
  return [
    { step: 1, label: 'Remove Liquidity', sublabel: 'Withdraw LP tokens from pool' },
    { step: 2, label: 'Collect Fees', sublabel: 'Claim accrued trading fees' },
    { step: 3, label: `Swap: ${policy.swapLabel}`, sublabel: policy.policyReason },
    { step: 4, label: `Result: ${policy.postureLabel}` },
  ];
}

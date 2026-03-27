import type { BreachDirection } from '@clmm/domain';
import { applyDirectionalExitPolicy } from '@clmm/domain';

export type DirectionalPolicyText = {
  swapLabel: string;
  postureLabel: string;
  directionLabel: string;
  policyReason: string;
};

export function renderDirectionalPolicyText(
  direction: BreachDirection,
): DirectionalPolicyText {
  const policy = applyDirectionalExitPolicy(direction);

  const directionLabel =
    direction.kind === 'lower-bound-breach' ? 'Price below range' : 'Price above range';

  switch (policy.postExitPosture.kind) {
    case 'exit-to-usdc':
      return {
        swapLabel: 'SOL → USDC',
        postureLabel: 'Exit to USDC',
        directionLabel,
        policyReason: 'Your position is fully in SOL. Exit to USDC.',
      };
    case 'exit-to-sol':
      return {
        swapLabel: 'USDC → SOL',
        postureLabel: 'Exit to SOL',
        directionLabel,
        policyReason: 'Your position is fully in USDC. Exit to SOL.',
      };
    default: {
      const _exhaustive: never = policy.postExitPosture;
      throw new Error(`Unhandled PostExitAssetPosture: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
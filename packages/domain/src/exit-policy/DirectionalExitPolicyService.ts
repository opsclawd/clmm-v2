/**
 * DirectionalExitPolicyService
 *
 * THE CORE PRODUCT INVARIANT — DO NOT RE-DERIVE ELSEWHERE.
 *
 * LowerBoundBreach → RemoveLiquidity → CollectFees → Swap SOL→USDC → ExitToUSDC
 * UpperBoundBreach → RemoveLiquidity → CollectFees → Swap USDC→SOL → ExitToSOL
 *
 * This mapping lives ONLY here. It must not be re-derived in adapters, UI, or
 * anywhere outside this file.
 */

import type { BreachDirection, PostExitAssetPosture } from '../shared/index.js';
import { EXIT_TO_USDC, EXIT_TO_SOL } from '../shared/index.js';
import type { ExecutionStep, SwapInstruction } from '../execution/index.js';

export type DirectionalExitPolicyResult = {
  readonly postExitPosture: PostExitAssetPosture;
  readonly swapInstruction: SwapInstruction;
  readonly executionStepSkeleton: readonly ExecutionStep[];
};

export function applyDirectionalExitPolicy(
  direction: BreachDirection,
): DirectionalExitPolicyResult {
  switch (direction.kind) {
    case 'lower-bound-breach': {
      const swapInstruction: SwapInstruction = {
        fromAsset: 'SOL',
        toAsset: 'USDC',
        policyReason:
          'lower-bound breach: position is fully in SOL; swap to USDC to exit directional exposure',
      };
      return {
        postExitPosture: EXIT_TO_USDC,
        swapInstruction,
        executionStepSkeleton: [
          { kind: 'remove-liquidity' },
          { kind: 'collect-fees' },
          { kind: 'swap-assets', instruction: swapInstruction },
        ],
      };
    }

    case 'upper-bound-breach': {
      const swapInstruction: SwapInstruction = {
        fromAsset: 'USDC',
        toAsset: 'SOL',
        policyReason:
          'upper-bound breach: position is fully in USDC; swap to SOL to exit directional exposure',
      };
      return {
        postExitPosture: EXIT_TO_SOL,
        swapInstruction,
        executionStepSkeleton: [
          { kind: 'remove-liquidity' },
          { kind: 'collect-fees' },
          { kind: 'swap-assets', instruction: swapInstruction },
        ],
      };
    }

    /* v8 ignore next 6 */
    default: {
      const _exhaustive: never = direction;
      throw new Error(
        `Unhandled BreachDirection: ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}
